import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = process.env.WMS_DB_PATH ?? path.join(__dirname, '..', 'warehouse.db')

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

/* ── Schema ── */
db.exec(`
  CREATE TABLE IF NOT EXISTS items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    color_name  TEXT NOT NULL UNIQUE,
    hsn_code    TEXT NOT NULL DEFAULT '7018.90.00',
    item_image  TEXT DEFAULT NULL
  );

  CREATE TABLE IF NOT EXISTS batches (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id      INTEGER NOT NULL REFERENCES items(id),
    batch_number TEXT NOT NULL,
    import_date  TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active','Depleted')),
    batch_image  TEXT DEFAULT NULL,
    UNIQUE(item_id, batch_number)
  );

  CREATE TABLE IF NOT EXISTS warehouses (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    warehouse_name TEXT NOT NULL UNIQUE,
    location_city  TEXT NOT NULL DEFAULT '',
    is_active      INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS inventory (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id             INTEGER NOT NULL REFERENCES batches(id),
    warehouse_id         INTEGER NOT NULL REFERENCES warehouses(id),
    packing_size         TEXT NOT NULL,
    quantity_in_stock    INTEGER NOT NULL DEFAULT 0 CHECK(quantity_in_stock >= 0),
    godown_rack_location TEXT NOT NULL DEFAULT '',
    UNIQUE(batch_id, warehouse_id, packing_size)
  );

  CREATE TABLE IF NOT EXISTS customers (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name   TEXT NOT NULL,
    contact_number  TEXT NOT NULL DEFAULT '',
    gst_number      TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS dispatch_orders (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id     INTEGER NOT NULL REFERENCES customers(id),
    batch_id        INTEGER NOT NULL REFERENCES batches(id),
    warehouse_id    INTEGER NOT NULL REFERENCES warehouses(id),
    packing_size    TEXT NOT NULL,
    bags_dispatched INTEGER NOT NULL CHECK(bags_dispatched > 0),
    status          TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Picked','Cancelled')),
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS suppliers (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_name   TEXT NOT NULL,
    contact_number  TEXT NOT NULL DEFAULT '',
    address         TEXT NOT NULL DEFAULT '',
    gst_number      TEXT NOT NULL DEFAULT '',
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS dispatch_logs (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    dispatch_order_id INTEGER NOT NULL REFERENCES dispatch_orders(id),
    customer_id       INTEGER NOT NULL REFERENCES customers(id),
    batch_id          INTEGER NOT NULL REFERENCES batches(id),
    packing_size      TEXT NOT NULL,
    bags_dispatched   INTEGER NOT NULL,
    confirmed_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS stock_transfers (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    from_warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
    to_warehouse_id   INTEGER NOT NULL REFERENCES warehouses(id),
    batch_id          INTEGER NOT NULL REFERENCES batches(id),
    packing_size      TEXT NOT NULL,
    bags              INTEGER NOT NULL CHECK(bags > 0),
    notes             TEXT NOT NULL DEFAULT '',
    transferred_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS app_users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'helper' CHECK(role IN ('manager','helper','admin')),
    can_view      INTEGER NOT NULL DEFAULT 1,
    can_edit      INTEGER NOT NULL DEFAULT 0,
    can_delete    INTEGER NOT NULL DEFAULT 0,
    can_view_dashboard INTEGER NOT NULL DEFAULT 1,
    can_view_warehouse INTEGER NOT NULL DEFAULT 1,
    can_view_master    INTEGER NOT NULL DEFAULT 1,
    can_view_report    INTEGER NOT NULL DEFAULT 1,
    is_active     INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );
`)

