import { Router } from 'express'
import db from '../db.js'

const router = Router()

// GET /api/dispatch
router.get('/', (req, res) => {
  const { status } = req.query
  const rows = db.prepare(`
    SELECT
      d.id, d.warehouse_id, d.packing_size, d.bags_dispatched, d.status, d.created_at,
      c.customer_name, c.contact_number,
      b.batch_number, b.import_date,
      it.color_name, it.hsn_code, it.item_image,
      w.warehouse_name, w.location_city,
      inv.godown_rack_location
    FROM dispatch_orders d
    JOIN customers c  ON d.customer_id  = c.id
    JOIN batches b    ON d.batch_id     = b.id
    JOIN items it     ON b.item_id      = it.id
    JOIN warehouses w ON d.warehouse_id = w.id
    LEFT JOIN inventory inv
      ON inv.batch_id = b.id AND inv.packing_size = d.packing_size AND inv.warehouse_id = d.warehouse_id
    ${status ? 'WHERE d.status = ?' : ''}
    ORDER BY d.created_at DESC
  `).all(...(status ? [status] : []))
  res.json(rows)
})

// POST /api/dispatch — deducts stock from the specified warehouse atomically
router.post('/', (req, res) => {
  const { customer_id, batch_id, warehouse_id, packing_size, bags_dispatched } = req.body
  if (!customer_id || !batch_id || !warehouse_id || !packing_size || !bags_dispatched) {
    return res.status(400).json({ error: 'customer_id, batch_id, warehouse_id, packing_size, bags_dispatched required' })
  }

  const createOrder = db.transaction(() => {
    const inv = db.prepare(
      'SELECT id, quantity_in_stock FROM inventory WHERE batch_id = ? AND warehouse_id = ? AND packing_size = ?'
    ).get(batch_id, warehouse_id, packing_size) as { id: number; quantity_in_stock: number } | undefined

    if (!inv) throw new Error('Inventory line not found')
    if (inv.quantity_in_stock < bags_dispatched) {
      const wh = db.prepare('SELECT warehouse_name FROM warehouses WHERE id = ?').get(warehouse_id) as { warehouse_name: string } | undefined
      throw new Error(`Insufficient stock: ${inv.quantity_in_stock} bags available in ${wh?.warehouse_name ?? 'warehouse'}`)
    }

    db.prepare('UPDATE inventory SET quantity_in_stock = quantity_in_stock - ? WHERE id = ?')
      .run(bags_dispatched, inv.id)

    const result = db.prepare(
      `INSERT INTO dispatch_orders (customer_id, batch_id, warehouse_id, packing_size, bags_dispatched, status)
       VALUES (?, ?, ?, ?, ?, 'Pending')`
    ).run(customer_id, batch_id, warehouse_id, packing_size, bags_dispatched)

    return result.lastInsertRowid
  })

  try {
    const orderId = createOrder()
    const order = db.prepare(`
      SELECT d.id, d.warehouse_id, d.packing_size, d.bags_dispatched, d.status, d.created_at,
             c.customer_name, b.batch_number, it.color_name, it.item_image,
             w.warehouse_name, w.location_city,
             inv.godown_rack_location
      FROM dispatch_orders d
      JOIN customers c  ON d.customer_id  = c.id
      JOIN batches b    ON d.batch_id     = b.id
      JOIN items it     ON b.item_id      = it.id
      JOIN warehouses w ON d.warehouse_id = w.id
      LEFT JOIN inventory inv
        ON inv.batch_id = b.id AND inv.packing_size = d.packing_size AND inv.warehouse_id = d.warehouse_id
      WHERE d.id = ?
    `).get(orderId)
    res.status(201).json(order)
  } catch (err: unknown) {
    res.status(409).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
})

// PUT /api/dispatch/:id/confirm
router.put('/:id/confirm', (req, res) => {
  const { id } = req.params

  const confirmPick = db.transaction(() => {
    const order = db.prepare('SELECT * FROM dispatch_orders WHERE id = ?').get(id) as {
      id: number; customer_id: number; batch_id: number; warehouse_id: number
      packing_size: string; bags_dispatched: number; status: string
    } | undefined

    if (!order) throw new Error('Order not found')
    if (order.status !== 'Pending') throw new Error(`Order is already ${order.status}`)

    db.prepare("UPDATE dispatch_orders SET status = 'Picked' WHERE id = ?").run(id)

    db.prepare(
      `INSERT INTO dispatch_logs (dispatch_order_id, customer_id, batch_id, packing_size, bags_dispatched)
       VALUES (?, ?, ?, ?, ?)`
    ).run(id, order.customer_id, order.batch_id, order.packing_size, order.bags_dispatched)
  })

  try {
    confirmPick()
    res.json({ success: true })
  } catch (err: unknown) {
    res.status(409).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
})

// PUT /api/dispatch/:id/cancel
router.put('/:id/cancel', (req, res) => {
  const { id } = req.params

  const cancelOrder = db.transaction(() => {
    const order = db.prepare('SELECT * FROM dispatch_orders WHERE id = ?').get(id) as {
      id: number; batch_id: number; warehouse_id: number
      packing_size: string; bags_dispatched: number; status: string
    } | undefined
    if (!order) throw new Error('Order not found')
    if (order.status !== 'Pending') throw new Error(`Cannot cancel a ${order.status} order`)

    db.prepare(
      'UPDATE inventory SET quantity_in_stock = quantity_in_stock + ? WHERE batch_id = ? AND warehouse_id = ? AND packing_size = ?'
    ).run(order.bags_dispatched, order.batch_id, order.warehouse_id, order.packing_size)

    db.prepare("UPDATE dispatch_orders SET status = 'Cancelled' WHERE id = ?").run(id)
  })

  try {
    cancelOrder()
    res.json({ success: true })
  } catch (err: unknown) {
    res.status(409).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
})

export default router
