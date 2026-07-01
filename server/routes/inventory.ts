import { Router } from 'express'
import db from '../db.js'

const router = Router()

// GET /api/inventory — full live grid (one row per batch+warehouse+packing_size)
router.get('/', (_req, res) => {
  const rows = db.prepare(`
    SELECT
      inv.id,
      it.color_name,
      it.hsn_code,
      b.batch_number,
      b.import_date,
      b.status         AS batch_status,
      w.id             AS warehouse_id,
      w.warehouse_name,
      inv.packing_size,
      inv.quantity_in_stock
    FROM inventory inv
    JOIN batches b    ON inv.batch_id     = b.id
    JOIN items it     ON b.item_id        = it.id
    JOIN warehouses w ON inv.warehouse_id = w.id
    ORDER BY it.color_name, b.import_date, w.warehouse_name, inv.packing_size
  `).all()
  res.json(rows)
})

// GET /api/inventory/colors — only items that have available stock
router.get('/colors', (_req, res) => {
  res.json(db.prepare(`
    SELECT DISTINCT i.id, i.color_name, i.hsn_code, i.item_image
    FROM items i
    JOIN batches b   ON b.item_id      = i.id
    JOIN inventory inv ON inv.batch_id = b.id
    WHERE b.status = 'Active' AND inv.quantity_in_stock > 0
    ORDER BY i.color_name
  `).all())
})

// GET /api/inventory/summary — grouped by color with totals
router.get('/summary', (_req, res) => {
  const rows = db.prepare(`
    SELECT
      it.color_name,
      it.item_image,
      b.batch_image,
      b.import_date,
      inv.quantity_in_stock,
      inv.packing_size,
      w.id             AS warehouse_id,
      w.warehouse_name,
      b.id             AS batch_id,
      b.batch_number,
      b.notes
    FROM inventory inv
    JOIN batches b    ON inv.batch_id     = b.id
    JOIN items it     ON b.item_id        = it.id
    JOIN warehouses w ON inv.warehouse_id = w.id
    WHERE inv.quantity_in_stock > 0
    ORDER BY it.color_name, w.warehouse_name, b.batch_number, inv.packing_size
  `).all() as {
    color_name: string
    item_image: string | null
    batch_image: string | null
    import_date: string
    quantity_in_stock: number
    packing_size: string
    warehouse_id: number
    warehouse_name: string
    batch_id: number
    batch_number: string
    notes: string
  }[]

  const map = new Map<string, {
    color_name: string
    item_image: string | null
    total_bags: number
    total_weight_kg: number
    lines: {
      warehouse_id: number
      warehouse_name: string
      batch_id: number
      batch_number: string
      packing_size: string
      quantity_in_stock: number
      notes: string
    }[]
  }>()
  // Track the most recently imported batch photo seen per color, to use as the group's
  // representative thumbnail — falls back to the item's default when no batch has its own photo.
  const latestBatchPhotoDate = new Map<string, string>()

  for (const r of rows) {
    if (!map.has(r.color_name)) {
      map.set(r.color_name, { color_name: r.color_name, item_image: r.item_image, total_bags: 0, total_weight_kg: 0, lines: [] })
    }
    const entry = map.get(r.color_name)!
    if (r.batch_image) {
      const latest = latestBatchPhotoDate.get(r.color_name)
      if (!latest || r.import_date > latest) {
        latestBatchPhotoDate.set(r.color_name, r.import_date)
        entry.item_image = r.batch_image
      }
    }
    const m = r.packing_size.match(/^(\d+(?:\.\d+)?)\s*kg/i)
    const kgPerBag = m ? parseFloat(m[1]) : 0
    entry.total_bags += r.quantity_in_stock
    entry.total_weight_kg += r.quantity_in_stock * kgPerBag
    entry.lines.push({
      warehouse_id: r.warehouse_id,
      warehouse_name: r.warehouse_name,
      batch_id: r.batch_id,
      batch_number: r.batch_number,
      packing_size: r.packing_size,
      quantity_in_stock: r.quantity_in_stock,
      notes: r.notes,
    })
  }

  res.json(Array.from(map.values()))
})

// GET /api/inventory/batches?colorName=&warehouseId= — per-warehouse rows for dispatch/transfer modals
router.get('/batches', (req, res) => {
  const { colorName, warehouseId } = req.query
  if (!colorName) return res.status(400).json({ error: 'colorName required' })

  const params: unknown[] = [colorName]
  const warehouseFilter = warehouseId ? 'AND inv.warehouse_id = ?' : ''
  if (warehouseId) params.push(warehouseId)

  const rows = db.prepare(`
    SELECT b.id, b.batch_number, b.import_date, b.status,
           w.id AS warehouse_id, w.warehouse_name,
           inv.packing_size,
           inv.quantity_in_stock,
           inv.id AS inv_id
    FROM batches b
    JOIN items it       ON b.item_id      = it.id
    JOIN inventory inv  ON inv.batch_id   = b.id
    JOIN warehouses w   ON inv.warehouse_id = w.id
    WHERE it.color_name = ? AND b.status = 'Active' AND inv.quantity_in_stock > 0
    ${warehouseFilter}
    ORDER BY b.import_date, w.warehouse_name, inv.packing_size
  `).all(...params)
  res.json(rows)
})

export default router
