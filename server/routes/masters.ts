import { Router } from 'express'
import db from '../db.js'
import { requireEdit, requireDelete } from '../middleware/requireAuth.js'

const router = Router()

/* ══ ITEMS ══ */
router.get('/items', (_req, res) => {
  res.json(db.prepare(`
    SELECT i.id, i.color_name, i.hsn_code, i.item_image,
           COALESCE(GROUP_CONCAT(b.batch_number, ', '), '') AS batch_numbers
    FROM items i
    LEFT JOIN batches b ON b.item_id = i.id
    GROUP BY i.id
    ORDER BY i.color_name
  `).all())
})

router.post('/items', requireEdit, (req, res) => {
  const { color_name, hsn_code = '7018.90.00', item_image = null } = req.body
  if (!color_name?.trim()) return res.status(400).json({ error: 'color_name required' })
  if (item_image !== null && item_image !== undefined) {
    if (typeof item_image !== 'string' || !item_image.startsWith('data:image/')) {
      return res.status(400).json({ error: 'item_image must be a base64 data URI (data:image/...)' })
    }
  }
  try {
    const r = db.prepare('INSERT INTO items (color_name, hsn_code, item_image) VALUES (?, ?, ?)').run(color_name.trim(), hsn_code.trim(), item_image)
    res.status(201).json({ id: r.lastInsertRowid, color_name: color_name.trim(), hsn_code: hsn_code.trim(), item_image })
  } catch { res.status(409).json({ error: 'Item name already exists' }) }
})

router.put('/items/:id', requireEdit, (req, res) => {
  const { color_name, hsn_code, item_image } = req.body
  if (!color_name?.trim()) return res.status(400).json({ error: 'color_name required' })
  if (item_image !== null && item_image !== undefined) {
    if (typeof item_image !== 'string' || !item_image.startsWith('data:image/')) {
      return res.status(400).json({ error: 'item_image must be a base64 data URI (data:image/...)' })
    }
  }
  try {
    if (item_image !== undefined) {
      db.prepare('UPDATE items SET color_name = ?, hsn_code = ?, item_image = ? WHERE id = ?').run(color_name.trim(), hsn_code?.trim() ?? '', item_image, req.params.id)
    } else {
      db.prepare('UPDATE items SET color_name = ?, hsn_code = ? WHERE id = ?').run(color_name.trim(), hsn_code?.trim() ?? '', req.params.id)
    }
    res.json({ success: true })
  } catch { res.status(409).json({ error: 'Item name already exists' }) }
})

router.delete('/items/:id', requireDelete, (req, res) => {
  const count = (db.prepare('SELECT COUNT(*) AS c FROM batches WHERE item_id = ?').get(req.params.id) as { c: number }).c
  if (count > 0) return res.status(409).json({ error: `Cannot delete — ${count} batch(es) linked to this item` })
  db.prepare('DELETE FROM items WHERE id = ?').run(req.params.id)
  res.json({ success: true })
})

/* ══ CUSTOMERS ══ */
router.get('/customers', (_req, res) => {
  res.json(db.prepare('SELECT * FROM customers ORDER BY customer_name').all())
})

function findDuplicateCustomer(name: string, gst: string, contact: string, excludeId?: number): { customer_name: string } | undefined {
  return db.prepare(`
    SELECT customer_name FROM customers
    WHERE id != ?
      AND (
        LOWER(customer_name) = LOWER(?)
        OR (? != '' AND gst_number = ?)
        OR (? != '' AND contact_number = ?)
      )
    LIMIT 1
  `).get(excludeId ?? -1, name, gst, gst, contact, contact) as { customer_name: string } | undefined
}

router.post('/customers', requireEdit, (req, res) => {
  const { customer_name, contact_number = '', gst_number = '' } = req.body
  if (!customer_name?.trim()) return res.status(400).json({ error: 'customer_name required' })
  const name = customer_name.trim(), contact = contact_number.trim(), gst = gst_number.trim()
  const dup = findDuplicateCustomer(name, gst, contact)
  if (dup) return res.status(409).json({ error: `Customer "${dup.customer_name}" already exists with the same name, GST number, or mobile number` })
  const r = db.prepare('INSERT INTO customers (customer_name, contact_number, gst_number) VALUES (?, ?, ?)').run(name, contact, gst)
  res.status(201).json({ id: r.lastInsertRowid, customer_name: name, contact_number: contact, gst_number: gst })
})

router.put('/customers/:id', requireEdit, (req, res) => {
  const { customer_name, contact_number, gst_number } = req.body
  if (!customer_name?.trim()) return res.status(400).json({ error: 'customer_name required' })
  const id = Number(req.params.id)
  const name = customer_name.trim(), contact = contact_number?.trim() ?? '', gst = gst_number?.trim() ?? ''
  const dup = findDuplicateCustomer(name, gst, contact, id)
  if (dup) return res.status(409).json({ error: `Customer "${dup.customer_name}" already exists with the same name, GST number, or mobile number` })
  db.prepare('UPDATE customers SET customer_name = ?, contact_number = ?, gst_number = ? WHERE id = ?').run(name, contact, gst, id)
  res.json({ success: true })
})

