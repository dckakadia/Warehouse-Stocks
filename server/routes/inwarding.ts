import { Router } from 'express'
import db from '../db.js'

const router = Router()

// POST /api/inward
// Body: { color_name, batch_number, import_date, warehouse_id, entries: [{ packing_size, quantity }], item_image? }
router.post('/', (req, res) => {
  const { color_name, batch_number, import_date, warehouse_id, entries, item_image, notes, supplier_id } = req.body
  if (!color_name || !batch_number || !import_date || !warehouse_id || !Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({ error: 'color_name, batch_number, import_date, warehouse_id, and entries[] required' })
  }

  const inward = db.transaction(() => {
    const item = db.prepare('SELECT id FROM items WHERE color_name = ?').get(color_name) as { id: number } | undefined
    if (!item) throw new Error(`Unknown color: ${color_name}`)

    const warehouse = db.prepare('SELECT id FROM warehouses WHERE id = ?').get(warehouse_id) as { id: number } | undefined
    if (!warehouse) throw new Error(`Unknown warehouse id: ${warehouse_id}`)

    if (item_image) {
      db.prepare('UPDATE items SET item_image = ? WHERE id = ?').run(item_image, item.id)
    }

    const resolvedSupplierId = supplier_id ? Number(supplier_id) : null

    db.prepare(
      `INSERT INTO batches (item_id, batch_number, import_date, status, notes, supplier_id)
       VALUES (?, ?, ?, 'Active', ?, ?)
       ON CONFLICT(item_id, batch_number) DO UPDATE SET import_date=excluded.import_date, status='Active', notes=excluded.notes, supplier_id=excluded.supplier_id`
    ).run(item.id, batch_number, import_date, notes ?? '', resolvedSupplierId)

    const batch = db.prepare(
      'SELECT id FROM batches WHERE item_id = ? AND batch_number = ?'
    ).get(item.id, batch_number) as { id: number }

    const results = []
    for (const { packing_size, quantity } of entries) {
      if (!packing_size?.trim()) throw new Error('packing_size is required for each entry')
      if (quantity <= 0) continue
      db.prepare(
        `INSERT INTO inventory (batch_id, warehouse_id, packing_size, quantity_in_stock)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(batch_id, warehouse_id, packing_size) DO UPDATE SET
           quantity_in_stock = quantity_in_stock + excluded.quantity_in_stock`
      ).run(batch.id, warehouse_id, packing_size.trim(), quantity)
      results.push({ packing_size: packing_size.trim(), quantity, warehouse_id })
    }
    return { batch_id: batch.id, entries: results }
  })

  try {
    res.status(201).json(inward())
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
})

export default router
