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

  it('does not clobber a dispatch that happened while the edit form was open', async () => {
    const batchId = db.prepare(
      "INSERT INTO batches (item_id, batch_number, import_date) VALUES (?, 'BATCH-F', '2026-01-01')"
    ).run(itemId).lastInsertRowid as number
    const lineId = db.prepare(
      'INSERT INTO inventory (batch_id, warehouse_id, packing_size, quantity_in_stock) VALUES (?, ?, ?, ?)'
    ).run(batchId, warehouseA, '20kg', 10).lastInsertRowid as number

    // Form loads with quantity_in_stock = 10. Before it's saved, a dispatch order elsewhere
    // deducts 4 bags directly against live inventory (mirrors POST /api/dispatch's own UPDATE).
    db.prepare('UPDATE inventory SET quantity_in_stock = quantity_in_stock - 4 WHERE id = ?').run(lineId)

    // User saves the still-open form without having touched the quantity field — submitted value
    // equals the stale original snapshot, so this should be a no-op against inventory.
    const res = await fetch(`${server.url}/inward/batches/${batchId}/full`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        color_name: 'Emerald Green', batch_number: 'BATCH-F', import_date: '2026-01-01', notes: '', supplier_id: null,
        lines: [{ id: lineId, warehouse_id: warehouseA, packing_size: '20kg', quantity_in_stock: 10, original_quantity_in_stock: 10 }],
      }),
    })
    expect(res.status).toBe(200)
    const row = db.prepare('SELECT quantity_in_stock FROM inventory WHERE id = ?').get(lineId) as { quantity_in_stock: number }
    expect(row.quantity_in_stock).toBe(6) // the dispatch's deduction survives, not reverted to 10

    // A deliberate +5 correction from the same stale form applies on top of the live value.
    const res2 = await fetch(`${server.url}/inward/batches/${batchId}/full`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        color_name: 'Emerald Green', batch_number: 'BATCH-F', import_date: '2026-01-01', notes: '', supplier_id: null,
        lines: [{ id: lineId, warehouse_id: warehouseA, packing_size: '20kg', quantity_in_stock: 15, original_quantity_in_stock: 10 }],
      }),
    })
    expect(res2.status).toBe(200)
    const row2 = db.prepare('SELECT quantity_in_stock FROM inventory WHERE id = ?').get(lineId) as { quantity_in_stock: number }
    expect(row2.quantity_in_stock).toBe(11) // 6 live + 5 delta, not the submitted absolute 15
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

describe('GET /ledger/suppliers and /ledger/supplier/:id', () => {
  it('reports received (original_quantity) separately from current stock after a dispatch', async () => {
    const supplierId = db.prepare("INSERT INTO suppliers (supplier_name) VALUES ('Ranbow')").run().lastInsertRowid as number
    const batchId = db.prepare(
      "INSERT INTO batches (item_id, batch_number, import_date, supplier_id) VALUES (?, 'KPR', '2026-07-01', ?)"
    ).run(itemId, supplierId).lastInsertRowid as number
    db.prepare(
      'INSERT INTO inventory (batch_id, warehouse_id, packing_size, quantity_in_stock, original_quantity) VALUES (?, ?, ?, ?, ?)'
    ).run(batchId, warehouseA, '25kg', 4, 8) // 8 received, 4 dispatched already reflected in live balance

    const listRes = await fetch(`${server.url}/ledger/suppliers`)
    const list = await listRes.json() as { supplier_name: string; received_bags: number; current_stock_bags: number }[]
    const ranbow = list.find(s => s.supplier_name === 'Ranbow')!
    expect(ranbow.received_bags).toBe(8)
    expect(ranbow.current_stock_bags).toBe(4)

    const detailRes = await fetch(`${server.url}/ledger/supplier/${supplierId}`)
    const detail = await detailRes.json() as {
      totals: { received_bags: number; current_stock_bags: number }
      batches: { received: number; current_stock: number }[]
    }
    expect(detail.totals.received_bags).toBe(8)
    expect(detail.totals.current_stock_bags).toBe(4)
    expect(detail.batches[0].received).toBe(8)
    expect(detail.batches[0].current_stock).toBe(4)
  })
})
