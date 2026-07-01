import { Router } from 'express'
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { execSync, execFile } from 'child_process'
import { fileURLToPath } from 'url'
import path from 'path'
import db from '../db.js'
import { requireManager } from '../middleware/requireAuth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BACKUP_SCRIPT = path.resolve(__dirname, '../../scripts/backup-db.sh')

const router = Router()
// All admin routes require manager role (requireAuth already applied globally)
router.use(requireManager)

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  const derived = scryptSync(password, salt, 64)
  return timingSafeEqual(Buffer.from(hash, 'hex'), derived)
}

/* ── List all users (no password_hash) ── */
router.get('/users', (_req, res) => {
  const rows = db.prepare(`
    SELECT id, username, role, can_view, can_edit, can_delete, is_active, created_at
    FROM app_users
    ORDER BY created_at DESC
  `).all()
  res.json(rows)
})

/* ── Create user ── */
router.post('/users', (req, res) => {
  const { username, password, role, can_view, can_edit, can_delete } = req.body as {
    username: string
    password: string
    role: 'manager' | 'helper'
    can_view: boolean
    can_edit: boolean
    can_delete: boolean
  }

  if (!username?.trim()) return res.status(400).json({ error: 'Username is required' })
  if (!password || password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' })
  if (!['manager', 'helper'].includes(role)) return res.status(400).json({ error: 'Invalid role' })

  const password_hash = hashPassword(password)

  try {
    const stmt = db.prepare(`
      INSERT INTO app_users (username, password_hash, role, can_view, can_edit, can_delete)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    const result = stmt.run(
      username.trim(),
      password_hash,
      role,
      can_view ? 1 : 0,
      can_edit  ? 1 : 0,
      can_delete ? 1 : 0,
    )
    const user = db.prepare(
      'SELECT id, username, role, can_view, can_edit, can_delete, is_active, created_at FROM app_users WHERE id = ?'
    ).get(result.lastInsertRowid)
    return res.status(201).json(user)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    if (msg.includes('UNIQUE')) return res.status(409).json({ error: `Username "${username}" already exists` })
    return res.status(500).json({ error: msg })
  }
})

/* ── Update user (role, rights, optional password, active) ── */
router.put('/users/:id', (req, res) => {
  const id = Number(req.params.id)
  const { role, can_view, can_edit, can_delete, is_active, password } = req.body as {
    role: 'manager' | 'helper'
    can_view: boolean
    can_edit: boolean
    can_delete: boolean
    is_active: boolean
    password?: string
  }

  if (!['manager', 'helper'].includes(role)) return res.status(400).json({ error: 'Invalid role' })

  const existing = db.prepare('SELECT id FROM app_users WHERE id = ?').get(id)
  if (!existing) return res.status(404).json({ error: 'User not found' })

  if (password) {
    if (password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' })
    db.prepare(`
      UPDATE app_users SET role=?, can_view=?, can_edit=?, can_delete=?, is_active=?, password_hash=? WHERE id=?
    `).run(role, can_view ? 1 : 0, can_edit ? 1 : 0, can_delete ? 1 : 0, is_active ? 1 : 0, hashPassword(password), id)
  } else {
    db.prepare(`
      UPDATE app_users SET role=?, can_view=?, can_edit=?, can_delete=?, is_active=? WHERE id=?
    `).run(role, can_view ? 1 : 0, can_edit ? 1 : 0, can_delete ? 1 : 0, is_active ? 1 : 0, id)
  }

  return res.json({ success: true })
})

/* ── Delete user ── */
router.delete('/users/:id', (req, res) => {
  const id = Number(req.params.id)
  const result = db.prepare('DELETE FROM app_users WHERE id = ?').run(id)
  if (result.changes === 0) return res.status(404).json({ error: 'User not found' })
  return res.json({ success: true })
})

/* ══════════════════════════════════════════════
   CUSTOMER LEDGER
══════════════════════════════════════════════ */

/* Summary: all customers with total bags & order count */
router.get('/ledger/customers', (_req, res) => {
  const rows = db.prepare(`
    SELECT
      c.id, c.customer_name, c.contact_number,
      COUNT(d.id)                                          AS total_orders,
      COALESCE(SUM(CASE WHEN d.status != 'Cancelled' THEN d.bags_dispatched ELSE 0 END), 0) AS total_bags,
      MAX(d.created_at)                                    AS last_order_at
    FROM customers c
    LEFT JOIN dispatch_orders d ON d.customer_id = c.id
    GROUP BY c.id
    ORDER BY c.customer_name
  `).all()
  res.json(rows)
})

/* Detail: all orders for one customer */
router.get('/ledger/customer/:id', (req, res) => {
  const id = Number(req.params.id)
  const customer = db.prepare('SELECT id, customer_name, contact_number FROM customers WHERE id = ?').get(id)
  if (!customer) return res.status(404).json({ error: 'Customer not found' })

  const orders = db.prepare(`
    SELECT
      d.id, d.packing_size, d.bags_dispatched, d.status, d.created_at,
      it.color_name, it.item_image,
      b.batch_number,
      w.warehouse_name, w.location_city
    FROM dispatch_orders d
    JOIN batches b    ON d.batch_id     = b.id
    JOIN items it     ON b.item_id      = it.id
    JOIN warehouses w ON d.warehouse_id = w.id
    WHERE d.customer_id = ?
    ORDER BY d.created_at DESC
  `).all(id)

  const totals = db.prepare(`
    SELECT
      COUNT(*)                                                           AS total_orders,
      COALESCE(SUM(CASE WHEN status != 'Cancelled' THEN bags_dispatched ELSE 0 END), 0) AS total_bags,
      COALESCE(SUM(CASE WHEN status = 'Picked'    THEN bags_dispatched ELSE 0 END), 0) AS picked_bags,
      COALESCE(SUM(CASE WHEN status = 'Pending'   THEN bags_dispatched ELSE 0 END), 0) AS pending_bags,
      COALESCE(SUM(CASE WHEN status = 'Cancelled' THEN bags_dispatched ELSE 0 END), 0) AS cancelled_bags
    FROM dispatch_orders WHERE customer_id = ?
  `).get(id)

  res.json({ customer, orders, totals })
})

/* ── Admin: edit a dispatch order (status + bags, with inventory reconciliation) ── */
router.put('/ledger/orders/:id', (req, res) => {
  const id = Number(req.params.id)
  const { status, bags_dispatched } = req.body as { status?: string; bags_dispatched?: number }
  const VALID_STATUSES = ['Pending', 'Picked', 'Cancelled']

  try {
    db.transaction(() => {
      const order = db.prepare('SELECT * FROM dispatch_orders WHERE id = ?').get(id) as {
        id: number; customer_id: number; batch_id: number; warehouse_id: number
        packing_size: string; bags_dispatched: number; status: string
      } | undefined
      if (!order) throw new Error('Order not found')

      const newBags = bags_dispatched != null ? Math.round(Number(bags_dispatched)) : order.bags_dispatched
      const newStatus = status ?? order.status
      if (!VALID_STATUSES.includes(newStatus)) throw new Error('Invalid status')
      if (!Number.isInteger(newBags) || newBags <= 0) throw new Error('Bags must be a positive integer')

      const oldBags = order.bags_dispatched
      const oldStatus = order.status
      const wasActive = oldStatus === 'Pending' || oldStatus === 'Picked'
      const isActive  = newStatus === 'Pending' || newStatus === 'Picked'

      // Inventory reconciliation
      if (wasActive && isActive) {
        // Both active: adjust for bag count delta
        const delta = oldBags - newBags
        if (delta !== 0) {
          db.prepare(
            'UPDATE inventory SET quantity_in_stock = quantity_in_stock + ? WHERE batch_id = ? AND warehouse_id = ? AND packing_size = ?'
          ).run(delta, order.batch_id, order.warehouse_id, order.packing_size)
        }
      } else if (wasActive && !isActive) {
        // Active → Cancelled: restore old bags
        db.prepare(
          'UPDATE inventory SET quantity_in_stock = quantity_in_stock + ? WHERE batch_id = ? AND warehouse_id = ? AND packing_size = ?'
        ).run(oldBags, order.batch_id, order.warehouse_id, order.packing_size)
      } else if (!wasActive && isActive) {
        // Cancelled → Active: deduct new bags
        db.prepare(
          'UPDATE inventory SET quantity_in_stock = quantity_in_stock - ? WHERE batch_id = ? AND warehouse_id = ? AND packing_size = ?'
        ).run(newBags, order.batch_id, order.warehouse_id, order.packing_size)
      }

      // dispatch_logs reconciliation
      if (oldStatus === 'Picked' && newStatus !== 'Picked') {
        db.prepare('DELETE FROM dispatch_logs WHERE dispatch_order_id = ?').run(id)
      } else if (oldStatus !== 'Picked' && newStatus === 'Picked') {
        db.prepare(
          'INSERT INTO dispatch_logs (dispatch_order_id, customer_id, batch_id, packing_size, bags_dispatched) VALUES (?, ?, ?, ?, ?)'
        ).run(id, order.customer_id, order.batch_id, order.packing_size, newBags)
      } else if (oldStatus === 'Picked' && newStatus === 'Picked' && oldBags !== newBags) {
        db.prepare('UPDATE dispatch_logs SET bags_dispatched = ? WHERE dispatch_order_id = ?').run(newBags, id)
      }

      db.prepare('UPDATE dispatch_orders SET status = ?, bags_dispatched = ? WHERE id = ?').run(newStatus, newBags, id)
    })()
    return res.json({ success: true })
  } catch (err: unknown) {
    return res.status(409).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
})

/* ── Admin: delete a dispatch order (restores inventory if active) ── */
router.delete('/ledger/orders/:id', (req, res) => {
  const id = Number(req.params.id)
  try {
    db.transaction(() => {
      const order = db.prepare('SELECT * FROM dispatch_orders WHERE id = ?').get(id) as {
        id: number; batch_id: number; warehouse_id: number
        packing_size: string; bags_dispatched: number; status: string
      } | undefined
      if (!order) throw new Error('Order not found')

      if (order.status === 'Pending' || order.status === 'Picked') {
        db.prepare(
          'UPDATE inventory SET quantity_in_stock = quantity_in_stock + ? WHERE batch_id = ? AND warehouse_id = ? AND packing_size = ?'
        ).run(order.bags_dispatched, order.batch_id, order.warehouse_id, order.packing_size)
      }
      if (order.status === 'Picked') {
        db.prepare('DELETE FROM dispatch_logs WHERE dispatch_order_id = ?').run(id)
      }
      db.prepare('DELETE FROM dispatch_orders WHERE id = ?').run(id)
    })()
    return res.json({ success: true })
  } catch (err: unknown) {
    return res.status(409).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
})

/* ══════════════════════════════════════════════
   SUPPLIER LEDGER
══════════════════════════════════════════════ */

/* Summary: all suppliers with total bags received & batch count */
router.get('/ledger/suppliers', (_req, res) => {
  const rows = db.prepare(`
    SELECT
      s.id, s.supplier_name, s.contact_number, s.address,
      COUNT(DISTINCT b.id)                          AS total_batches,
      COALESCE(SUM(inv.quantity_in_stock), 0)       AS current_stock_bags,
      MAX(b.import_date)                            AS last_inward_date
    FROM suppliers s
    LEFT JOIN batches b   ON b.supplier_id = s.id
    LEFT JOIN inventory inv ON inv.batch_id = b.id
    GROUP BY s.id
    ORDER BY s.supplier_name
  `).all()
  res.json(rows)
})

/* Detail: all inward batches for one supplier */
router.get('/ledger/supplier/:id', (req, res) => {
  const id = Number(req.params.id)
  const supplier = db.prepare('SELECT id, supplier_name, contact_number, address FROM suppliers WHERE id = ?').get(id)
  if (!supplier) return res.status(404).json({ error: 'Supplier not found' })

  const batches = db.prepare(`
    SELECT
      b.id AS batch_id, b.batch_number, b.import_date, b.status AS batch_status,
      it.color_name, it.item_image,
      COALESCE(SUM(inv.quantity_in_stock), 0) AS current_stock,
      GROUP_CONCAT(DISTINCT w.warehouse_name)  AS warehouses,
      GROUP_CONCAT(DISTINCT inv.packing_size)  AS pack_sizes
    FROM batches b
    JOIN items it        ON b.item_id   = it.id
    LEFT JOIN inventory inv ON inv.batch_id = b.id
    LEFT JOIN warehouses w  ON inv.warehouse_id = w.id
    WHERE b.supplier_id = ?
    GROUP BY b.id
    ORDER BY b.import_date DESC
  `).all(id)

  const totals = db.prepare(`
    SELECT
      COUNT(DISTINCT b.id)                    AS total_batches,
      COALESCE(SUM(inv.quantity_in_stock), 0) AS current_stock_bags
    FROM batches b
    LEFT JOIN inventory inv ON inv.batch_id = b.id
    WHERE b.supplier_id = ?
  `).get(id)

  res.json({ supplier, batches, totals })
})

/* ══════════════════════════════════════════════
   STOCK INWARD — EDIT / DELETE (admin only)
══════════════════════════════════════════════ */

/* List all batches with their inventory lines */
router.get('/inward', (_req, res) => {
  const batches = db.prepare(`
    SELECT
      b.id, b.batch_number, b.import_date, b.status, b.notes, b.created_at,
      b.supplier_id, s.supplier_name,
      it.id AS item_id, it.color_name, it.item_image
    FROM batches b
    JOIN items it ON b.item_id = it.id
    LEFT JOIN suppliers s ON b.supplier_id = s.id
    ORDER BY b.created_at DESC
  `).all() as Record<string, unknown>[]

  const invRows = db.prepare(`
    SELECT inv.id, inv.batch_id, inv.warehouse_id, inv.packing_size,
           inv.quantity_in_stock, inv.godown_rack_location,
           w.warehouse_name, w.location_city
    FROM inventory inv
    JOIN warehouses w ON inv.warehouse_id = w.id
  `).all() as { batch_id: number; [k: string]: unknown }[]

  const invByBatch: Record<number, unknown[]> = {}
  for (const r of invRows) {
    if (!invByBatch[r.batch_id]) invByBatch[r.batch_id] = []
    invByBatch[r.batch_id].push(r)
  }

  res.json(batches.map(b => ({ ...b, inventory: invByBatch[b.id as number] ?? [] })))
})

/* Edit batch metadata */
router.put('/inward/batches/:id', (req, res) => {
  const id = Number(req.params.id)
  const { batch_number, import_date, notes, supplier_id } = req.body as {
    batch_number: string; import_date: string; notes: string; supplier_id: number | null
  }
  if (!batch_number?.trim() || !import_date?.trim()) {
    return res.status(400).json({ error: 'batch_number and import_date are required' })
  }
  if (!db.prepare('SELECT id FROM batches WHERE id = ?').get(id)) {
    return res.status(404).json({ error: 'Batch not found' })
  }
  try {
    db.prepare('UPDATE batches SET batch_number=?, import_date=?, notes=?, supplier_id=? WHERE id=?')
      .run(batch_number.trim(), import_date.trim(), notes ?? '', supplier_id ? Number(supplier_id) : null, id)
    return res.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    if (msg.includes('UNIQUE')) return res.status(409).json({ error: 'Batch number already exists for this item' })
    return res.status(500).json({ error: msg })
  }
})

/* Edit an inventory line (quantity + godown location) */
router.put('/inward/inventory/:id', (req, res) => {
  const id = Number(req.params.id)
  const { quantity_in_stock, godown_rack_location } = req.body as {
    quantity_in_stock: number; godown_rack_location: string
  }
  const qty = Number(quantity_in_stock)
  if (!Number.isInteger(qty) || qty < 0) {
    return res.status(400).json({ error: 'quantity_in_stock must be a non-negative integer' })
  }
  if (!db.prepare('SELECT id FROM inventory WHERE id = ?').get(id)) {
    return res.status(404).json({ error: 'Inventory line not found' })
  }
  db.prepare('UPDATE inventory SET quantity_in_stock=?, godown_rack_location=? WHERE id=?')
    .run(qty, godown_rack_location ?? '', id)
  return res.json({ success: true })
})

/* Delete an entire batch (+ all inventory lines) */
router.delete('/inward/batches/:id', (req, res) => {
  const id = Number(req.params.id)
  const { cnt } = db.prepare(
    "SELECT COUNT(*) AS cnt FROM dispatch_orders WHERE batch_id=? AND status='Pending'"
  ).get(id) as { cnt: number }
  if (cnt > 0) {
    return res.status(409).json({ error: `Cannot delete: ${cnt} pending dispatch order(s) use this batch` })
  }
  db.transaction(() => {
    db.prepare('DELETE FROM inventory WHERE batch_id=?').run(id)
    db.prepare('DELETE FROM batches WHERE id=?').run(id)
  })()
  return res.json({ success: true })
})

/* Delete a single inventory line */
router.delete('/inward/inventory/:id', (req, res) => {
  const id = Number(req.params.id)
  const inv = db.prepare('SELECT batch_id, warehouse_id, packing_size FROM inventory WHERE id=?').get(id) as {
    batch_id: number; warehouse_id: number; packing_size: string
  } | undefined
  if (!inv) return res.status(404).json({ error: 'Inventory line not found' })
  const { cnt } = db.prepare(
    "SELECT COUNT(*) AS cnt FROM dispatch_orders WHERE batch_id=? AND warehouse_id=? AND packing_size=? AND status='Pending'"
  ).get(inv.batch_id, inv.warehouse_id, inv.packing_size) as { cnt: number }
  if (cnt > 0) {
    return res.status(409).json({ error: `Cannot delete: ${cnt} pending order(s) use this inventory line` })
  }
  db.prepare('DELETE FROM inventory WHERE id=?').run(id)
  return res.json({ success: true })
})

/* ══════════════════════════════════════════════
   GOOGLE DRIVE BACKUP
══════════════════════════════════════════════ */

router.get('/backup/gdrive/status', (_req, res) => {
  try {
    const remotes = execSync('rclone listremotes 2>/dev/null', { timeout: 5000 }).toString()
    const configured = remotes.includes('gdrive:')
    return res.json({ configured })
  } catch {
    return res.json({ configured: false })
  }
})

router.post('/backup/gdrive', (_req, res) => {
  let configured = false
  try {
    const remotes = execSync('rclone listremotes 2>/dev/null', { timeout: 5000 }).toString()
    configured = remotes.includes('gdrive:')
  } catch { /* rclone not installed */ }

  if (!configured) {
    return res.status(400).json({
      ok: false,
      message: 'Google Drive not configured. Run scripts/setup-gdrive.sh on the server first.',
    })
  }

  execFile('bash', [BACKUP_SCRIPT], { timeout: 120_000 }, (err, stdout, stderr) => {
    if (err) return res.status(500).json({ ok: false, message: stderr || err.message })
    return res.json({ ok: true, message: 'Backup uploaded to Google Drive successfully', output: stdout })
  })
})

/* ══════════════════════════════════════════════
   EXPORT / IMPORT (disaster recovery)
══════════════════════════════════════════════ */

const EXPORT_TABLES = [
  'items', 'warehouses', 'suppliers', 'customers',
  'batches', 'inventory',
  'dispatch_orders', 'dispatch_logs', 'stock_transfers',
  'app_users',
] as const

router.get('/backup/export', (_req, res) => {
  const data: Record<string, unknown[]> = {}
  for (const table of EXPORT_TABLES) {
    data[table] = db.prepare(`SELECT * FROM ${table}`).all()
  }
  const payload = { exported_at: new Date().toISOString(), schema_version: 1, data }
  const date = new Date().toISOString().split('T')[0]
  res.setHeader('Content-Disposition', `attachment; filename="warehouse-backup-${date}.json"`)
  res.json(payload)
})

router.post('/backup/import', (req, res) => {
  const { data } = req.body as { data: Record<string, Record<string, unknown>[]> }
  if (!data || typeof data !== 'object') return res.status(400).json({ error: 'Invalid backup file' })

  db.transaction(() => {
    db.pragma('foreign_keys = OFF')

    // Delete in reverse dependency order
    for (const table of [...EXPORT_TABLES].reverse()) {
      if (data[table] !== undefined) db.prepare(`DELETE FROM ${table}`).run()
    }

    // Reset autoincrement counters
    db.prepare("DELETE FROM sqlite_sequence WHERE name IN (" +
      EXPORT_TABLES.map(() => '?').join(',') + ")"
    ).run(...EXPORT_TABLES)

    // Insert in dependency order
    for (const table of EXPORT_TABLES) {
      const rows = data[table]
      if (!rows?.length) continue
      const cols = Object.keys(rows[0])
      const stmt = db.prepare(
        `INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`
      )
      for (const row of rows) stmt.run(cols.map(c => row[c]))
    }

    db.pragma('foreign_keys = ON')
  })()

  return res.json({ success: true, tables: Object.keys(data) })
})

export default router
