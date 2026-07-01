import { Router } from 'express'
import db from '../db.js'

const router = Router()

interface InwardJoinRow {
  batch_id: number; batch_number: string; import_date: string
  color_name: string; item_image: string | null
  supplier_id: number | null; supplier_name: string | null
  warehouse_name: string; packing_size: string; quantity_in_stock: number
}

// GET /api/reports/daily?from=YYYY-MM-DD&to=YYYY-MM-DD — defaults both to today
router.get('/daily', (req, res) => {
  const today = new Date().toISOString().slice(0, 10)
  const from = typeof req.query.from === 'string' && req.query.from ? req.query.from : today
  const to   = typeof req.query.to   === 'string' && req.query.to   ? req.query.to   : today

  const inwardRows = db.prepare(`
    SELECT
      b.id AS batch_id, b.batch_number, b.import_date,
      it.color_name, COALESCE(b.batch_image, it.item_image) AS item_image,
      b.supplier_id, s.supplier_name,
      w.warehouse_name, inv.packing_size, inv.quantity_in_stock
    FROM batches b
    JOIN items it     ON b.item_id  = it.id
    JOIN inventory inv ON inv.batch_id = b.id
    JOIN warehouses w  ON inv.warehouse_id = w.id
    LEFT JOIN suppliers s ON b.supplier_id = s.id
    WHERE b.import_date BETWEEN ? AND ?
    ORDER BY b.import_date DESC, b.id DESC
  `).all(from, to) as InwardJoinRow[]

  const inwardMap = new Map<number, {
    batch_id: number; batch_number: string; import_date: string
    color_name: string; item_image: string | null
    supplier_id: number | null; supplier_name: string | null
    total_bags: number
    lines: { warehouse_name: string; packing_size: string; quantity_in_stock: number }[]
  }>()
  for (const r of inwardRows) {
    let entry = inwardMap.get(r.batch_id)
    if (!entry) {
      entry = {
        batch_id: r.batch_id, batch_number: r.batch_number, import_date: r.import_date,
        color_name: r.color_name, item_image: r.item_image,
        supplier_id: r.supplier_id, supplier_name: r.supplier_name,
        total_bags: 0, lines: [],
      }
      inwardMap.set(r.batch_id, entry)
    }
    entry.total_bags += r.quantity_in_stock
    entry.lines.push({ warehouse_name: r.warehouse_name, packing_size: r.packing_size, quantity_in_stock: r.quantity_in_stock })
  }
  const inward = Array.from(inwardMap.values())

  const outward = db.prepare(`
    SELECT
      d.id, d.created_at, d.packing_size, d.bags_dispatched, d.status,
      c.customer_name, c.contact_number,
      b.batch_number, it.color_name, COALESCE(b.batch_image, it.item_image) AS item_image,
      w.warehouse_name
    FROM dispatch_orders d
    JOIN customers c  ON d.customer_id  = c.id
    JOIN batches b    ON d.batch_id     = b.id
    JOIN items it     ON b.item_id      = it.id
    JOIN warehouses w ON d.warehouse_id = w.id
    WHERE substr(d.created_at, 1, 10) BETWEEN ? AND ? AND d.status != 'Cancelled'
    ORDER BY d.created_at DESC
  `).all(from, to)

  const transfers = db.prepare(`
    SELECT
      st.id, st.transferred_at, st.packing_size, st.bags, st.notes,
      fw.warehouse_name AS from_warehouse_name, tw.warehouse_name AS to_warehouse_name,
      b.batch_number, it.color_name, COALESCE(b.batch_image, it.item_image) AS item_image
    FROM stock_transfers st
    JOIN warehouses fw ON st.from_warehouse_id = fw.id
    JOIN warehouses tw ON st.to_warehouse_id   = tw.id
    JOIN batches b     ON st.batch_id          = b.id
    JOIN items it      ON b.item_id            = it.id
    WHERE substr(st.transferred_at, 1, 10) BETWEEN ? AND ?
    ORDER BY st.transferred_at DESC
  `).all(from, to) as { bags: number }[]

  const totals = {
    inward_batches: inward.length,
    inward_bags: inward.reduce((s, b) => s + b.total_bags, 0),
    outward_orders: outward.length,
    outward_bags: (outward as { bags_dispatched: number }[]).reduce((s, o) => s + o.bags_dispatched, 0),
    transfer_count: transfers.length,
    transfer_bags: transfers.reduce((s, t) => s + t.bags, 0),
  }

  res.json({ from, to, inward, outward, transfers, totals })
})

export default router
