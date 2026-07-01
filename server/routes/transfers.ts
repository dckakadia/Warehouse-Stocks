import { Router } from 'express'
import db from '../db.js'
import { requireEdit, requireDelete } from '../middleware/requireAuth.js'

const router = Router()

function posInt(v: unknown, name: string): number {
  const n = Number(v)
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${name} must be a positive integer`)
  return n
}

// POST /api/transfers — requires can_edit
router.post('/', requireEdit, (req, res) => {
  let from_warehouse_id: number, to_warehouse_id: number, batch_id: number, bags: number
  try {
    from_warehouse_id = posInt(req.body.from_warehouse_id, 'from_warehouse_id')
    to_warehouse_id   = posInt(req.body.to_warehouse_id,   'to_warehouse_id')
    batch_id          = posInt(req.body.batch_id,           'batch_id')
    bags              = posInt(req.body.bags,               'bags')
  } catch (e: unknown) {
    return res.status(400).json({ error: (e as Error).message })
  }

  const { notes = '' } = req.body
  const packing_size = typeof req.body.packing_size === 'string' ? req.body.packing_size.trim() : ''
  if (!packing_size) return res.status(400).json({ error: 'packing_size must be a non-empty string' })

  if (from_warehouse_id === to_warehouse_id) {
    return res.status(400).json({ error: 'Source and destination warehouse must differ' })
  }

  const doTransfer = db.transaction(() => {
    const src = db.prepare(
      'SELECT id, quantity_in_stock FROM inventory WHERE batch_id = ? AND warehouse_id = ? AND packing_size = ?'
    ).get(batch_id, from_warehouse_id, packing_size) as { id: number; quantity_in_stock: number } | undefined

    if (!src) throw new Error('No source inventory found for this batch / warehouse / pack size')
    if (src.quantity_in_stock < bags) {
      throw new Error(`Insufficient stock: only ${src.quantity_in_stock} bags available`)
    }

    db.prepare('UPDATE inventory SET quantity_in_stock = quantity_in_stock - ? WHERE id = ?')
      .run(bags, src.id)

    db.prepare(`
      INSERT INTO inventory (batch_id, warehouse_id, packing_size, quantity_in_stock)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(batch_id, warehouse_id, packing_size) DO UPDATE SET
        quantity_in_stock = quantity_in_stock + excluded.quantity_in_stock
    `).run(batch_id, to_warehouse_id, packing_size, bags)

    const r = db.prepare(`
      INSERT INTO stock_transfers (from_warehouse_id, to_warehouse_id, batch_id, packing_size, bags, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(from_warehouse_id, to_warehouse_id, batch_id, packing_size, bags, notes)

    return r.lastInsertRowid
  })

  try {
    const transferId = doTransfer()
    const transfer = db.prepare(`
      SELECT st.*,
             fw.warehouse_name AS from_warehouse_name,
             tw.warehouse_name AS to_warehouse_name,
             b.batch_number,
             it.color_name
      FROM stock_transfers st
      JOIN warehouses fw ON st.from_warehouse_id = fw.id
      JOIN warehouses tw ON st.to_warehouse_id   = tw.id
      JOIN batches b     ON st.batch_id          = b.id
      JOIN items it      ON b.item_id            = it.id
      WHERE st.id = ?
    `).get(transferId)
    res.status(201).json(transfer)
  } catch (err: unknown) {
    res.status(409).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
})

// GET /api/transfers — full transfer history
router.get('/', (_req, res) => {
  const rows = db.prepare(`
    SELECT st.*,
           fw.warehouse_name AS from_warehouse_name,
           tw.warehouse_name AS to_warehouse_name,
           b.batch_number,
           it.color_name
    FROM stock_transfers st
    JOIN warehouses fw ON st.from_warehouse_id = fw.id
    JOIN warehouses tw ON st.to_warehouse_id   = tw.id
    JOIN batches b     ON st.batch_id          = b.id
    JOIN items it      ON b.item_id            = it.id
    ORDER BY st.transferred_at DESC
  `).all()
  res.json(rows)
})

