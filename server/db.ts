import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.join(__dirname, '..', 'warehouse.db')

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
    contact_number  TEXT NOT NULL DEFAULT ''
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
    role          TEXT NOT NULL DEFAULT 'helper' CHECK(role IN ('manager','helper')),
    can_view      INTEGER NOT NULL DEFAULT 1,
    can_edit      INTEGER NOT NULL DEFAULT 0,
    can_delete    INTEGER NOT NULL DEFAULT 0,
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

export default db
