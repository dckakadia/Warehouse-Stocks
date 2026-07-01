import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import db from '../db.js'
import dispatchRouter from './dispatch.js'
import { startTestServer, type TestServer } from '../testUtils.js'

let server: TestServer
let warehouseId: number, batchId: number, customerId: number

function inventoryQty(): number {
  const row = db.prepare(
    'SELECT quantity_in_stock FROM inventory WHERE batch_id = ? AND warehouse_id = ? AND packing_size = ?'
  ).get(batchId, warehouseId, '25kg') as { quantity_in_stock: number } | undefined
  return row?.quantity_in_stock ?? 0
}

beforeAll(async () => {
  server = await startTestServer(dispatchRouter)

  warehouseId = db.prepare("INSERT INTO warehouses (warehouse_name, location_city) VALUES ('Main WH', 'City')").run().lastInsertRowid as number
  const itemId = db.prepare("INSERT INTO items (color_name) VALUES ('Ocean Blue')").run().lastInsertRowid as number
  batchId = db.prepare(
    "INSERT INTO batches (item_id, batch_number, import_date) VALUES (?, 'BATCH-2', '2026-01-01')"
  ).run(itemId).lastInsertRowid as number
  customerId = db.prepare("INSERT INTO customers (customer_name) VALUES ('Acme Textiles')").run().lastInsertRowid as number
  db.prepare(
    'INSERT INTO inventory (batch_id, warehouse_id, packing_size, quantity_in_stock) VALUES (?, ?, ?, ?)'
  ).run(batchId, warehouseId, '25kg', 50)
})

afterAll(async () => { await server.close() })

let orderId: number

describe('POST /dispatch', () => {
  it('reserves stock immediately by decrementing inventory', async () => {
    const res = await fetch(`${server.url}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_id: customerId, batch_id: batchId, warehouse_id: warehouseId, packing_size: '25kg', bags_dispatched: 20 }),
    })
    expect(res.status).toBe(201)
    const body = await res.json() as { id: number; status: string }
    orderId = body.id
    expect(body.status).toBe('Pending')
    expect(inventoryQty()).toBe(30)
  })

  it('rejects a dispatch larger than the available stock, leaving inventory untouched', async () => {
    const res = await fetch(`${server.url}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_id: customerId, batch_id: batchId, warehouse_id: warehouseId, packing_size: '25kg', bags_dispatched: 999 }),
    })
    expect(res.status).toBe(409)
    expect(inventoryQty()).toBe(30)
  })

  it('rejects a non-integer bags_dispatched (posInt validation)', async () => {
    const res = await fetch(`${server.url}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_id: customerId, batch_id: batchId, warehouse_id: warehouseId, packing_size: '25kg', bags_dispatched: -5 }),
    })
    expect(res.status).toBe(400)
  })
})

describe('PUT /dispatch/:id/confirm', () => {
  it('marks the order Picked and logs it without touching inventory again', async () => {
    const res = await fetch(`${server.url}/${orderId}/confirm`, { method: 'PUT' })
    expect(res.status).toBe(200)
    expect(inventoryQty()).toBe(30) // unchanged — already reserved at creation
    const log = db.prepare('SELECT * FROM dispatch_logs WHERE dispatch_order_id = ?').get(orderId)
    expect(log).toBeDefined()
    const order = db.prepare('SELECT status FROM dispatch_orders WHERE id = ?').get(orderId) as { status: string }
    expect(order.status).toBe('Picked')
  })

  it('rejects confirming an order that is no longer Pending', async () => {
    const res = await fetch(`${server.url}/${orderId}/confirm`, { method: 'PUT' })
    expect(res.status).toBe(409)
  })
})

describe('PUT /dispatch/:id/cancel', () => {
  it('restores inventory and marks the order Cancelled', async () => {
    const createRes = await fetch(`${server.url}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_id: customerId, batch_id: batchId, warehouse_id: warehouseId, packing_size: '25kg', bags_dispatched: 10 }),
    })
    const created = await createRes.json() as { id: number }
    expect(inventoryQty()).toBe(20)

    const res = await fetch(`${server.url}/${created.id}/cancel`, { method: 'PUT' })
    expect(res.status).toBe(200)
    expect(inventoryQty()).toBe(30)
    const order = db.prepare('SELECT status FROM dispatch_orders WHERE id = ?').get(created.id) as { status: string }
    expect(order.status).toBe('Cancelled')
  })

  it('rejects cancelling an order that is already Picked', async () => {
    const res = await fetch(`${server.url}/${orderId}/cancel`, { method: 'PUT' })
    expect(res.status).toBe(409)
  })
})