// PUT /api/transfers/:id — edit bags/notes, reconciling inventory in both warehouses
router.put('/:id', requireEdit, (req, res) => {
  const id = Number(req.params.id)
  const { bags, notes } = req.body as { bags?: number; notes?: string }

  try {
    db.transaction(() => {
      const transfer = db.prepare('SELECT * FROM stock_transfers WHERE id = ?').get(id) as {
        id: number; from_warehouse_id: number; to_warehouse_id: number
        batch_id: number; packing_size: string; bags: number; notes: string
      } | undefined
      if (!transfer) throw new Error('Transfer not found')

      const newBags = bags != null ? Math.round(Number(bags)) : transfer.bags
      if (!Number.isInteger(newBags) || newBags <= 0) throw new Error('Bags must be a positive integer')
      const newNotes = notes ?? transfer.notes
      const delta = newBags - transfer.bags

      if (delta !== 0) {
        const src = db.prepare(
          'SELECT id, quantity_in_stock FROM inventory WHERE batch_id = ? AND warehouse_id = ? AND packing_size = ?'
        ).get(transfer.batch_id, transfer.from_warehouse_id, transfer.packing_size) as { id: number; quantity_in_stock: number } | undefined
        const dest = db.prepare(
          'SELECT id FROM inventory WHERE batch_id = ? AND warehouse_id = ? AND packing_size = ?'
        ).get(transfer.batch_id, transfer.to_warehouse_id, transfer.packing_size) as { id: number } | undefined
        if (!src || !dest) throw new Error('Source or destination inventory line no longer exists — cannot reconcile stock')
        if (delta > 0 && src.quantity_in_stock < delta) {
          throw new Error(`Insufficient stock at source warehouse: only ${src.quantity_in_stock} additional bags available`)
        }

        // Both rows confirmed to exist — plain UPDATE avoids SQLite validating a negative literal
        // against the CHECK constraint before UPSERT conflict resolution would even apply
        db.prepare('UPDATE inventory SET quantity_in_stock = quantity_in_stock - ? WHERE id = ?').run(delta, src.id)
        db.prepare('UPDATE inventory SET quantity_in_stock = quantity_in_stock + ? WHERE id = ?').run(delta, dest.id)
      }

      db.prepare('UPDATE stock_transfers SET bags = ?, notes = ? WHERE id = ?').run(newBags, newNotes, id)
    })()
    return res.json({ success: true })
  } catch (err: unknown) {
    return res.status(409).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
})

// DELETE /api/transfers/:id — reverse the transfer (restore source, deduct destination)
router.delete('/:id', requireDelete, (req, res) => {
  const id = Number(req.params.id)
  try {
    db.transaction(() => {
      const transfer = db.prepare('SELECT * FROM stock_transfers WHERE id = ?').get(id) as {
        id: number; from_warehouse_id: number; to_warehouse_id: number
        batch_id: number; packing_size: string; bags: number
      } | undefined
      if (!transfer) throw new Error('Transfer not found')

      const src = db.prepare(
        'SELECT id FROM inventory WHERE batch_id = ? AND warehouse_id = ? AND packing_size = ?'
      ).get(transfer.batch_id, transfer.from_warehouse_id, transfer.packing_size) as { id: number } | undefined
      const dest = db.prepare(
        'SELECT id, quantity_in_stock FROM inventory WHERE batch_id = ? AND warehouse_id = ? AND packing_size = ?'
      ).get(transfer.batch_id, transfer.to_warehouse_id, transfer.packing_size) as { id: number; quantity_in_stock: number } | undefined
      if (!src || !dest) throw new Error('Source or destination inventory line no longer exists — cannot reconcile stock')
      if (dest.quantity_in_stock < transfer.bags) {
        throw new Error(`Cannot delete: destination warehouse only has ${dest.quantity_in_stock} bags remaining (some may have been dispatched or transferred onward)`)
      }

      db.prepare('UPDATE inventory SET quantity_in_stock = quantity_in_stock + ? WHERE id = ?').run(transfer.bags, src.id)
      db.prepare('UPDATE inventory SET quantity_in_stock = quantity_in_stock - ? WHERE id = ?').run(transfer.bags, dest.id)

      db.prepare('DELETE FROM stock_transfers WHERE id = ?').run(id)
    })()
    return res.json({ success: true })
  } catch (err: unknown) {
    return res.status(409).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
})

export default router
