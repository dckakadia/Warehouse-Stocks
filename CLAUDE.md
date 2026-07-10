# Warehouse-Stocks WMS — Project Context

## What this app is
Glass Beads Warehouse Management System (WMS). React + TypeScript frontend, Express + SQLite backend, served via nginx. Runs as a mobile-friendly web app + Capacitor Android APK.

## Tech stack
- **Frontend:** React 19, TypeScript, Tailwind CSS, Vite
- **Backend:** Express 5, better-sqlite3, tsx (runs TypeScript directly, no compile step)
- **Realtime:** WebSocket broadcast on all mutations, tagged with an `entity` field (added July 2026) so clients can skip refetching pages that show none of the changed data — see "WebSocket entity-scoped refresh" below
- **Testing:** vitest (backend business-logic tests only — reconciliation, validation; no frontend component tests yet)
- **CI:** GitHub Actions (`.github/workflows/ci.yml`) — lint, backend type-check, build, test on every push/PR. No deploy step; deployment stays manual per the procedure below.
- **Process manager:** PM2 (`warehouse-api`, id 4)
- **Serving:** nginx on port 8088 → static `dist/` + proxies `/api` and `/ws` to Node on port 3005
- **Mobile:** Capacitor Android wrapper — app loads its entire UI live from the server URL (http://116.74.77.22:8088), not from files bundled into the APK. **Important implication:** the only things that actually live *in* an installed APK are native Java code and the Capacitor shell — all React/JS/CSS is fetched fresh from production on every launch. So shipping a JS-only fix never requires a new APK build, but any fix needs *both* a new APK build/install *and* it won't take effect until deployed to production either way — test APK builds against the emulator are actually testing whatever's currently live on the server for anything JS-related. Native-only changes (see MainActivity.java bridges below) do require a real new APK.

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

## APK auto-update system (added July 2026, rebuilt July 2026 after both halves were found broken)
- `src/version.ts` — `APP_VERSION` constant embedded in the JS bundle. **Only a fallback for web builds** — real version display and update checks read the *actual installed APK's* `versionName` via `App.getInfo()` (see `useAppVersion`/`useAppUpdate` below), since this constant is hand-maintained and has drifted out of sync with the real shipped version before.
- `public/version.json` — served at `/version.json`; checked by running APKs on launch. **This file went stale at `"1.0.2"` for most of July 2026** because `release-apk.sh` was never run to completion during a long debugging session — always confirm `curl http://116.74.77.22:8088/version.json` matches what you just released.
- `dist/updates/app-latest.apk` — served at `/updates/app-latest.apk`; APKs download this for updates. **Was missing entirely from the server at one point** (deleted by a bare `rsync --delete` sometime before July 2026, never re-uploaded) — nginx's SPA fallback (`try_files $uri $uri/ /index.html`) silently served `index.html` (200 OK, wrong `Content-Type`) instead of a 404, which masked the problem for a while. Always sanity-check with `curl -sI .../app-latest.apk` — should be `Content-Type: application/octet-stream` and several MB, not `text/html` at ~500 bytes.
- `src/hooks/useAppUpdate.ts` — polls `/version.json` 3s after launch (native only); shows banner if newer
- `src/hooks/useAppVersion.ts` (added July 2026) — reads the real installed version via `@capacitor/app`'s `App.getInfo()` on native, falls back to `APP_VERSION` on web. Displayed on the Login screen footer and in the authenticated header (next to the username, `hidden md:block`).
- `src/components/UpdateBanner.tsx` — blue banner at top of screen with "Update" button
  - **Bug (fixed July 2026):** the Update button used to call `window.open(apkUrl, '_system')`. That `_system` target convention only means anything if a plugin like `@capacitor/browser` is installed to intercept it — this app has no such plugin, so the call silently did nothing in the Capacitor WebView (no `onCreateWindow` handler registered). Same root cause as the Print/PDF bug below.
  - **Fix:** calls `window.AndroidUpdater.downloadAndInstall(apkUrl)` (see native bridges below) when available; falls back to showing the raw APK URL as a plain link for the user to open in their own browser, for any APK built before the bridge existed (see caveat below).
  - First attempt at the fix used Android's system `DownloadManager` — the enqueue succeeded (got a job ID) but the job silently never started (no `"[id] Starting"` log ever appeared, unlike other apps' downloads on the same emulator). Root-caused to Android's separate `com.android.providers.downloads` system process independently blocking plain HTTP, regardless of this app's own `usesCleartextTraffic=true` manifest flag (that flag only covers *this app's own process*, not the system download service). **Fixed by downloading the file directly inside this app's own process** (`HttpURLConnection` on a background thread in `MainActivity.java`), which correctly inherits the app's cleartext permission, then handing the finished file to the system package installer via `FileProvider` + `ACTION_VIEW`.
- **Release command:** `bash scripts/release-apk.sh <version>` — bumps `versionName`/`versionCode` in `android/app/build.gradle`, updates `public/version.json`, builds the frontend, builds the APK, and rsyncs *everything including the APK* to the server (this one deliberately does NOT use `--exclude=updates`, unlike the routine frontend-only deploy). Note it unconditionally increments `versionCode` even if you pass the same version string again — harmless, just don't be surprised by gaps.
- **Bootstrapping caveat:** the download+install fix only takes effect for a device once it's running an APK build that *contains* it (native code, baked into that specific APK). Any device on an older build (including anything shipped before v1.0.9) will still hit a dead end tapping "Update" — there is no way around one manual sideloaded install to bridge that gap; every update after that works through the in-app button correctly. v1.0.9 is the first build with the working bridge — treat anything older as needing a manual install once.
- Java 21 required for Gradle: `JAVA_HOME=/opt/homebrew/opt/openjdk@21`

## Native Android bridges (added July 2026, in `android/app/src/main/java/.../MainActivity.java`)
`android/` is **gitignored** (checked in `.gitignore`, not tracked by git) — these native changes only exist in the local working tree / whatever's been built into an APK, not in version control. Keep that in mind if the working directory is ever reset.
- **Why bridges exist at all:** the Capacitor WebView doesn't wire up `window.print()` or a working `window.open(url, '_system')` to anything by default — both silently no-op without native code backing them, which is why both the Print/PDF buttons and the Update button were broken (see below and the auto-update section above). The fix pattern for both was the same: expose a `@JavascriptInterface`-annotated bridge object via `webView.addJavascriptInterface(...)`, and detect it from JS via `window.Capacitor?.isNativePlatform?.()` + checking the bridge object exists, with a graceful fallback for web/older-APK contexts.
- **`window.AndroidPrint.print()`** — triggers Android's native `PrintManager` (via `bridge.getWebView().createPrintDocumentAdapter()`), which itself offers "Save as PDF" as a destination. Used by `src/utils.ts`'s `printHtmlDocument()` for the Report page's Print/PDF buttons.
  - Since `createPrintDocumentAdapter()` captures whatever the *main* WebView currently has rendered on screen (not an arbitrary hidden iframe), `printHtmlDocument()` on native builds a full-screen *visible* iframe overlay (with its own Close button as a safety net) rather than the hidden off-screen iframe used on web/desktop.
  - The report's in-app "✕ Close" button lives in a dedicated toolbar strip (`.wms-print-toolbar`, own background, own reserved height) fixed above the iframe — the iframe's `top`/`height` are offset by the toolbar's height so report content starts below it, never underneath it.
  - **Bug (fixed July 2026):** the close button used to float directly at `top:8px;right:8px` with no reserved space, which sat right on top of the report's *own* printed header (the "GENERATED / date / time" text the report template renders in that same top-right corner) — covering it up. An initial fix attempt added `env(safe-area-inset-*)` assuming it was a status-bar/notch overlap, but this WebView isn't edge-to-edge (there's a real status-bar gap), so that padding was a no-op and didn't fix anything. The actual fix was giving the toolbar real layout space (see above) so nothing shares the same corner.
  - The toolbar — being outside the iframe, in the main document — would otherwise show up in the captured print/PDF output too — hidden via an injected `<style>@media print{.wms-print-toolbar{display:none!important}}</style>` scoped to that toolbar's class.
- **`window.AndroidUpdater.downloadAndInstall(url)`** — downloads the given URL via `HttpURLConnection` on a background thread (deliberately *not* the system `DownloadManager`, see auto-update section above for why) to `getExternalFilesDir(null)`, then launches `ACTION_VIEW` with a `FileProvider` URI and MIME type `application/vnd.android.package-archive` to hand off to the system package installer.
  - `AndroidManifest.xml` needs `REQUEST_INSTALL_PACKAGES` permission for this to work at all on API 26+.
  - `res/xml/file_paths.xml` needs an `<external-files-path>` entry (added alongside the existing `<external-path>`/`<cache-path>` ones) so `FileProvider` can grant a URI for a file in `getExternalFilesDir(null)`.
  - Users still see Android's standard one-time "allow unknown apps from this source" system prompt on install — that's normal OS behavior for any sideloaded APK, not a bug to fix.
- **The original bug this all traces back to:** in the Capacitor Android WebView, calling `window.open()` with no native handler registered gets treated by the default `WebChromeClient` as a request it can't fulfill and silently drops it — but *some* code paths in this app's history called `window.open('', '_blank', ...)` for the Report page's print flow, which in at least one investigated case appeared to hand off to an external browser Intent with no way back into the app (no in-app close button, device Back button didn't return to the WMS app either, since it was now a different Android task/activity entirely). Any future "open a URL" or "trigger a browser action" need in this codebase should go through a native bridge like the two above, never a bare `window.open()`.

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
- `server/index.ts` — Express app + WebSocket server + route registration + request logger. Broadcast middleware tags each `data_changed` event with an `entity` derived from the mutated route path (`deriveEntity()`) — `'inventory' | 'dispatch' | 'transfers' | 'items' | 'customers' | 'suppliers' | 'warehouses' | 'users' | 'all' | 'other'` — so the frontend can skip refetching pages that show none of that data. See "WebSocket entity-scoped refresh" below for the frontend half and a bug that came from this.
- `server/db.ts` — SQLite schema + migrations + default admin seed. `DB_PATH` now reads `process.env.WMS_DB_PATH` first (falls back to the real `warehouse.db` file) so tests can point it at `:memory:` without touching production data.
- `server/auth.ts` — Token sign/verify utilities, `AUTH_SECRET` loading
- `server/middleware/requireAuth.ts` — `requireAuth`, `requireEdit`, `requireDelete`, `requireUserAdmin` (manager or admin role — gates `/ledger/*` and `/inward/*`), `requireAdmin` (admin role only — gates `/users/*` and `/backup/*`, added July 2026 after managers were found to still have Admin Panel access)
- `server/routes/auth.ts` — POST /api/auth/login + logout
- `server/routes/admin.ts` — Single router, split by prefix (July 2026): `requireAdmin` on `/users` and `/backup` (the actual Admin Panel — User CRUD, export/import, Google Drive backup, admin role only); `requireUserAdmin` on `/ledger` and `/inward` (Report page ledgers + Warehouse Records tab edit/delete, manager or admin — these are separate pages that happen to share the `/admin` URL prefix, not part of the Admin Panel proper). `DELETE /inward/batches/:id` and `DELETE /inward/inventory/:id` wrap their transaction in try/catch (July 2026 fix) — deleting a batch/inventory line with dispatch or transfer history throws a FK constraint error that previously crashed the process uncaught; now returns a 409 with a clear message instead. Has a `server/routes/admin.test.ts` covering the full-batch-edit path and the FK-safe delete behavior.
- `server/routes/masters.ts` — Items, suppliers, customers, warehouses CRUD. Customer/supplier create+update block duplicates: same name (case-insensitive), same non-empty `gst_number`, or same non-empty `contact_number` all return 409 `"<Name>" already exists with the same name, GST number, or mobile number`. `server/routes/customers.ts` (the quick-add endpoint used by the Dashboard's Add Customer modal) enforces the identical check so there's no bypass route. Warehouse POST/PUT no longer read or write `location_city` at all (see Database schema below — city was removed app-wide July 2026); `GET /warehouses` still uses `SELECT *` so the column is present but unused in the response type.
- `server/routes/inwarding.ts` — Batch inward (all-or-nothing validation). `PUT /admin/inward/batches/:id/full` (in admin.ts) mirrors this for editing an existing batch: replaces item/color, metadata, image, and the full set of inventory lines in one call — add/update/remove lines together, guarded against removing a line with pending dispatch orders.
- `server/routes/transfers.ts` — Inter-warehouse stock transfers. Has `server/routes/transfers.test.ts` covering create/edit/delete reconciliation, including the negative-delta CHECK-constraint regression case documented under Database schema below.
- `server/routes/reports.ts` — `GET /reports/daily?from=&to=` (added July 2026): aggregates inward batches (grouped, with supplier + per-line warehouse/pack-size breakdown), outward dispatch orders (excludes Cancelled, with customer name), and transfers for a date range, for the Report page's Daily Report tab. No role gate beyond `requireAuth` — registered directly under `/api`, not `/api/admin`.
- `server/routes/dispatch.ts` — Dispatch orders. Has `server/routes/dispatch.test.ts` covering create/confirm/cancel inventory reconciliation.
- `server/routes/inventory.ts` — Live inventory grid, colors, stock summary, per-warehouse batch listings. No longer selects/returns `location_city` (removed app-wide July 2026).
- `server/testUtils.ts` — `startTestServer(router, user?)` test helper: mounts a router behind a stub-authenticated Express app (bypassing real token verification) so route handlers can be exercised over real HTTP without a signed JWT — role/rights checks still apply via the injected `res.locals.user`.

### Frontend
- `src/App.tsx` — Root component: login gate, header, nav, view routing, update banner. `BannerStack` (local, not exported) wraps the update/session-expiry/offline banners in a single fixed-position column so multiple can stack without overlapping. Tracks a `refreshSig`/`refreshEntity` pair from `useWSSync` for entity-scoped refresh (see below) — passes both down to Dashboard/Warehouse.
- `src/api.ts` — All API calls + TypeScript types; auth token injection. `Warehouse` and related row types no longer have a `location_city` field (removed app-wide July 2026, see Database schema below).
- `src/version.ts` — `APP_VERSION` constant — fallback only, see `useAppVersion` below for why
- `src/hooks/useAuth.ts` — Login/logout state, sessionStorage token management. Exposes the raw `token` string (for `useSessionExpiry`) and a `refreshSession(password)` method that re-runs login in place without unmounting the current view (used by the session-expiry banner's inline re-auth). `logout(reason?)` takes an optional reason shown on the next Login screen render (e.g. "Your session expired — please sign in again.") instead of silently redirecting.
- `src/hooks/useSessionExpiry.ts` (added July 2026) — decodes the token's `exp` claim, fires a warning 5 minutes before expiry
- `src/hooks/useOnlineStatus.ts` (added July 2026) — thin wrapper around `navigator.onLine` + `online`/`offline` events
- `src/hooks/useWSSync.ts` — WebSocket connection; callback now receives the broadcast's `entity` string (`'all'` if absent) instead of being a bare no-arg refresh trigger
- `src/hooks/useToast.ts` — Toast notification queue
- `src/hooks/useAppUpdate.ts` — APK update checker (native only, polls /version.json)
- `src/hooks/useAppVersion.ts` (added July 2026) — see APK auto-update system above
- `src/utils.ts` — `W_COLORS`, `whColor`, `todayISO`, `parseKgPerBag`, `compressImage`, `printHtmlDocument()` (added July 2026, see native bridges above — branches on native vs. web internally, callers don't need to care)
- `src/icons.tsx` — All SVG icons in `Ic` object (Download, Upload, Cloud added July 2026)
- `src/components/Login.tsx` — Login form. Password-strength meter was removed (July 2026 — it's a signup-pattern that doesn't belong on a login form and confused managers whose real password showed "Weak"); replaced with a plain show/hide eye-icon toggle. Shows an optional `reason` banner (from `useAuth`'s `logoutReason`) explaining *why* the user landed back here if they were force-logged-out, and the app version in a footer caption via `useAppVersion`.
- `src/components/UpdateBanner.tsx` — APK update notification banner, see APK auto-update system above for the button's fix history
- `src/components/SessionExpiryBanner.tsx` (added July 2026) — warning banner with inline password re-entry, reusing `useAuth`'s `refreshSession`
- `src/components/OfflineBanner.tsx` (added July 2026) — persistent "you're offline" banner, driven by `useOnlineStatus`
- `src/components/ErrorBlock.tsx` (added July 2026) — reusable "failed to load, here's why, retry" block for initial-page-load failures specifically (as opposed to toasts, used for one-off action failures) — used across Dashboard/Warehouse/Master/Admin/Report
- `src/components/Skeleton.tsx` (added July 2026) — single pulsing-block primitive; pages compose it inline into content-shaped loading placeholders rather than a generic spinner
- `src/components/ConfirmDialog.tsx` — Reusable confirmation modal (danger/neutral)
- `src/components/Lightbox.tsx` — Image lightbox. As of July 2026, every thumbnail in the app that shows an item/batch photo opens this on click (`cursor-zoom-in hover:opacity-80` styling) — Dashboard, Warehouse (Picking/Records tabs, Inward form preview, Edit Batch modal preview), Report (all four tabs), CreateDispatchModal's item selector. When the thumbnail sits inside an already-clickable row/button, wrap it in its own inner `<button>` with `onClick={e => { e.stopPropagation(); ... }}` rather than relying on the outer row's click (see Dashboard.tsx's accordion header for the reference pattern) — do NOT skip a spot just because "it's just a preview," per the July 2026 request to cover every thumbnail with no exceptions.
- `src/components/AddCustomerModal.tsx` — Add customer modal
- `src/components/CreateDispatchModal.tsx` — Create dispatch order modal
- `src/pages/Dashboard.tsx` — Global stock summary, accordion by item. Entity-scoped refresh: only refetches on `inventory`/`dispatch`/`transfers`/`items`/`warehouses` broadcasts (ignores e.g. customer-only changes) — see "WebSocket entity-scoped refresh" below, including a bug this pattern introduced and fixed.
- `src/pages/Warehouse.tsx` — Picking list (with search), inward, transfer tabs. Records tab's "Edit batch" opens a full multi-line editor (color/item, batch info, image, add/remove inventory lines across warehouses) matching the "+ Inward" creation form, calling `api.updateInwardBatchFull`. Same entity-scoped refresh pattern as Dashboard, on `inventory`/`dispatch`/`transfers`/`items`/`warehouses`/`suppliers`.
- `src/pages/Master.tsx` — CRUD for items, customers, suppliers, warehouses. Warehouse Master's City field and column were removed (July 2026, see Database schema below) — Warehouse form now only has name + active toggle.
- `src/pages/Admin.tsx` — User management + Backup tab (manager and admin roles — identical access)
- `src/pages/Report.tsx` — Daily Report + Customer Ledger + Supplier Ledger + Warehouse Transfers tabs (any role with `can_view_report`; ledgers moved out of Admin.tsx July 2026, transfer report added July 2026). Daily Report (added July 2026, default tab) is read-only — a date-range picker (defaults to today) showing inward stock (with supplier + per-warehouse/pack-size breakdown), outward stock (with customer name), and warehouse transfers for the period, plus summary stat cards and Print/PDF export. It calls `GET /api/reports/daily` (`server/routes/reports.ts`), registered as a plain route with no role gate (like `/transfers`) — deliberately NOT under `/api/admin`, so it isn't affected by `requireUserAdmin`/`requireAdmin` and works for any role with `can_view_report`, unlike the Customer/Supplier Ledger tabs below. `ReportPage` takes `canEdit`/`canDelete` props (from the logged-in user's rights, same as Master/Warehouse pages) and threads them into the ledger/transfer tabs — edit/delete buttons are hidden, not just disabled, when the flag is off. Customer Ledger edits dispatch orders (existing `/admin/ledger/orders/:id`); Supplier Ledger edits/deletes the inward batch (`/admin/inward/batches/:id`, batch number/date/notes only — supplier assignment isn't editable from this view); Warehouse Transfers edits bags/notes or deletes a transfer via new `PUT`/`DELETE /api/transfers/:id`, which reconciles inventory in both the source and destination warehouse (mirrors the dispatch-order reconciliation pattern). When editing these reconciliation queries, use plain `UPDATE ... WHERE id = ?` on inventory rows known to exist — do NOT use `INSERT ... ON CONFLICT DO UPDATE` with a possibly-negative literal in `VALUES`, because SQLite validates CHECK constraints (`quantity_in_stock >= 0`) against the literal insert value before conflict resolution ever applies, so a legitimate net-positive update can fail spuriously (regression-tested in `server/routes/transfers.test.ts`). Print/PDF buttons on all three tabs (Customer Ledger, Supplier Ledger, Daily Report) build a standalone HTML report string and hand it to `printHtmlDocument()` in `src/utils.ts` — never call `window.open()` directly for this, see native bridges above for why.

## WebSocket entity-scoped refresh (added July 2026)
- Backend tags every `data_changed` broadcast with an `entity` (see `server/index.ts` above). Frontend `useWSSync` passes it through to consumers instead of a bare refresh trigger.
- Dashboard and Warehouse each keep a `RELEVANT_ENTITIES` set and skip refetching when a broadcast's entity isn't in it, avoiding jank on unrelated mutations (e.g. Warehouse ignores a customer edit elsewhere in the app).
- **Bug found and fixed same day:** the skip-check was originally keyed on `refreshSig > 0` (treating "the shared global counter is nonzero" as "this isn't my first load"). But `refreshSig` is one counter for the whole tab, not per-component — if a user's session expired mid-use (see session-expiry banner above), got logged out and back in *without a full page reload*, the freshly-remounted Dashboard/Warehouse was brand new (never loaded) but `refreshSig` was already nonzero from earlier activity. If the last broadcast before that happened to be for an irrelevant entity, the guard incorrectly treated the component's very *first* load as skippable — it never fetched at all, leaving the page stuck on its loading skeleton forever (only a hard reload, which resets `refreshSig` to 0 in a new app instance, fixed it). **Fix:** gate the skip-check on each component's own local "have I completed a load yet" ref (`hasLoadedRef` / `hasLoadedBootstrapRef`), not the shared global counter — a fresh component instance always runs its first load regardless of what `refreshSig`/`refreshEntity` happen to be at mount time. App.tsx's own customers/colors bootstrap effect had the identical bug and got the identical fix (a ref reset to `false` whenever `user` goes null).

## Database schema (SQLite, file: warehouse.db)
- `items` — color/item master (color_name, hsn_code, item_image as base64 — now only a **fallback default** shown when a batch has no photo of its own; not the source of truth for display)
- `batches` — batch records per item. `batch_image` (added July 2026) is the photo for that specific batch — batches commonly span multiple warehouses (via transfers or re-inwarding the same batch number), so the photo is scoped to the batch, not batch+warehouse. Read queries expose `COALESCE(b.batch_image, it.item_image) AS item_image` for display; the `/admin/inward` list additionally returns raw `batch_image` so the Records edit form can tell "this batch has no photo yet" apart from "borrowing the item's default" (avoids silently freezing a borrowed default as this batch's own image on save). Write paths (`POST /api/inward`, `PUT /admin/inward/batches/:id/full`) accept `batch_image` in the request body, not `item_image`.
- `warehouses` — warehouse master. Has an unused `location_city` column (July 2026: removed from every form/display/API read+write path app-wide per request — same treatment as `godown_rack_location` below, and the second time this exact pattern has been applied. The column itself was deliberately left in place rather than dropped, since production already had real values in it. `POST/PUT /api/masters/warehouses` no longer accept or write it at all, so editing a warehouse's name/active-status leaves any pre-existing city value untouched rather than blanking it; `GET /api/masters/warehouses` still uses `SELECT *` so the raw column is present in the JSON response even though no frontend type or UI references it.)
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
npx tsc --project tsconfig.node.json --noEmit   # type-check backend AND server/ (see note below)
npm test         # vitest run — backend business-logic tests (in-memory/`:memory:` DB via WMS_DB_PATH, never touches warehouse.db)
npm run lint     # oxlint

# Release new APK (bumps version, builds, deploys to server INCLUDING the APK)
bash scripts/release-apk.sh 1.0.1

# Build APK only, without deploying (requires Java 21)
JAVA_HOME=/opt/homebrew/opt/openjdk@21 ./android/gradlew -p android assembleDebug
npx cap sync android  # sync web assets before building APK
```
- **`tsconfig.node.json`'s `include` used to be `["vite.config.ts"]` only** — meaning the documented `npx tsc --project tsconfig.node.json --noEmit` "backend type-check" was silently a no-op for all of `server/` for an unknown period (found and fixed July 2026, when adding CI surfaced 4 pre-existing unused-parameter errors in `requireAuth.ts` that had never been caught). It now includes `server` too. If this command ever stops catching backend errors again, check `include` first.

## Conventions
- All SVG icons in `src/icons.tsx` as the `Ic` object
- Toast notifications via `useToast()` hook for one-off action failures; `ErrorBlock` (retry-able inline block) for initial-page-load failures specifically — don't conflate the two
- WebSocket sync via `useWSSync()` hook — passes an `entity` string through per broadcast; pages that care should filter by it (see "WebSocket entity-scoped refresh" above) rather than refetching unconditionally
- Dark theme throughout (gray-950 background, Tailwind dark palette)
- Confirmation dialogs (`ConfirmDialog`) for all destructive UI actions
- `posInt()` helper used in all numeric route params for server-side validation
- Broadcast middleware MUST be registered before routes in server/index.ts
- Images stored as base64 data URIs in SQLite (no separate file storage)
- **Never call `window.open()` or rely on `window.print()` for anything that needs to work inside the Android app** — the Capacitor WebView doesn't wire either up to anything by default and both fail silently or (worse) hand off to an external Intent with no way back into the app. Use a native `@JavascriptInterface` bridge in `MainActivity.java` instead (see "Native Android bridges" above for the two that exist — printing and update-download/install — and follow that pattern for any future need to trigger a native browser/download/print action from JS).
- Every thumbnail image in the app should be click-to-enlarge via `Lightbox` (see `src/components/Lightbox.tsx` above) — this was retrofitted everywhere July 2026 per explicit request; when adding a new place that shows an item/batch photo, wire it up rather than leaving it static.
- `android/` is gitignored — native Android changes (MainActivity.java, AndroidManifest.xml, build.gradle, etc.) are NOT tracked by git in this repo

## Known issues / pending items (as of July 2026)
- **Stray test data in production:** an item named "Test item" (batches "Test1"/"Test2", 150 bags total across KAMAL/SP warehouses, dated 2026-07-01) is sitting in the live database — flagged to the user, not yet removed pending their decision on whether it's safe to delete.
