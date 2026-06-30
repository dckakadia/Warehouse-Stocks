import { Router } from 'express'
import db from '../db.js'

const router = Router()

// POST /api/transfers — atomically deduct source + upsert destination + log
router.post('/', (req, res) => {
  const { from_warehouse_id, to_warehouse_id, batch_id, packing_size, bags, notes = '' } = req.body
  if (!from_warehouse_id || !to_warehouse_id || !batch_id || !packing_size || !bags) {
    return res.status(400).json({ error: 'from_warehouse_id, to_warehouse_id, batch_id, packing_size, bags required' })
  }
  if (Number(from_warehouse_id) === Number(to_warehouse_id)) {
    return res.status(400).json({ error: 'Source and destination warehouse must differ' })
  }
  if (!['20kg', '25kg'].includes(packing_size)) {
    return res.status(400).json({ error: 'packing_size must be 20kg or 25kg' })
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
      INSERT INTO inventory (batch_id, warehouse_id, packing_size, quantity_in_stock, godown_rack_location)
      VALUES (?, ?, ?, ?, '')
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

// GET /api/transfers — last 50 transfers
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
    LIMIT 50
  `).all()
  res.json(rows)
})

export default router
