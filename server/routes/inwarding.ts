import { Router } from 'express'
import db from '../db.js'
import { requireEdit } from '../middleware/requireAuth.js'

const router = Router()

function posInt(v: unknown, name: string): number {
  const n = Number(v)
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${name} must be a positive integer`)
  return n
}

// POST /api/inward — requires can_edit
router.post('/', requireEdit, (req, res) => {
  const { color_name, batch_number, import_date, warehouse_id, entries, batch_image, notes, supplier_id } = req.body

  if (!color_name?.trim() || !batch_number?.trim() || !import_date?.trim()) {
    return res.status(400).json({ error: 'color_name, batch_number, and import_date are required' })
  }
  if (!Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({ error: 'entries[] must be a non-empty array' })
  }

  // Validate warehouse_id
  let wid: number
  try { wid = posInt(warehouse_id, 'warehouse_id') } catch (e: unknown) {
    return res.status(400).json({ error: (e as Error).message })
  }

  // Validate all entries up-front — reject the whole request on any bad entry
  const validatedEntries: { packing_size: string; quantity: number }[] = []
  for (let i = 0; i < entries.length; i++) {
    const { packing_size, quantity } = entries[i] as { packing_size?: unknown; quantity?: unknown }
    const ps = typeof packing_size === 'string' ? packing_size.trim() : ''
    if (!ps) return res.status(400).json({ error: `Entry ${i + 1}: packing_size is required` })
    let qty: number
    try { qty = posInt(quantity, `Entry ${i + 1} quantity`) } catch (e: unknown) {
      return res.status(400).json({ error: (e as Error).message })
    }
    validatedEntries.push({ packing_size: ps, quantity: qty })
  }

  // Validate image if provided
  if (batch_image !== undefined && batch_image !== null) {
    if (typeof batch_image !== 'string' || !batch_image.startsWith('data:image/')) {
      return res.status(400).json({ error: 'batch_image must be a base64 data URI (data:image/...)' })
    }
  }

  const inward = db.transaction(() => {
    const item = db.prepare('SELECT id, item_image FROM items WHERE color_name = ?').get(color_name.trim()) as { id: number; item_image: string | null } | undefined
    if (!item) throw new Error(`Unknown color: ${color_name}`)

    const warehouse = db.prepare('SELECT id FROM warehouses WHERE id = ?').get(wid) as { id: number } | undefined
    if (!warehouse) throw new Error(`Unknown warehouse id: ${wid}`)

    // The photo belongs to this batch, not the color in general — only backfill the item's
    // own default image if it has never had one, so it has something to show when browsing colors.
    if (batch_image && !item.item_image) {
      db.prepare('UPDATE items SET item_image = ? WHERE id = ?').run(batch_image, item.id)
    }

    const resolvedSupplierId = supplier_id ? Number(supplier_id) : null

    const existing = db.prepare(
      'SELECT id, status FROM batches WHERE item_id = ? AND batch_number = ?'
    ).get(item.id, batch_number.trim()) as { id: number; status: string } | undefined

    db.prepare(
      `INSERT INTO batches (item_id, batch_number, import_date, status, notes, supplier_id)
       VALUES (?, ?, ?, 'Active', ?, ?)
       ON CONFLICT(item_id, batch_number) DO UPDATE SET
         import_date  = excluded.import_date,
         status       = 'Active',
         notes        = excluded.notes,
         supplier_id  = excluded.supplier_id`
    ).run(item.id, batch_number.trim(), import_date.trim(), notes ?? '', resolvedSupplierId)

    // Warn in response if a previously depleted batch was reactivated
    const reactivated = existing?.status === 'Depleted'

    const batch = db.prepare(
      'SELECT id FROM batches WHERE item_id = ? AND batch_number = ?'
    ).get(item.id, batch_number.trim()) as { id: number }

    // Non-destructive: this endpoint creates batches / adds stock, it isn't the dedicated photo
    // editor. Fill the photo only if the batch doesn't already have its own — never overwrite an
    // existing batch's photo just because a later inward submission carried the color's default image.
    if (batch_image) {
      db.prepare('UPDATE batches SET batch_image = COALESCE(batch_image, ?) WHERE id = ?').run(batch_image, batch.id)
    }

    const results = []
    for (const { packing_size, quantity } of validatedEntries) {
      db.prepare(
        `INSERT INTO inventory (batch_id, warehouse_id, packing_size, quantity_in_stock, original_quantity)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(batch_id, warehouse_id, packing_size) DO UPDATE SET
           quantity_in_stock = quantity_in_stock + excluded.quantity_in_stock,
           original_quantity = original_quantity + excluded.quantity_in_stock`
      ).run(batch.id, wid, packing_size, quantity, quantity)
      results.push({ packing_size, quantity, warehouse_id: wid })
    }
    return { batch_id: batch.id, entries: results, reactivated }
  })

  try {
    res.status(201).json(inward())
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
})

export default router
