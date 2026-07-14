import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import db from '../db.js'
import reportsRouter from './reports.js'
import { startTestServer, type TestServer } from '../testUtils.js'

let server: TestServer

beforeAll(async () => { server = await startTestServer(reportsRouter) })
afterAll(async () => { await server.close() })

describe('GET /reports/daily', () => {
  it('inward bags stay at the received quantity after stock is dispatched', async () => {
    const warehouseId = db.prepare("INSERT INTO warehouses (warehouse_name) VALUES ('Main WH')").run().lastInsertRowid as number
    const itemId = db.prepare("INSERT INTO items (color_name) VALUES ('Sapphire Blue')").run().lastInsertRowid as number
    const today = new Date().toISOString().slice(0, 10)
    const batchId = db.prepare(
      "INSERT INTO batches (item_id, batch_number, import_date) VALUES (?, 'RPT-1', ?)"
    ).run(itemId, today).lastInsertRowid as number

    // Mirrors POST /api/inward: quantity_in_stock and original_quantity both start equal.
    db.prepare(
      'INSERT INTO inventory (batch_id, warehouse_id, packing_size, quantity_in_stock, original_quantity) VALUES (?, ?, ?, ?, ?)'
    ).run(batchId, warehouseId, '25kg', 100, 100)

    const before = await fetch(`${server.url}/daily?from=${today}&to=${today}`)
      .then(r => r.json()) as { inward: { total_bags: number }[] }
    const lineBefore = before.inward[0]
    expect(lineBefore.total_bags).toBe(100)

    // Mirrors a confirmed dispatch: quantity_in_stock decrements, original_quantity does not.
    const customerId = db.prepare("INSERT INTO customers (customer_name) VALUES ('Cust')").run().lastInsertRowid as number
    const orderId = db.prepare(
      "INSERT INTO dispatch_orders (customer_id, batch_id, warehouse_id, packing_size, bags_dispatched, status) VALUES (?, ?, ?, '25kg', 30, 'Picked')"
    ).run(customerId, batchId, warehouseId).lastInsertRowid as number
    db.prepare(
      "INSERT INTO dispatch_logs (dispatch_order_id, customer_id, batch_id, packing_size, bags_dispatched) VALUES (?, ?, ?, '25kg', 30)"
    ).run(orderId, customerId, batchId)
    db.prepare('UPDATE inventory SET quantity_in_stock = quantity_in_stock - 30 WHERE batch_id = ?').run(batchId)

    const after = await fetch(`${server.url}/daily?from=${today}&to=${today}`)
      .then(r => r.json()) as { inward: { total_bags: number }[] }
    const lineAfter = after.inward[0]
    expect(lineAfter.total_bags).toBe(100) // unchanged — still the original inward quantity, not the 70 remaining
  })

  it('counts a multi-item order once in outward_orders, not once per line, and returns order_group', async () => {
    const warehouseId = db.prepare("INSERT INTO warehouses (warehouse_name) VALUES ('WH Grp')").run().lastInsertRowid as number
    const itemId = db.prepare("INSERT INTO items (color_name) VALUES ('Grouped Green')").run().lastInsertRowid as number
    const today = new Date().toISOString().slice(0, 10)
    const batchId = db.prepare(
      "INSERT INTO batches (item_id, batch_number, import_date) VALUES (?, 'RPT-GRP', ?)"
    ).run(itemId, today).lastInsertRowid as number
    db.prepare(
      'INSERT INTO inventory (batch_id, warehouse_id, packing_size, quantity_in_stock, original_quantity) VALUES (?, ?, ?, ?, ?)'
    ).run(batchId, warehouseId, '25kg', 100, 100)
    const customerId = db.prepare("INSERT INTO customers (customer_name) VALUES ('Grouped Co')").run().lastInsertRowid as number

    // Two lines sharing an order_group (a 2-item cart order) ...
    const line1 = db.prepare(
      "INSERT INTO dispatch_orders (customer_id, batch_id, warehouse_id, packing_size, bags_dispatched, status) VALUES (?, ?, ?, '25kg', 5, 'Pending')"
    ).run(customerId, batchId, warehouseId).lastInsertRowid as number
    db.prepare(
      "INSERT INTO dispatch_orders (customer_id, batch_id, warehouse_id, packing_size, bags_dispatched, status, order_group) VALUES (?, ?, ?, '25kg', 3, 'Pending', ?)"
    ).run(customerId, batchId, warehouseId, line1)
    db.prepare('UPDATE dispatch_orders SET order_group = ? WHERE id = ?').run(line1, line1)
    // ... plus one standalone single-line order
    db.prepare(
      "INSERT INTO dispatch_orders (customer_id, batch_id, warehouse_id, packing_size, bags_dispatched, status) VALUES (?, ?, ?, '25kg', 2, 'Pending')"
    ).run(customerId, batchId, warehouseId)

    const res = await fetch(`${server.url}/daily?from=${today}&to=${today}`)
    const body = await res.json() as { outward: { id: number; order_group: number | null }[]; totals: { outward_orders: number } }
    expect(body.outward.some(o => o.order_group === line1)).toBe(true) // order_group came through

    // outward_orders must count distinct orders, not dispatch_orders rows — verified generally
    // (not just for this test's own two lines) since other tests in this file share the same
    // in-memory DB and today's date range.
    const distinctOrders = new Set(body.outward.map(o => o.order_group ?? `s-${o.id}`)).size
    expect(body.totals.outward_orders).toBe(distinctOrders)
    expect(distinctOrders).toBeLessThan(body.outward.length) // the group really did collapse 2 rows into 1
  })
})