/* ── Migrations ── */
// Add item_image to items if not present (existing DB)
try { db.exec("ALTER TABLE items ADD COLUMN item_image TEXT DEFAULT NULL") } catch { /* already exists */ }
// Add notes to batches if not present
try { db.exec("ALTER TABLE batches ADD COLUMN notes TEXT NOT NULL DEFAULT ''") } catch { /* already exists */ }
// Add supplier_id to batches if not present
try { db.exec("ALTER TABLE batches ADD COLUMN supplier_id INTEGER REFERENCES suppliers(id) DEFAULT NULL") } catch { /* already exists */ }
// Add per-page view flags to app_users if not present (existing DB)
try { db.exec("ALTER TABLE app_users ADD COLUMN can_view_dashboard INTEGER NOT NULL DEFAULT 1") } catch { /* already exists */ }
try { db.exec("ALTER TABLE app_users ADD COLUMN can_view_warehouse INTEGER NOT NULL DEFAULT 1") } catch { /* already exists */ }
try { db.exec("ALTER TABLE app_users ADD COLUMN can_view_master    INTEGER NOT NULL DEFAULT 1") } catch { /* already exists */ }
try { db.exec("ALTER TABLE app_users ADD COLUMN can_view_report    INTEGER NOT NULL DEFAULT 1") } catch { /* already exists */ }
// Add gst_number to customers/suppliers if not present (existing DB)
try { db.exec("ALTER TABLE customers ADD COLUMN gst_number TEXT NOT NULL DEFAULT ''") } catch { /* already exists */ }
try { db.exec("ALTER TABLE suppliers ADD COLUMN gst_number TEXT NOT NULL DEFAULT ''") } catch { /* already exists */ }
// Add order_group to dispatch_orders if not present (existing DB) — NULL means "not part of a
// multi-line cart order" (every pre-existing row, and every future single-line POST /dispatch
// row); rows created together via POST /dispatch/bulk share a non-NULL value (the first row's own
// id) so the Picking list can render them as one card with one Confirm Picked/Print/Share action.
try { db.exec("ALTER TABLE dispatch_orders ADD COLUMN order_group INTEGER DEFAULT NULL") } catch { /* already exists */ }
// Add batch_image to batches if not present (existing DB) — one-time backfill from the item's
// shared image, since that's the best available guess for what each batch used to show before
// images became batch-specific. Only runs the backfill the moment the column is first added,
// never again on subsequent restarts (batches created afterwards intentionally start with no image).
let justAddedBatchImage = false
try { db.exec("ALTER TABLE batches ADD COLUMN batch_image TEXT DEFAULT NULL"); justAddedBatchImage = true } catch { /* already exists */ }
if (justAddedBatchImage) {
  db.exec(`
    UPDATE batches SET batch_image = (SELECT item_image FROM items WHERE items.id = batches.item_id)
    WHERE batch_image IS NULL
  `)
}

/* ── Seed default admin if no users exist ── */
const userCount = (db.prepare('SELECT COUNT(*) AS c FROM app_users').get() as { c: number }).c
if (userCount === 0) {
  // Import inline to avoid circular deps at module load time
  const { randomBytes, scryptSync } = await import('crypto')
  const password = randomBytes(6).toString('base64url')
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  const stored = `${salt}:${hash}`
  db.prepare(`
    INSERT INTO app_users (username, password_hash, role, can_view, can_edit, can_delete, is_active)
    VALUES ('admin', ?, 'manager', 1, 1, 1, 1)
  `).run(stored)
  console.log('\n╔══════════════════════════════════════════╗')
  console.log('║  DEFAULT ADMIN ACCOUNT CREATED            ║')
  console.log(`║  Username : admin                         ║`)
  console.log(`║  Password : ${password.padEnd(28)}║`)
  console.log('║  Change this immediately after first login ║')
  console.log('╚══════════════════════════════════════════╝\n')
}

