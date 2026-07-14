import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import db from '../db.js'
import dispatchRouter from './dispatch.js'
import { startTestServer, type TestServer } from '../testUtils.js'

let server: TestServer
let warehouseId: number, batchId: number, customerId: number
let warehouseId2: number, batchId2: number

function inventoryQty(): number {
  return qtyFor(batchId, warehouseId, '25kg')
}

function qtyFor(bId: number, wId: number, ps: string): number {
  const row = db.prepare(
    'SELECT quantity_in_stock FROM inventory WHERE batch_id = ? AND warehouse_id = ? AND packing_size = ?'
  ).get(bId, wId, ps) as { quantity_in_stock: number } | undefined
  return row?.quantity_in_stock ?? 0
}

beforeAll(async () => {
  server = await startTestServer(dispatchRouter)

  warehouseId = db.prepare("INSERT INTO warehouses (warehouse_name, location_city) VALUES ('Main WH', 'City')").run().lastInsertRowid as number
  warehouseId2 = db.prepare("INSERT INTO warehouses (warehouse_name, location_city) VALUES ('Second WH', 'City')").run().lastInsertRowid as number
  const itemId = db.prepare("INSERT INTO items (color_name) VALUES ('Ocean Blue')").run().lastInsertRowid as number
  batchId = db.prepare(
    "INSERT INTO batches (item_id, batch_number, import_date) VALUES (?, 'BATCH-2', '2026-01-01')"
  ).run(itemId).lastInsertRowid as number
  const itemId2 = db.prepare("INSERT INTO items (color_name) VALUES ('Forest Green')").run().lastInsertRowid as number
  batchId2 = db.prepare(
    "INSERT INTO batches (item_id, batch_number, import_date) VALUES (?, 'BATCH-3', '2026-01-01')"
  ).run(itemId2).lastInsertRowid as number
  customerId = db.prepare("INSERT INTO customers (customer_name) VALUES ('Acme Textiles')").run().lastInsertRowid as number
  db.prepare(
    'INSERT INTO inventory (batch_id, warehouse_id, packing_size, quantity_in_stock) VALUES (?, ?, ?, ?)'
  ).run(batchId, warehouseId, '25kg', 50)
  db.prepare(
    'INSERT INTO inventory (batch_id, warehouse_id, packing_size, quantity_in_stock) VALUES (?, ?, ?, ?)'
  ).run(batchId, warehouseId2, '25kg', 40)
  db.prepare(
    'INSERT INTO inventory (batch_id, warehouse_id, packing_size, quantity_in_stock) VALUES (?, ?, ?, ?)'
  ).run(batchId2, warehouseId, '25kg', 15)
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
    const body = await res.json() as { id: number; status: string; order_group: number | null }
    orderId = body.id
    expect(body.status).toBe('Pending')
    expect(body.order_group).toBeNull() // not part of a cart submission
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

  it('returns a clean 409 instead of silently no-op-ing when the inventory line no longer exists', async () => {
    const createRes = await fetch(`${server.url}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_id: customerId, batch_id: batchId, warehouse_id: warehouseId, packing_size: '25kg', bags_dispatched: 5 }),
    })
    const created = await createRes.json() as { id: number }
    const qtyBeforeDelete = inventoryQty()

    // Simulate the inventory line having been removed/reassigned out from under this pending
    // order (e.g. via the full batch editor) — the cancel endpoint must not silently no-op.
    db.prepare('DELETE FROM inventory WHERE batch_id = ? AND warehouse_id = ? AND packing_size = ?')
      .run(batchId, warehouseId, '25kg')

    const res = await fetch(`${server.url}/${created.id}/cancel`, { method: 'PUT' })
    expect(res.status).toBe(409)
    const order = db.prepare('SELECT status FROM dispatch_orders WHERE id = ?').get(created.id) as { status: string }
    expect(order.status).toBe('Pending') // not marked Cancelled — the failed reconciliation blocked it

    // restore the line (with its pre-delete quantity) for any subsequent tests in this file
    db.prepare('INSERT INTO inventory (batch_id, warehouse_id, packing_size, quantity_in_stock) VALUES (?, ?, ?, ?)')
      .run(batchId, warehouseId, '25kg', qtyBeforeDelete)
  })
})

describe('POST /dispatch/bulk', () => {
  it('creates multiple lines atomically, including the same batch from a different warehouse', async () => {
    const before1 = qtyFor(batchId, warehouseId, '25kg')
    const before2 = qtyFor(batchId, warehouseId2, '25kg')
    const before3 = qtyFor(batchId2, warehouseId, '25kg')

    const res = await fetch(`${server.url}/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_id: customerId,
        lines: [
          { batch_id: batchId, warehouse_id: warehouseId, packing_size: '25kg', bags_dispatched: 5 },
          { batch_id: batchId, warehouse_id: warehouseId2, packing_size: '25kg', bags_dispatched: 8 },
          { batch_id: batchId2, warehouse_id: warehouseId, packing_size: '25kg', bags_dispatched: 3 },
        ],
      }),
    })
    expect(res.status).toBe(201)
    const orders = await res.json() as { id: number; status: string; order_group: number | null }[]
    expect(orders).toHaveLength(3)
    expect(orders.every(o => o.status === 'Pending')).toBe(true)

    // All three lines share one order_group (the first line's own id) so the Picking list can
    // render them as one card — see "Group multi-item dispatch orders" in CLAUDE.md.
    expect(orders.every(o => o.order_group === orders[0].id)).toBe(true)
    expect(orders[0].order_group).not.toBeNull()

    expect(qtyFor(batchId, warehouseId, '25kg')).toBe(before1 - 5)
    expect(qtyFor(batchId, warehouseId2, '25kg')).toBe(before2 - 8)
    expect(qtyFor(batchId2, warehouseId, '25kg')).toBe(before3 - 3)
  })

  it('rolls back the entire batch when one line has insufficient stock, leaving all inventory untouched', async () => {
    const before1 = qtyFor(batchId, warehouseId, '25kg')
    const before2 = qtyFor(batchId, warehouseId2, '25kg')

    const res = await fetch(`${server.url}/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_id: customerId,
        lines: [
          { batch_id: batchId, warehouse_id: warehouseId, packing_size: '25kg', bags_dispatched: 1 },
          { batch_id: batchId, warehouse_id: warehouseId2, packing_size: '25kg', bags_dispatched: 9999 },
        ],
      }),
    })
    expect(res.status).toBe(409)
    expect(qtyFor(batchId, warehouseId, '25kg')).toBe(before1)
    expect(qtyFor(batchId, warehouseId2, '25kg')).toBe(before2)
  })

  it('rejects an empty lines array', async () => {
    const res = await fetch(`${server.url}/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_id: customerId, lines: [] }),
    })
    expect(res.status).toBe(400)
  })

  it('rejects a line with an invalid field before any DB writes', async () => {
    const before = qtyFor(batchId, warehouseId, '25kg')
    const res = await fetch(`${server.url}/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_id: customerId,
        lines: [
          { batch_id: batchId, warehouse_id: warehouseId, packing_size: '25kg', bags_dispatched: 2 },
          { batch_id: batchId, warehouse_id: warehouseId2, packing_size: '25kg', bags_dispatched: -1 },
        ],
      }),
    })
    expect(res.status).toBe(400)
    expect(qtyFor(batchId, warehouseId, '25kg')).toBe(before)
  })
})

describe('PUT /dispatch/group/:groupId/confirm', () => {
  it('marks every pending order in the group Picked and logs each one', async () => {
    const res = await fetch(`${server.url}/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_id: customerId,
        lines: [
          { batch_id: batchId, warehouse_id: warehouseId, packing_size: '25kg', bags_dispatched: 1 },
          { batch_id: batchId, warehouse_id: warehouseId2, packing_size: '25kg', bags_dispatched: 1 },
        ],
      }),
    })
    const orders = await res.json() as { id: number; order_group: number }[]
    const groupId = orders[0].order_group

    const confirmRes = await fetch(`${server.url}/group/${groupId}/confirm`, { method: 'PUT' })
    expect(confirmRes.status).toBe(200)

    for (const o of orders) {
      const row = db.prepare('SELECT status FROM dispatch_orders WHERE id = ?').get(o.id) as { status: string }
      expect(row.status).toBe('Picked')
      const log = db.prepare('SELECT * FROM dispatch_logs WHERE dispatch_order_id = ?').get(o.id)
      expect(log).toBeDefined()
    }
  })

  it('only touches the still-Pending members of a partially-picked group', async () => {
    const res = await fetch(`${server.url}/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_id: customerId,
        lines: [
          { batch_id: batchId, warehouse_id: warehouseId, packing_size: '25kg', bags_dispatched: 1 },
          { batch_id: batchId, warehouse_id: warehouseId2, packing_size: '25kg', bags_dispatched: 1 },
        ],
      }),
    })
    const orders = await res.json() as { id: number; order_group: number }[]
    const groupId = orders[0].order_group

    // Confirm just the first line individually before the group-confirm call
    await fetch(`${server.url}/${orders[0].id}/confirm`, { method: 'PUT' })

    const confirmRes = await fetch(`${server.url}/group/${groupId}/confirm`, { method: 'PUT' })
    expect(confirmRes.status).toBe(200)

    const row0 = db.prepare('SELECT status FROM dispatch_orders WHERE id = ?').get(orders[0].id) as { status: string }
    const row1 = db.prepare('SELECT status FROM dispatch_orders WHERE id = ?').get(orders[1].id) as { status: string }
    expect(row0.status).toBe('Picked')
    expect(row1.status).toBe('Picked')
    // Only one dispatch_logs row for the pre-confirmed order (not double-logged by the group call)
    const logs = db.prepare('SELECT * FROM dispatch_logs WHERE dispatch_order_id = ?').all(orders[0].id)
    expect(logs).toHaveLength(1)
  })

  it('returns 409 when no pending orders match the group', async () => {
    const res = await fetch(`${server.url}/group/999999/confirm`, { method: 'PUT' })
    expect(res.status).toBe(409)
  })
})
