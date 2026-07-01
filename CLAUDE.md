# Warehouse-Stocks WMS — Project Context

## What this app is
Glass Beads Warehouse Management System (WMS). React + TypeScript frontend, Express + SQLite backend, served via nginx. Runs as a mobile-friendly web app + Capacitor Android APK.

## Tech stack
- **Frontend:** React 19, TypeScript, Tailwind CSS, Vite
- **Backend:** Express 5, better-sqlite3, tsx (runs TypeScript directly, no compile step)
- **Realtime:** WebSocket broadcast on all mutations
- **Process manager:** PM2 (`warehouse-api`, id 4)
- **Serving:** nginx on port 8088 → static `dist/` + proxies `/api` and `/ws` to Node on port 3005
- **Mobile:** Capacitor Android wrapper — app loads from live server URL (http://116.74.77.22:8088)

## Production server
- **IP:** 116.74.77.22
- **SSH user:** dckakadia
- **App path:** `/home/dckakadia/warehouse-stocks/`
- **Port:** 8088 (nginx), 3005 (Node API)
- **PM2 name:** `warehouse-api` (id 4, PORT env = 3005)
- **IMPORTANT:** Many other apps run on this server (order-manager, gps-tracker, rent-manager, purchase_order). Always audit before touching nginx or ports.

## Deployment procedure
1. Make changes locally in `/Users/devinkakadia/Desktop/warehouse/Warehouse-Stocks/`
2. Build frontend: `npm run build` (outputs to `dist/`)
3. Type-check backend: `npx tsc --project tsconfig.node.json --noEmit`
4. Sync dist: `rsync -avz --delete dist/ dckakadia@116.74.77.22:/home/dckakadia/warehouse-stocks/dist/`
   - **WARNING:** `--delete` removes `dist/updates/` — re-upload APK after if needed
5. Sync server root files: `rsync -avz server/auth.ts server/db.ts server/index.ts dckakadia@116.74.77.22:/home/dckakadia/warehouse-stocks/server/`
6. Sync middleware: `rsync -avz server/middleware/requireAuth.ts dckakadia@116.74.77.22:/home/dckakadia/warehouse-stocks/server/middleware/`
7. Sync routes: `rsync -avz server/routes/ dckakadia@116.74.77.22:/home/dckakadia/warehouse-stocks/server/routes/`
8. Sync scripts: `rsync -avz scripts/ dckakadia@116.74.77.22:/home/dckakadia/warehouse-stocks/scripts/`
9. Restart: `ssh dckakadia@116.74.77.22 'pm2 restart warehouse-api'`
10. Verify: `ssh dckakadia@116.74.77.22 'pm2 logs warehouse-api --lines 20 --nostream'`

No server-side TypeScript compile needed — tsx runs `.ts` directly.

## Authentication system (added July 2026)
- **Token format:** HMAC-SHA256 signed — `base64url(payload) + "." + base64url(sig)`
- **Secret:** `server/.auth_secret` — generated on first run, persists across restarts (do NOT commit)
- **TTL:** 24 hours
- **Storage:** sessionStorage (NOT localStorage — shared warehouse devices)
- **Login:** `POST /api/auth/login` — rate limited 5 attempts / 15 min / IP (in-memory)
- **Protection:** `app.use('/api', requireAuth)` in server/index.ts; `/api/auth/*` is public
- **Rights middlewares:** `requireEdit`, `requireDelete`, `requireUserAdmin` (manager or admin role — ledgers/inward edit), `requireAdmin` (admin role only — Admin Panel: Users + Backup, added July 2026) in server/middleware/requireAuth.ts
- **Default admin:** Seeded whenever `app_users` table is empty at server startup — credentials printed to PM2 logs. **Recovery trick:** if every user (including the last manager/admin) is ever deleted, nobody can log in, but `pm2 restart warehouse-api` re-triggers this seed on next startup since the check runs at module load, not per-request — this is the fastest way to regain access without touching the DB directly.
- **Password hashing:** Node built-in `crypto.scryptSync` + random salt (no bcrypt dependency)
- **Database wiped:** 2026-07-01 — fresh start. New default admin credentials were printed to PM2 logs at that time.
- **Incident — 2026-07-01:** the `admin` user was accidentally deleted from production via Admin → Users, and turned out to be the *only* row left in `app_users`, locking everyone out. Fixed by restarting `warehouse-api`, which re-seeded a fresh `admin`/manager account (see recovery trick above). All previously-created users (helpers, other managers) were lost and had to be recreated manually — the auto-seed only restores the single default admin, not the full user list. A DB backup taken shortly before this (`warehouse_20260701_152519.db.gz`, synced to Google Drive) may still hold the pre-deletion user list if needed.
- **Business-data wipe — 2026-07-01 (later same day):** all business data manually wiped from production on request, via a direct `better-sqlite3` script run over SSH (deletes in FK-safe child-before-parent order: `dispatch_logs` → `stock_transfers` → `dispatch_orders` → `inventory` → `batches` → `customers` → `suppliers` → `items`, plus resetting `sqlite_sequence` for each so new IDs start at 1). `app_users` and `warehouses` were deliberately kept intact — no login lockout, no re-seed needed this time. A full backup was taken first via `scripts/backup-db.sh` (`warehouse_20260701_173636.db.gz`, local + Google Drive) before the wipe, so it's restorable if needed. There's no dedicated API endpoint for a "wipe all except users" partial reset — `POST /admin/backup/import` (full restore) wipes `app_users` too, so this had to be a one-off script.

## APK auto-update system (added July 2026)
- `src/version.ts` — `APP_VERSION` constant embedded in the JS bundle
- `public/version.json` — served at `/version.json`; checked by running APKs on launch
- `dist/updates/app-latest.apk` — served at `/updates/app-latest.apk`; APKs download this for updates
- `src/hooks/useAppUpdate.ts` — polls `/version.json` 3s after launch (native only); shows banner if newer
- `src/components/UpdateBanner.tsx` — blue banner at top of screen with "Update" button
- **Release command:** `bash scripts/release-apk.sh <version>` — bumps version, builds APK, deploys everything
- Java 21 required for Gradle: `JAVA_HOME=/opt/homebrew/opt/openjdk@21`

## Backup & Restore system (added July 2026)
- **Admin page → Backup tab** has three sections:
  1. **Export:** Downloads full JSON snapshot (all tables + item images as base64)
  2. **Import:** Upload JSON to restore all data (wipes current data first — confirmation required)
  3. **Google Drive:** Live status + "Backup to Drive Now" button + setup instructions
- **Server endpoints:**
  - `GET /api/admin/backup/export` — full JSON export
  - `POST /api/admin/backup/import` — restore from JSON body
  - `GET /api/admin/backup/gdrive/status` — checks if rclone gdrive: remote is configured
  - `POST /api/admin/backup/gdrive` — runs backup-db.sh which uploads to Drive
- **Scripts:**
  - `scripts/backup-db.sh` — SQLite dump → gzip locally → upload to Google Drive if rclone configured
  - `scripts/setup-gdrive.sh` — one-time interactive setup (installs rclone, OAuth to Google, creates folder)
  - `scripts/release-apk.sh <ver>` — full APK release pipeline
- **Google Drive setup (run once on server):**
  ```bash
  bash /home/dckakadia/warehouse-stocks/scripts/setup-gdrive.sh
  ```

## Key source files
### Backend
- `server/index.ts` — Express app + WebSocket server + route registration + request logger
- `server/db.ts` — SQLite schema + migrations + default admin seed
- `server/auth.ts` — Token sign/verify utilities, `AUTH_SECRET` loading
- `server/middleware/requireAuth.ts` — `requireAuth`, `requireEdit`, `requireDelete`, `requireUserAdmin` (manager or admin role — gates `/ledger/*` and `/inward/*`), `requireAdmin` (admin role only — gates `/users/*` and `/backup/*`, added July 2026 after managers were found to still have Admin Panel access)
- `server/routes/auth.ts` — POST /api/auth/login + logout
- `server/routes/admin.ts` — Single router, split by prefix (July 2026): `requireAdmin` on `/users` and `/backup` (the actual Admin Panel — User CRUD, export/import, Google Drive backup, admin role only); `requireUserAdmin` on `/ledger` and `/inward` (Report page ledgers + Warehouse Records tab edit/delete, manager or admin — these are separate pages that happen to share the `/admin` URL prefix, not part of the Admin Panel proper). `DELETE /inward/batches/:id` and `DELETE /inward/inventory/:id` wrap their transaction in try/catch (July 2026 fix) — deleting a batch/inventory line with dispatch or transfer history throws a FK constraint error that previously crashed the process uncaught; now returns a 409 with a clear message instead.
- `server/routes/masters.ts` — Items, suppliers, customers, warehouses CRUD. Customer/supplier create+update block duplicates: same name (case-insensitive), same non-empty `gst_number`, or same non-empty `contact_number` all return 409 `"<Name>" already exists with the same name, GST number, or mobile number`. `server/routes/customers.ts` (the quick-add endpoint used by the Dashboard's Add Customer modal) enforces the identical check so there's no bypass route.
- `server/routes/inwarding.ts` — Batch inward (all-or-nothing validation). `PUT /admin/inward/batches/:id/full` (in admin.ts) mirrors this for editing an existing batch: replaces item/color, metadata, image, and the full set of inventory lines in one call — add/update/remove lines together, guarded against removing a line with pending dispatch orders.
- `server/routes/transfers.ts` — Inter-warehouse stock transfers
- `server/routes/reports.ts` — `GET /reports/daily?from=&to=` (added July 2026): aggregates inward batches (grouped, with supplier + per-line warehouse/pack-size breakdown), outward dispatch orders (excludes Cancelled, with customer name), and transfers for a date range, for the Report page's Daily Report tab. No role gate beyond `requireAuth` — registered directly under `/api`, not `/api/admin`.
- `server/routes/dispatch.ts` — Dispatch orders

### Frontend
- `src/App.tsx` — Root component: login gate, header, nav, view routing, update banner
- `src/api.ts` — All API calls + TypeScript types; auth token injection
- `src/version.ts` — `APP_VERSION` constant (bump before each APK release)
- `src/hooks/useAuth.ts` — Login/logout state, sessionStorage token management
- `src/hooks/useWSSync.ts` — WebSocket connection + refresh trigger on broadcast
- `src/hooks/useToast.ts` — Toast notification queue
- `src/hooks/useAppUpdate.ts` — APK update checker (native only, polls /version.json)
- `src/utils.ts` — W_COLORS, whColor, todayISO, parseKgPerBag, compressImage
- `src/icons.tsx` — All SVG icons in `Ic` object (Download, Upload, Cloud added July 2026)
- `src/components/Login.tsx` — Login form with password strength indicator
- `src/components/UpdateBanner.tsx` — APK update notification banner
- `src/components/ConfirmDialog.tsx` — Reusable confirmation modal (danger/neutral)
- `src/components/Lightbox.tsx` — Image lightbox
- `src/components/AddCustomerModal.tsx` — Add customer modal
- `src/components/CreateDispatchModal.tsx` — Create dispatch order modal
- `src/pages/Dashboard.tsx` — Global stock summary, accordion by item
- `src/pages/Warehouse.tsx` — Picking list (with search), inward, transfer tabs. Records tab's "Edit batch" now opens a full multi-line editor (color/item, batch info, image, add/remove inventory lines across warehouses) matching the "+ Inward" creation form, calling `api.updateInwardBatchFull` — replaced the old batch-metadata-only + single-inventory-line-only edit modals (July 2026).
- `src/pages/Master.tsx` — CRUD for items, customers, suppliers, warehouses
- `src/pages/Admin.tsx` — User management + Backup tab (manager and admin roles — identical access)
- `src/pages/Report.tsx` — Daily Report + Customer Ledger + Supplier Ledger + Warehouse Transfers tabs (any role with `can_view_report`; ledgers moved out of Admin.tsx July 2026, transfer report added July 2026). Daily Report (added July 2026, default tab) is read-only — a date-range picker (defaults to today) showing inward stock (with supplier + per-warehouse/pack-size breakdown), outward stock (with customer name), and warehouse transfers for the period, plus summary stat cards and Print/PDF export. It calls `GET /api/reports/daily` (`server/routes/reports.ts`), registered as a plain route with no role gate (like `/transfers`) — deliberately NOT under `/api/admin`, so it isn't affected by `requireUserAdmin`/`requireAdmin` and works for any role with `can_view_report`, unlike the Customer/Supplier Ledger tabs below. `ReportPage` takes `canEdit`/`canDelete` props (from the logged-in user's rights, same as Master/Warehouse pages) and threads them into the ledger/transfer tabs — edit/delete buttons are hidden, not just disabled, when the flag is off. Customer Ledger edits dispatch orders (existing `/admin/ledger/orders/:id`); Supplier Ledger edits/deletes the inward batch (`/admin/inward/batches/:id`, batch number/date/notes only — supplier assignment isn't editable from this view); Warehouse Transfers edits bags/notes or deletes a transfer via new `PUT`/`DELETE /api/transfers/:id`, which reconciles inventory in both the source and destination warehouse (mirrors the dispatch-order reconciliation pattern). When editing these reconciliation queries, use plain `UPDATE ... WHERE id = ?` on inventory rows known to exist — do NOT use `INSERT ... ON CONFLICT DO UPDATE` with a possibly-negative literal in `VALUES`, because SQLite validates CHECK constraints (`quantity_in_stock >= 0`) against the literal insert value before conflict resolution ever applies, so a legitimate net-positive update can fail spuriously.

## Database schema (SQLite, file: warehouse.db)
- `items` — color/item master (color_name, hsn_code, item_image as base64 — now only a **fallback default** shown when a batch has no photo of its own; not the source of truth for display)
- `batches` — batch records per item. `batch_image` (added July 2026) is the photo for that specific batch — batches commonly span multiple warehouses (via transfers or re-inwarding the same batch number), so the photo is scoped to the batch, not batch+warehouse. Read queries expose `COALESCE(b.batch_image, it.item_image) AS item_image` for display; the `/admin/inward` list additionally returns raw `batch_image` so the Records edit form can tell "this batch has no photo yet" apart from "borrowing the item's default" (avoids silently freezing a borrowed default as this batch's own image on save). Write paths (`POST /api/inward`, `PUT /admin/inward/batches/:id/full`) accept `batch_image` in the request body, not `item_image`.
- `warehouses` — warehouse master
- `inventory` — stock per batch × warehouse × packing_size. Has an unused `godown_rack_location` column (July 2026: removed from every form/display/API write path app-wide per request, but the column itself was deliberately left in place rather than dropped, since production already had real values in it — no destructive schema change was made. If reviving this feature, note the batch-edit endpoint's UPDATE/INSERT statements intentionally don't reference this column at all so as to never blank out old values.)
- `customers` — customer master (`customer_name`, `contact_number`, `gst_number` — added July 2026)
- `dispatch_orders` — dispatch orders (Pending → Picked/Cancelled)
- `dispatch_logs` — confirmed dispatch history
- `suppliers` — supplier master (`supplier_name`, `contact_number`, `address`, `gst_number` — added July 2026)
- `stock_transfers` — inter-warehouse transfers
- `app_users` — users with roles and rights: `role` (manager/helper/admin), `can_view`, `can_edit`, `can_delete`, `can_view_dashboard`, `can_view_warehouse`, `can_view_master`, `can_view_report` (added July 2026), `is_active` (role CHECK constraint widened July 2026 via table rebuild — see server/db.ts `app_users_v2` migration)

## Roles and rights (added `admin` role July 2026)
| Role | Dashboard/Warehouse/Master/Report | Admin panel | Notes |
|------|-------------------------------------|-------------|-------|
| manager | configurable per-page (`can_view_dashboard/warehouse/master/report`) | ✗ | `can_edit`/`can_delete` still gate individual actions. Still gets `requireUserAdmin` access to Report page ledgers and the Warehouse Records tab (`/admin/ledger/*`, `/admin/inward/*`) — only the Users/Backup Admin Panel itself was locked out (July 2026, see below) |
| admin | configurable per-page (same flags) | ✓ full (Users + Backup) | The only role that passes `requireAdmin` — sole gate on `/admin/users/*` and `/admin/backup/*` |
| helper | configurable per-page (same flags) | ✗ | `can_edit`/`can_delete` configurable |

Dashboard/Warehouse/Master/Report page access is configurable per-user for all three roles via Admin → Users → "Page Access" (same UI, same 4 flags, no role-based exclusions — Report used to be hardcoded to manager/admin role until July 2026, now it's a flag like the other three). The Admin panel itself stays role-based, since it manages other users — **originally manager+admin could both access it** (`requireUserAdmin`, "admin has full access, same as manager"), but this was tightened July 2026 so only the `admin` role sees/reaches Users + Backup (`requireAdmin`, admin-only); a manager who tries the old `/api/admin/users` or `/api/admin/backup/*` endpoints now gets a 403 regardless of any client-side state, since the check reads `role` straight off the signed token. The Users table has **RIGHTS** and **PAGES** columns showing each user's current access at a glance. Nav visibility is derived in `src/App.tsx` (`canViewDashboard/Warehouse/Master/Report` all flag-based; `canViewAdminPanel` now `role === 'admin'` only).

## Navigation views
| View | Description | Access |
|------|-------------|--------|
| Dashboard | Global stock summary, accordion by item | any role if `can_view_dashboard` |
| Warehouse | Picking list (searchable), stock inward, inter-warehouse transfer | any role if `can_view_warehouse` |
| Master | CRUD for items, customers, suppliers, warehouses | any role if `can_view_master` |
| Report | Daily Report · Customer Ledger · Supplier Ledger · Warehouse Transfers (date-filtered, print/PDF) | any role if `can_view_report` |
| Admin | Users · Backup | admin only (July 2026 — previously manager, admin) |

## Dev commands
```bash
npm run dev      # Vite frontend dev server (proxies /api to localhost:3001)
npm run server   # tsx watch server/index.ts (runs on PORT env or 3001)
npm run build    # tsc + vite build → dist/
npx tsc --project tsconfig.node.json --noEmit   # type-check backend only

# Release new APK (bumps version, builds, deploys to server)
bash scripts/release-apk.sh 1.0.1

# Build APK only (requires Java 21)
JAVA_HOME=/opt/homebrew/opt/openjdk@21 ./android/gradlew -p android assembleDebug
npx cap sync android  # sync web assets before building APK
```

## Conventions
- All SVG icons in `src/icons.tsx` as the `Ic` object
- Toast notifications via `useToast()` hook
- WebSocket sync via `useWSSync()` hook — triggers full data refresh on any mutation
- Dark theme throughout (gray-950 background, Tailwind dark palette)
- Confirmation dialogs (`ConfirmDialog`) for all destructive UI actions
- `posInt()` helper used in all numeric route params for server-side validation
- Broadcast middleware MUST be registered before routes in server/index.ts
- Images stored as base64 data URIs in SQLite (no separate file storage)
