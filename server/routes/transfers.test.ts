import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import db from '../db.js'
import transfersRouter from './transfers.js'
import { startTestServer, type TestServer } from '../testUtils.js'

let server: TestServer
let warehouseA: number, warehouseB: number, batchId: number

function inventoryQty(warehouseId: number): number {
  const row = db.prepare(
    'SELECT quantity_in_stock FROM inventory WHERE batch_id = ? AND warehouse_id = ? AND packing_size = ?'
  ).get(batchId, warehouseId, '20kg') as { quantity_in_stock: number } | undefined
  return row?.quantity_in_stock ?? 0
}

beforeAll(async () => {
  server = await startTestServer(transfersRouter)

  warehouseA = (db.prepare("INSERT INTO warehouses (warehouse_name, location_city) VALUES ('WH A', 'CityA')").run().lastInsertRowid) as number
  warehouseB = (db.prepare("INSERT INTO warehouses (warehouse_name, location_city) VALUES ('WH B', 'CityB')").run().lastInsertRowid) as number
  const itemId = db.prepare("INSERT INTO items (color_name) VALUES ('Coral Pink')").run().lastInsertRowid as number
  batchId = db.prepare(
    "INSERT INTO batches (item_id, batch_number, import_date) VALUES (?, 'BATCH-1', '2026-01-01')"
  ).run(itemId).lastInsertRowid as number
  db.prepare(
    'INSERT INTO inventory (batch_id, warehouse_id, packing_size, quantity_in_stock) VALUES (?, ?, ?, ?)'
  ).run(batchId, warehouseA, '20kg', 100)
})

afterAll(async () => { await server.close() })

describe('POST /transfers', () => {
  it('moves bags from source to destination and records the transfer', async () => {
    const res = await fetch(`${server.url}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from_warehouse_id: warehouseA, to_warehouse_id: warehouseB, batch_id: batchId, packing_size: '20kg', bags: 30 }),
    })
    expect(res.status).toBe(201)
    expect(inventoryQty(warehouseA)).toBe(70)
    expect(inventoryQty(warehouseB)).toBe(30)
  })

  it('rejects a non-integer bags value (posInt validation)', async () => {
    const res = await fetch(`${server.url}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from_warehouse_id: warehouseA, to_warehouse_id: warehouseB, batch_id: batchId, packing_size: '20kg', bags: 'abc' }),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toMatch(/positive integer/)
  })

  it('rejects a transfer larger than the available stock', async () => {
    const res = await fetch(`${server.url}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from_warehouse_id: warehouseA, to_warehouse_id: warehouseB, batch_id: batchId, packing_size: '20kg', bags: 999 }),
    })
    expect(res.status).toBe(409)
    expect(inventoryQty(warehouseA)).toBe(70) // unchanged
  })
})

describe('PUT /transfers/:id — reconciliation edge cases', () => {
  it('increases bags (positive delta) and moves the extra stock', async () => {
    const transfer = db.prepare('SELECT id FROM stock_transfers WHERE batch_id = ? ORDER BY id DESC LIMIT 1').get(batchId) as { id: number }
    const res = await fetch(`${server.url}/${transfer.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bags: 40 }), // was 30, +10 delta
    })
    expect(res.status).toBe(200)
    expect(inventoryQty(warehouseA)).toBe(60)
    expect(inventoryQty(warehouseB)).toBe(40)
  })

  it('decreases bags (negative delta) without tripping the quantity_in_stock >= 0 CHECK constraint', async () => {
    // Regression test for the documented bug: reconciliation must use plain UPDATE statements,
    // not INSERT ... ON CONFLICT DO UPDATE with a negative literal, or SQLite rejects the
    // literal against the CHECK constraint before conflict resolution ever applies.
    const transfer = db.prepare('SELECT id FROM stock_transfers WHERE batch_id = ? ORDER BY id DESC LIMIT 1').get(batchId) as { id: number }
    const res = await fetch(`${server.url}/${transfer.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bags: 10 }), // was 40, -30 delta — bags flow back to source
    })
    expect(res.status).toBe(200)
    expect(inventoryQty(warehouseA)).toBe(90)
    expect(inventoryQty(warehouseB)).toBe(10)
  })

  it('rejects an increase beyond what the source warehouse has available', async () => {
    const transfer = db.prepare('SELECT id FROM stock_transfers WHERE batch_id = ? ORDER BY id DESC LIMIT 1').get(batchId) as { id: number }
    const res = await fetch(`${server.url}/${transfer.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bags: 99999 }),
    })
    expect(res.status).toBe(409)
    expect(inventoryQty(warehouseA)).toBe(90) // unchanged
    expect(inventoryQty(warehouseB)).toBe(10) // unchanged
  })
})

describe('DELETE /transfers/:id', () => {
  it('reverses the transfer, restoring source and deducting destination', async () => {
    const transfer = db.prepare('SELECT id FROM stock_transfers WHERE batch_id = ? ORDER BY id DESC LIMIT 1').get(batchId) as { id: number }
    const res = await fetch(`${server.url}/${transfer.id}`, { method: 'DELETE' })
    expect(res.status).toBe(200)
    expect(inventoryQty(warehouseA)).toBe(100)
    expect(inventoryQty(warehouseB)).toBe(0)
    const row = db.prepare('SELECT id FROM stock_transfers WHERE id = ?').get(transfer.id)
    expect(row).toBeUndefined()
  })
})