// Remove packing_size CHECK constraint on inventory if present (old schema used IN ('20kg','25kg'))
const inventorySql = (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='inventory'").get() as { sql: string } | undefined)?.sql ?? ''
if (inventorySql.includes("'20kg'") || inventorySql.includes('"20kg"')) {
  db.pragma('foreign_keys = OFF')
  db.exec(`
    CREATE TABLE inventory_v2 (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id             INTEGER NOT NULL REFERENCES batches(id),
      warehouse_id         INTEGER NOT NULL REFERENCES warehouses(id),
      packing_size         TEXT NOT NULL,
      quantity_in_stock    INTEGER NOT NULL DEFAULT 0 CHECK(quantity_in_stock >= 0),
      godown_rack_location TEXT NOT NULL DEFAULT '',
      UNIQUE(batch_id, warehouse_id, packing_size)
    );
    INSERT INTO inventory_v2 SELECT * FROM inventory;
    DROP TABLE inventory;
    ALTER TABLE inventory_v2 RENAME TO inventory;
  `)
  db.pragma('foreign_keys = ON')
}

const dispatchSql = (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='dispatch_orders'").get() as { sql: string } | undefined)?.sql ?? ''
if (dispatchSql.includes("'20kg'") || dispatchSql.includes('"20kg"')) {
  db.pragma('foreign_keys = OFF')
  db.exec(`
    CREATE TABLE dispatch_orders_v2 (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id     INTEGER NOT NULL REFERENCES customers(id),
      batch_id        INTEGER NOT NULL REFERENCES batches(id),
      warehouse_id    INTEGER NOT NULL REFERENCES warehouses(id),
      packing_size    TEXT NOT NULL,
      bags_dispatched INTEGER NOT NULL CHECK(bags_dispatched > 0),
      status          TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Picked','Cancelled')),
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO dispatch_orders_v2 SELECT * FROM dispatch_orders;
    DROP TABLE dispatch_orders;
    ALTER TABLE dispatch_orders_v2 RENAME TO dispatch_orders;
  `)
  db.pragma('foreign_keys = ON')
}

const transfersSql = (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='stock_transfers'").get() as { sql: string } | undefined)?.sql ?? ''
if (transfersSql.includes("'20kg'") || transfersSql.includes('"20kg"')) {
  db.pragma('foreign_keys = OFF')
  db.exec(`
    CREATE TABLE stock_transfers_v2 (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      from_warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
      to_warehouse_id   INTEGER NOT NULL REFERENCES warehouses(id),
      batch_id          INTEGER NOT NULL REFERENCES batches(id),
      packing_size      TEXT NOT NULL,
      bags              INTEGER NOT NULL CHECK(bags > 0),
      notes             TEXT NOT NULL DEFAULT '',
      transferred_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO stock_transfers_v2 SELECT * FROM stock_transfers;
    DROP TABLE stock_transfers;
    ALTER TABLE stock_transfers_v2 RENAME TO stock_transfers;
  `)
  db.pragma('foreign_keys = ON')
}

// Widen app_users.role CHECK constraint to allow 'admin' (user-management-only role)
const appUsersSql = (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='app_users'").get() as { sql: string } | undefined)?.sql ?? ''
if (!appUsersSql.includes("'admin'")) {
  db.pragma('foreign_keys = OFF')
  db.exec(`
    CREATE TABLE app_users_v2 (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'helper' CHECK(role IN ('manager','helper','admin')),
      can_view      INTEGER NOT NULL DEFAULT 1,
      can_edit      INTEGER NOT NULL DEFAULT 0,
      can_delete    INTEGER NOT NULL DEFAULT 0,
      can_view_dashboard INTEGER NOT NULL DEFAULT 1,
      can_view_warehouse INTEGER NOT NULL DEFAULT 1,
      can_view_master    INTEGER NOT NULL DEFAULT 1,
      is_active     INTEGER NOT NULL DEFAULT 1,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO app_users_v2 (id, username, password_hash, role, can_view, can_edit, can_delete, can_view_dashboard, can_view_warehouse, can_view_master, is_active, created_at)
    SELECT id, username, password_hash, role, can_view, can_edit, can_delete, can_view_dashboard, can_view_warehouse, can_view_master, is_active, created_at
    FROM app_users;
    DROP TABLE app_users;
    ALTER TABLE app_users_v2 RENAME TO app_users;
  `)
  db.pragma('foreign_keys = ON')
}

// Add original_quantity to inventory — records bags received at inward time, never decremented
let justAddedOriginalQuantity = false
try {
  db.exec("ALTER TABLE inventory ADD COLUMN original_quantity INTEGER NOT NULL DEFAULT 0")
  justAddedOriginalQuantity = true
} catch { /* already exists */ }

if (justAddedOriginalQuantity) {
  // Backfill: reconstruct original inward quantity =
  //   current balance
  //   + all bags ever dispatched from this (batch, warehouse, packing_size)
  //   + bags transferred OUT from this warehouse
  //   - bags transferred IN to this warehouse
  //
  // dispatch_logs itself has no warehouse_id (only dispatch_orders does), so the dispatched-bags
  // subquery joins through dispatch_orders to scope by warehouse. Without this join, a batch with
  // inventory lines in multiple warehouses (i.e. any batch that's ever been split via a transfer)
  // would have its dispatched total double-counted against every one of that batch's warehouse
  // lines instead of just the one it was actually dispatched from.
  db.exec(`
    UPDATE inventory SET original_quantity = quantity_in_stock + (
      SELECT COALESCE(SUM(dl.bags_dispatched), 0)
      FROM dispatch_logs dl
      JOIN dispatch_orders do ON do.id = dl.dispatch_order_id
      WHERE do.batch_id     = inventory.batch_id
        AND do.packing_size = inventory.packing_size
        AND do.warehouse_id = inventory.warehouse_id
    ) + (
      SELECT COALESCE(SUM(st.bags), 0)
      FROM stock_transfers st
      WHERE st.batch_id          = inventory.batch_id
        AND st.packing_size      = inventory.packing_size
        AND st.from_warehouse_id = inventory.warehouse_id
    ) - (
      SELECT COALESCE(SUM(st.bags), 0)
      FROM stock_transfers st
      WHERE st.batch_id        = inventory.batch_id
        AND st.packing_size    = inventory.packing_size
        AND st.to_warehouse_id = inventory.warehouse_id
    )
  `)
}

export default db