router.delete('/customers/:id', requireDelete, (req, res) => {
  const count = (db.prepare('SELECT COUNT(*) AS c FROM dispatch_orders WHERE customer_id = ?').get(req.params.id) as { c: number }).c
  if (count > 0) return res.status(409).json({ error: `Cannot delete — ${count} order(s) linked to this customer` })
  db.prepare('DELETE FROM customers WHERE id = ?').run(req.params.id)
  res.json({ success: true })
})

/* ══ SUPPLIERS ══ */
router.get('/suppliers', (_req, res) => {
  res.json(db.prepare('SELECT * FROM suppliers ORDER BY supplier_name').all())
})

function findDuplicateSupplier(name: string, gst: string, contact: string, excludeId?: number): { supplier_name: string } | undefined {
  return db.prepare(`
    SELECT supplier_name FROM suppliers
    WHERE id != ?
      AND (
        LOWER(supplier_name) = LOWER(?)
        OR (? != '' AND gst_number = ?)
        OR (? != '' AND contact_number = ?)
      )
    LIMIT 1
  `).get(excludeId ?? -1, name, gst, gst, contact, contact) as { supplier_name: string } | undefined
}

router.post('/suppliers', requireEdit, (req, res) => {
  const { supplier_name, contact_number = '', address = '', gst_number = '' } = req.body
  if (!supplier_name?.trim()) return res.status(400).json({ error: 'supplier_name required' })
  const name = supplier_name.trim(), contact = contact_number.trim(), addr = address.trim(), gst = gst_number.trim()
  const dup = findDuplicateSupplier(name, gst, contact)
  if (dup) return res.status(409).json({ error: `Supplier "${dup.supplier_name}" already exists with the same name, GST number, or mobile number` })
  const r = db.prepare('INSERT INTO suppliers (supplier_name, contact_number, address, gst_number) VALUES (?, ?, ?, ?)').run(name, contact, addr, gst)
  res.status(201).json({ id: r.lastInsertRowid, supplier_name: name, contact_number: contact, address: addr, gst_number: gst })
})

router.put('/suppliers/:id', requireEdit, (req, res) => {
  const { supplier_name, contact_number, address, gst_number } = req.body
  if (!supplier_name?.trim()) return res.status(400).json({ error: 'supplier_name required' })
  const id = Number(req.params.id)
  const name = supplier_name.trim(), contact = contact_number?.trim() ?? '', addr = address?.trim() ?? '', gst = gst_number?.trim() ?? ''
  const dup = findDuplicateSupplier(name, gst, contact, id)
  if (dup) return res.status(409).json({ error: `Supplier "${dup.supplier_name}" already exists with the same name, GST number, or mobile number` })
  db.prepare('UPDATE suppliers SET supplier_name = ?, contact_number = ?, address = ?, gst_number = ? WHERE id = ?').run(name, contact, addr, gst, id)
  res.json({ success: true })
})

router.delete('/suppliers/:id', requireDelete, (req, res) => {
  const count = (db.prepare('SELECT COUNT(*) AS c FROM batches WHERE supplier_id = ?').get(req.params.id) as { c: number }).c
  if (count > 0) return res.status(409).json({ error: `Cannot delete — ${count} batch(es) linked to this supplier` })
  db.prepare('DELETE FROM suppliers WHERE id = ?').run(req.params.id)
  res.json({ success: true })
})

/* ══ WAREHOUSES ══ */
router.get('/warehouses', (_req, res) => {
  res.json(db.prepare('SELECT * FROM warehouses ORDER BY warehouse_name').all())
})

router.post('/warehouses', requireEdit, (req, res) => {
  const { warehouse_name, location_city = '', is_active = 1 } = req.body
  if (!warehouse_name?.trim()) return res.status(400).json({ error: 'warehouse_name required' })
  try {
    const r = db.prepare('INSERT INTO warehouses (warehouse_name, location_city, is_active) VALUES (?, ?, ?)').run(warehouse_name.trim(), location_city.trim(), is_active)
    res.status(201).json({ id: r.lastInsertRowid, warehouse_name: warehouse_name.trim(), location_city: location_city.trim(), is_active })
  } catch { res.status(409).json({ error: 'Warehouse name already exists' }) }
})

router.put('/warehouses/:id', requireEdit, (req, res) => {
  const { warehouse_name, location_city, is_active } = req.body
  if (!warehouse_name?.trim()) return res.status(400).json({ error: 'warehouse_name required' })
  try {
    db.prepare('UPDATE warehouses SET warehouse_name = ?, location_city = ?, is_active = ? WHERE id = ?')
      .run(warehouse_name.trim(), location_city?.trim() ?? '', is_active ?? 1, req.params.id)
    res.json({ success: true })
  } catch { res.status(409).json({ error: 'Warehouse name already exists' }) }
})

router.delete('/warehouses/:id', requireDelete, (req, res) => {
  const count = (db.prepare('SELECT COUNT(*) AS c FROM inventory WHERE warehouse_id = ?').get(req.params.id) as { c: number }).c
  if (count > 0) return res.status(409).json({ error: `Cannot delete — ${count} inventory row(s) in this warehouse` })
  db.prepare('DELETE FROM warehouses WHERE id = ?').run(req.params.id)
  res.json({ success: true })
})

export default router
