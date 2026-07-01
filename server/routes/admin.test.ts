import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import db from '../db.js'
import adminRouter from './admin.js'
import { startTestServer, type TestServer } from '../testUtils.js'

let server: TestServer
let warehouseA: number, warehouseB: number, itemId: number

beforeAll(async () => {
  server = await startTestServer(adminRouter, { can_edit: 1, can_delete: 1, role: 'manager' })
  warehouseA = db.prepare("INSERT INTO warehouses (warehouse_name, location_city) VALUES ('WH A', 'CityA')").run().lastInsertRowid as number
  warehouseB = db.prepare("INSERT INTO warehouses (warehouse_name, location_city) VALUES ('WH B', 'CityB')").run().lastInsertRowid as number
  itemId = db.prepare("INSERT INTO items (color_name) VALUES ('Emerald Green')").run().lastInsertRowid as number
})

afterAll(async () => { await server.close() })

describe('PUT /inward/batches/:id/full', () => {
  it('reduces an inventory line quantity', async () => {
    const batchId = db.prepare(
      "INSERT INTO batches (item_id, batch_number, import_date) VALUES (?, 'BATCH-A', '2026-01-01')"
    ).run(itemId).lastInsertRowid as number
    const lineId = db.prepare(
      'INSERT INTO inventory (batch_id, warehouse_id, packing_size, quantity_in_stock) VALUES (?, ?, ?, ?)'
    ).run(batchId, warehouseA, '20kg', 50).lastInsertRowid as number

    const res = await fetch(`${server.url}/inward/batches/${batchId}/full`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        color_name: 'Emerald Green', batch_number: 'BATCH-A', import_date: '2026-01-01', notes: '', supplier_id: null,
        lines: [{ id: lineId, warehouse_id: warehouseA, packing_size: '20kg', quantity_in_stock: 20 }],
      }),
    })
    expect(res.status).toBe(200)
    const row = db.prepare('SELECT quantity_in_stock FROM inventory WHERE id = ?').get(lineId) as { quantity_in_stock: number }
    expect(row.quantity_in_stock).toBe(20)
  })

  it('adds a new line for another warehouse alongside the existing one', async () => {
    const batchId = db.prepare(
      "INSERT INTO batches (item_id, batch_number, import_date) VALUES (?, 'BATCH-B', '2026-01-01')"
    ).run(itemId).lastInsertRowid as number
    const lineId = db.prepare(
      'INSERT INTO inventory (batch_id, warehouse_id, packing_size, quantity_in_stock) VALUES (?, ?, ?, ?)'
    ).run(batchId, warehouseA, '20kg', 10).lastInsertRowid as number

    const res = await fetch(`${server.url}/inward/batches/${batchId}/full`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        color_name: 'Emerald Green', batch_number: 'BATCH-B', import_date: '2026-01-01', notes: '', supplier_id: null,
        lines: [
          { id: lineId, warehouse_id: warehouseA, packing_size: '20kg', quantity_in_stock: 10 },
          { warehouse_id: warehouseB, packing_size: '25kg', quantity_in_stock: 15 },
        ],
      }),
    })
    expect(res.status).toBe(200)
    const lines = db.prepare('SELECT * FROM inventory WHERE batch_id = ?').all(batchId)
    expect(lines).toHaveLength(2)
  })

  it('rejects a negative quantity', async () => {
    const batchId = db.prepare(
      "INSERT INTO batches (item_id, batch_number, import_date) VALUES (?, 'BATCH-C', '2026-01-01')"
    ).run(itemId).lastInsertRowid as number
    const lineId = db.prepare(
      'INSERT INTO inventory (batch_id, warehouse_id, packing_size, quantity_in_stock) VALUES (?, ?, ?, ?)'
    ).run(batchId, warehouseA, '20kg', 10).lastInsertRowid as number

    const res = await fetch(`${server.url}/inward/batches/${batchId}/full`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        color_name: 'Emerald Green', batch_number: 'BATCH-C', import_date: '2026-01-01', notes: '', supplier_id: null,
        lines: [{ id: lineId, warehouse_id: warehouseA, packing_size: '20kg', quantity_in_stock: -5 }],
      }),
    })
    expect(res.status).toBe(400)
    const row = db.prepare('SELECT quantity_in_stock FROM inventory WHERE id = ?').get(lineId) as { quantity_in_stock: number }
    expect(row.quantity_in_stock).toBe(10) // unchanged
  })

  it('refuses to remove a line that has a pending dispatch order', async () => {
    const batchId = db.prepare(
      "INSERT INTO batches (item_id, batch_number, import_date) VALUES (?, 'BATCH-D', '2026-01-01')"
    ).run(itemId).lastInsertRowid as number
    const lineId = db.prepare(
      'INSERT INTO inventory (batch_id, warehouse_id, packing_size, quantity_in_stock) VALUES (?, ?, ?, ?)'
    ).run(batchId, warehouseA, '20kg', 30).lastInsertRowid as number
    const customerId = db.prepare("INSERT INTO customers (customer_name) VALUES ('Pending Co')").run().lastInsertRowid as number
    db.prepare(
      "INSERT INTO dispatch_orders (customer_id, batch_id, warehouse_id, packing_size, bags_dispatched, status) VALUES (?, ?, ?, ?, ?, 'Pending')"
    ).run(customerId, batchId, warehouseA, '20kg', 5)

    // Submitting a form with zero lines for this batch attempts to remove the only line
    const res = await fetch(`${server.url}/inward/batches/${batchId}/full`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        color_name: 'Emerald Green', batch_number: 'BATCH-D', import_date: '2026-01-01', notes: '', supplier_id: null,
        lines: [{ warehouse_id: warehouseB, packing_size: '25kg', quantity_in_stock: 5 }],
      }),
    })
    expect(res.status).toBe(409)
    const row = db.prepare('SELECT id FROM inventory WHERE id = ?').get(lineId)
    expect(row).toBeDefined() // line was not removed
  })
})

describe('DELETE /inward/batches/:id', () => {
  it('returns 409 instead of crashing when the batch has dispatch history', async () => {
    const batchId = db.prepare(
      "INSERT INTO batches (item_id, batch_number, import_date) VALUES (?, 'BATCH-E', '2026-01-01')"
    ).run(itemId).lastInsertRowid as number
    db.prepare(
      'INSERT INTO inventory (batch_id, warehouse_id, packing_size, quantity_in_stock) VALUES (?, ?, ?, ?)'
    ).run(batchId, warehouseA, '20kg', 20)
    const customerId = db.prepare("INSERT INTO customers (customer_name) VALUES ('History Co')").run().lastInsertRowid as number
    const orderId = db.prepare(
      "INSERT INTO dispatch_orders (customer_id, batch_id, warehouse_id, packing_size, bags_dispatched, status) VALUES (?, ?, ?, ?, ?, 'Picked')"
    ).run(customerId, batchId, warehouseA, '20kg', 5).lastInsertRowid as number
    db.prepare(
      'INSERT INTO dispatch_logs (dispatch_order_id, customer_id, batch_id, packing_size, bags_dispatched) VALUES (?, ?, ?, ?, ?)'
    ).run(orderId, customerId, batchId, '20kg', 5)

    const res = await fetch(`${server.url}/inward/batches/${batchId}`, { method: 'DELETE' })
    expect(res.status).toBe(409)
    const batch = db.prepare('SELECT id FROM batches WHERE id = ?').get(batchId)
    expect(batch).toBeDefined() // batch was not deleted
  })
})
