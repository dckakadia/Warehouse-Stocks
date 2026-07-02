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
})
