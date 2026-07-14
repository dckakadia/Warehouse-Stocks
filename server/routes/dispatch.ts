import { Router } from 'express'
import db from '../db.js'
import { requireEdit } from '../middleware/requireAuth.js'

const router = Router()

function posInt(v: unknown, name: string): number {
  const n = Number(v)
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${name} must be a positive integer`)
  return n
}

// GET /api/dispatch
router.get('/', (req, res) => {
  const { status } = req.query
  const rows = db.prepare(`
    SELECT
      d.id, d.warehouse_id, d.packing_size, d.bags_dispatched, d.status, d.created_at, d.order_group,
      c.customer_name, c.contact_number,
      b.batch_number, b.import_date,
      it.color_name, it.hsn_code, COALESCE(b.batch_image, it.item_image) AS item_image,
      w.warehouse_name
    FROM dispatch_orders d
    JOIN customers c  ON d.customer_id  = c.id
    JOIN batches b    ON d.batch_id     = b.id
    JOIN items it     ON b.item_id      = it.id
    JOIN warehouses w ON d.warehouse_id = w.id
    ${status ? 'WHERE d.status = ?' : ''}
    ORDER BY d.created_at DESC
  `).all(...(status ? [status] : []))
  res.json(rows)
})

// POST /api/dispatch — requires can_edit
router.post('/', requireEdit, (req, res) => {
  let customer_id: number, batch_id: number, warehouse_id: number, bags_dispatched: number
  try {
    customer_id   = posInt(req.body.customer_id,   'customer_id')
    batch_id      = posInt(req.body.batch_id,       'batch_id')
    warehouse_id  = posInt(req.body.warehouse_id,   'warehouse_id')
    bags_dispatched = posInt(req.body.bags_dispatched, 'bags_dispatched')
  } catch (e: unknown) {
    return res.status(400).json({ error: (e as Error).message })
  }
  const { packing_size } = req.body
  if (!packing_size?.trim()) return res.status(400).json({ error: 'packing_size required' })

  const createOrder = db.transaction(() => {
    const inv = db.prepare(
      'SELECT id, quantity_in_stock FROM inventory WHERE batch_id = ? AND warehouse_id = ? AND packing_size = ?'
    ).get(batch_id, warehouse_id, packing_size) as { id: number; quantity_in_stock: number } | undefined
    if (!inv) throw new Error('Inventory line not found')
    if (inv.quantity_in_stock < bags_dispatched) {
      const wh = db.prepare('SELECT warehouse_name FROM warehouses WHERE id = ?').get(warehouse_id) as { warehouse_name: string } | undefined
      throw new Error(`Insufficient stock: ${inv.quantity_in_stock} bags available in ${wh?.warehouse_name ?? 'warehouse'}`)
    }
    db.prepare('UPDATE inventory SET quantity_in_stock = quantity_in_stock - ? WHERE id = ?').run(bags_dispatched, inv.id)
    const result = db.prepare(
      `INSERT INTO dispatch_orders (customer_id, batch_id, warehouse_id, packing_size, bags_dispatched, status)
       VALUES (?, ?, ?, ?, ?, 'Pending')`
    ).run(customer_id, batch_id, warehouse_id, packing_size, bags_dispatched)
    return result.lastInsertRowid
  })

  try {
    const orderId = createOrder()
    const order = db.prepare(`
      SELECT d.id, d.warehouse_id, d.packing_size, d.bags_dispatched, d.status, d.created_at, d.order_group,
             c.customer_name, b.batch_number, it.color_name, COALESCE(b.batch_image, it.item_image) AS item_image,
             w.warehouse_name
      FROM dispatch_orders d
      JOIN customers c  ON d.customer_id  = c.id
      JOIN batches b    ON d.batch_id     = b.id
      JOIN items it     ON b.item_id      = it.id
      JOIN warehouses w ON d.warehouse_id = w.id
      WHERE d.id = ?
    `).get(orderId)
    res.status(201).json(order)
  } catch (err: unknown) {
    res.status(409).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
})

// POST /api/dispatch/bulk — requires can_edit
// Creates several dispatch_orders rows (one customer, multiple batch/warehouse/pack-size/bags
// lines) atomically — either all lines succeed or none are committed, so a mid-cart stock
// shortfall never leaves a partial order behind.
router.post('/bulk', requireEdit, (req, res) => {
  let customer_id: number
  try {
    customer_id = posInt(req.body.customer_id, 'customer_id')
  } catch (e: unknown) {
    return res.status(400).json({ error: (e as Error).message })
  }

  const { lines } = req.body as { lines?: unknown }
  if (!Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({ error: 'At least one line is required' })
  }

  const validatedLines: { batch_id: number; warehouse_id: number; packing_size: string; bags_dispatched: number }[] = []
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i] as Record<string, unknown>
    try {
      const batch_id = posInt(l.batch_id, `Line ${i + 1}: batch_id`)
      const warehouse_id = posInt(l.warehouse_id, `Line ${i + 1}: warehouse_id`)
      const bags_dispatched = posInt(l.bags_dispatched, `Line ${i + 1}: bags_dispatched`)
      const packing_size = typeof l.packing_size === 'string' ? l.packing_size.trim() : ''
      if (!packing_size) return res.status(400).json({ error: `Line ${i + 1}: packing_size required` })
      validatedLines.push({ batch_id, warehouse_id, packing_size, bags_dispatched })
    } catch (e: unknown) {
      return res.status(400).json({ error: (e as Error).message })
    }
  }

  const createOrders = db.transaction(() => {
    const ids: (number | bigint)[] = []
    for (let i = 0; i < validatedLines.length; i++) {
      const { batch_id, warehouse_id, packing_size, bags_dispatched } = validatedLines[i]
      const inv = db.prepare(
        'SELECT id, quantity_in_stock FROM inventory WHERE batch_id = ? AND warehouse_id = ? AND packing_size = ?'
      ).get(batch_id, warehouse_id, packing_size) as { id: number; quantity_in_stock: number } | undefined
      if (!inv) throw new Error(`Line ${i + 1}: inventory line not found`)
      if (inv.quantity_in_stock < bags_dispatched) {
        const wh = db.prepare('SELECT warehouse_name FROM warehouses WHERE id = ?').get(warehouse_id) as { warehouse_name: string } | undefined
        throw new Error(`Line ${i + 1}: insufficient stock — ${inv.quantity_in_stock} bags available in ${wh?.warehouse_name ?? 'warehouse'}`)
      }
      db.prepare('UPDATE inventory SET quantity_in_stock = quantity_in_stock - ? WHERE id = ?').run(bags_dispatched, inv.id)
      const result = db.prepare(
        `INSERT INTO dispatch_orders (customer_id, batch_id, warehouse_id, packing_size, bags_dispatched, status)
         VALUES (?, ?, ?, ?, ?, 'Pending')`
      ).run(customer_id, batch_id, warehouse_id, packing_size, bags_dispatched)
      ids.push(result.lastInsertRowid)
    }
    // Tag every line from this cart submission with a shared order_group (the first line's own
    // id) so the Picking list can render them as one card with one Confirm Picked/Print/Share
    // action — see "Group multi-item dispatch orders" in CLAUDE.md.
    const groupId = ids[0]
    const groupPlaceholders = ids.map(() => '?').join(',')
    db.prepare(`UPDATE dispatch_orders SET order_group = ? WHERE id IN (${groupPlaceholders})`).run(groupId, ...ids)
    return ids
  })

  try {
    const orderIds = createOrders()
    const placeholders = orderIds.map(() => '?').join(',')
    const orders = db.prepare(`
      SELECT d.id, d.warehouse_id, d.packing_size, d.bags_dispatched, d.status, d.created_at, d.order_group,
             c.customer_name, b.batch_number, it.color_name, COALESCE(b.batch_image, it.item_image) AS item_image,
             w.warehouse_name
      FROM dispatch_orders d
      JOIN customers c  ON d.customer_id  = c.id
      JOIN batches b    ON d.batch_id     = b.id
      JOIN items it     ON b.item_id      = it.id
      JOIN warehouses w ON d.warehouse_id = w.id
      WHERE d.id IN (${placeholders})
      ORDER BY d.id
    `).all(...orderIds)
    res.status(201).json(orders)
  } catch (err: unknown) {
    res.status(409).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
})

// PUT /api/dispatch/group/:groupId/confirm — requires can_edit
// Confirms every still-Pending order sharing an order_group (a cart submitted together via
// POST /bulk) in one transaction — either all of them move to Picked, or none do.
router.put('/group/:groupId/confirm', requireEdit, (req, res) => {
  const { groupId } = req.params
  const confirmGroup = db.transaction(() => {
    const orders = db.prepare(
      "SELECT * FROM dispatch_orders WHERE order_group = ? AND status = 'Pending'"
    ).all(groupId) as {
      id: number; customer_id: number; batch_id: number; warehouse_id: number
      packing_size: string; bags_dispatched: number; status: string
    }[]
    if (orders.length === 0) throw new Error('No pending orders found in this group')
    for (const order of orders) {
      db.prepare("UPDATE dispatch_orders SET status = 'Picked' WHERE id = ?").run(order.id)
      db.prepare(
        `INSERT INTO dispatch_logs (dispatch_order_id, customer_id, batch_id, packing_size, bags_dispatched)
         VALUES (?, ?, ?, ?, ?)`
      ).run(order.id, order.customer_id, order.batch_id, order.packing_size, order.bags_dispatched)
    }
  })
  try { confirmGroup(); res.json({ success: true }) }
  catch (err: unknown) { res.status(409).json({ error: err instanceof Error ? err.message : 'Unknown error' }) }
})

// PUT /api/dispatch/:id/confirm — requires can_edit
router.put('/:id/confirm', requireEdit, (req, res) => {
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
  try { confirmPick(); res.json({ success: true }) }
  catch (err: unknown) { res.status(409).json({ error: err instanceof Error ? err.message : 'Unknown error' }) }
})

// PUT /api/dispatch/:id/cancel — requires can_edit
router.put('/:id/cancel', requireEdit, (req, res) => {
  const { id } = req.params
  const cancelOrder = db.transaction(() => {
    const order = db.prepare('SELECT * FROM dispatch_orders WHERE id = ?').get(id) as {
      id: number; batch_id: number; warehouse_id: number
      packing_size: string; bags_dispatched: number; status: string
    } | undefined
    if (!order) throw new Error('Order not found')
    if (order.status !== 'Pending') throw new Error(`Cannot cancel a ${order.status} order`)
    const inv = db.prepare(
      'SELECT id FROM inventory WHERE batch_id = ? AND warehouse_id = ? AND packing_size = ?'
    ).get(order.batch_id, order.warehouse_id, order.packing_size) as { id: number } | undefined
    if (!inv) throw new Error('Inventory line no longer exists — cannot restore stock')
    db.prepare('UPDATE inventory SET quantity_in_stock = quantity_in_stock + ? WHERE id = ?').run(order.bags_dispatched, inv.id)
    db.prepare("UPDATE dispatch_orders SET status = 'Cancelled' WHERE id = ?").run(id)
  })
  try { cancelOrder(); res.json({ success: true }) }
  catch (err: unknown) { res.status(409).json({ error: err instanceof Error ? err.message : 'Unknown error' }) }
})

export default router
