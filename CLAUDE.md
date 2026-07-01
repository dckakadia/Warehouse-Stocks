# Warehouse-Stocks WMS — Project Context

## What this app is
Glass Beads Warehouse Management System (WMS). React + TypeScript frontend, Express + SQLite backend, served via nginx. Runs as a mobile-friendly web app (also has Capacitor Android wrapper).

## Tech stack
- **Frontend:** React 19, TypeScript, Tailwind CSS, Vite
- **Backend:** Express 5, better-sqlite3, tsx (runs TypeScript directly, no compile step)
- **Realtime:** WebSocket broadcast on all mutations
- **Process manager:** PM2 (`warehouse-api`, id 4)
- **Serving:** nginx on port 8088 → static `dist/` + proxies `/api` and `/ws` to Node on port 3005

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
5. Sync server root files: `rsync -avz server/auth.ts server/db.ts server/index.ts dckakadia@116.74.77.22:/home/dckakadia/warehouse-stocks/server/`
6. Sync middleware: `rsync -avz server/middleware/requireAuth.ts dckakadia@116.74.77.22:/home/dckakadia/warehouse-stocks/server/middleware/`
7. Sync routes: `rsync -avz server/routes/ dckakadia@116.74.77.22:/home/dckakadia/warehouse-stocks/server/routes/`
8. Sync scripts: `rsync -avz scripts/ dckakadia@116.74.77.22:/home/dckakadia/warehouse-stocks/scripts/`
9. Restart: `ssh dckakadia@116.74.77.22 'pm2 restart warehouse-api'`
10. Verify: `ssh dckakadia@116.74.77.22 'pm2 logs warehouse-api --lines 20 --nostream'`

No server-side TypeScript compile needed — tsx runs `.ts` directly.

## Authentication system (added July 2026)
- **Token format:** HMAC-SHA256 signed — `base64url(payload) + "." + base64url(sig)`
- **Secret:** `server/.auth_secret` — generated on first run, persists across restarts (do NOT commit this file)
- **TTL:** 24 hours
- **Storage:** sessionStorage (NOT localStorage — shared warehouse devices)
- **Login:** `POST /api/auth/login` — rate limited 5 attempts / 15 min / IP (in-memory)
- **Protection:** `app.use('/api', requireAuth)` in server/index.ts; `/api/auth/*` is public
- **Rights middlewares:** `requireEdit`, `requireDelete`, `requireManager` in server/middleware/requireAuth.ts
- **Default admin:** Seeded on first run when `app_users` table is empty; credentials printed to PM2 logs
- **Password hashing:** Node built-in `crypto.scryptSync` + random salt (no bcrypt dependency)

## Key source files
### Backend
- `server/index.ts` — Express app + WebSocket server + route registration + request logger
- `server/db.ts` — SQLite schema + migrations + default admin seed
- `server/auth.ts` — Token sign/verify utilities, `AUTH_SECRET` loading
- `server/middleware/requireAuth.ts` — `requireAuth`, `requireEdit`, `requireDelete`, `requireManager`
- `server/routes/auth.ts` — POST /api/auth/login + logout
- `server/routes/admin.ts` — User CRUD (manager-only)
- `server/routes/masters.ts` — Items, suppliers, customers, warehouses CRUD
- `server/routes/inwarding.ts` — Batch inward (all-or-nothing validation)
- `server/routes/transfers.ts` — Inter-warehouse stock transfers
- `server/routes/dispatch.ts` — Dispatch orders
- `scripts/backup-db.sh` — Daily SQLite backup via `.dump | gzip`, 14-day rotation

### Frontend
- `src/App.tsx` — Root component: login gate, header, nav, view routing (~130 lines)
- `src/api.ts` — All API calls + TypeScript types; auth token injection
- `src/hooks/useAuth.ts` — Login/logout state, sessionStorage token management
- `src/hooks/useWSSync.ts` — WebSocket connection + refresh trigger on broadcast
- `src/hooks/useToast.ts` — Toast notification queue
- `src/utils.ts` — W_COLORS, whColor, todayISO, parseKgPerBag, compressImage
- `src/icons.tsx` — All SVG icons in `Ic` object
- `src/components/Login.tsx` — Login form with password strength indicator
- `src/components/ConfirmDialog.tsx` — Reusable confirmation modal (danger/neutral)
- `src/components/Lightbox.tsx` — Image lightbox
- `src/components/AddCustomerModal.tsx` — Add customer modal
- `src/components/CreateDispatchModal.tsx` — Create dispatch order modal
- `src/pages/Dashboard.tsx` — Global stock summary, accordion by item
- `src/pages/Warehouse.tsx` — Picking list (with search), inward, transfer tabs
- `src/pages/Master.tsx` — CRUD for items, customers, suppliers, warehouses
- `src/pages/Admin.tsx` — User management (manager-only)

## Database schema (SQLite, file: warehouse.db)
- `items` — color/item master (color_name, hsn_code, item_image)
- `batches` — batch records per item
- `warehouses` — warehouse master
- `inventory` — stock per batch × warehouse × packing_size
- `customers` — customer master
- `dispatch_orders` — dispatch orders (Pending → Picked/Cancelled)
- `dispatch_logs` — confirmed dispatch history
- `suppliers` — supplier master
- `stock_transfers` — inter-warehouse transfers
- `app_users` — users with roles and rights: `role` (manager/helper), `can_view`, `can_edit`, `can_delete`

## Roles and rights
| Role | Can view | Can edit | Can delete | Admin panel |
|------|----------|----------|------------|-------------|
| manager | ✓ | ✓ | ✓ | ✓ |
| helper | configurable | configurable | configurable | ✗ |

## Navigation views
| View | Description |
|------|-------------|
| Dashboard | Global stock summary, accordion by item |
| Warehouse | Picking list (searchable), stock inward, inter-warehouse transfer |
| Master | CRUD for items, customers, suppliers, warehouses |
| Admin | User management (manager role only) |

## Dev commands
```bash
npm run dev      # Vite frontend dev server (proxies /api to localhost:3001)
npm run server   # tsx watch server/index.ts (runs on PORT env or 3001)
npm run build    # tsc + vite build → dist/
npx tsc --project tsconfig.node.json --noEmit   # type-check backend only
```

## Conventions
- All SVG icons in `src/icons.tsx` as the `Ic` object
- Toast notifications via `useToast()` hook
- WebSocket sync via `useWSSync()` hook — triggers full data refresh on any mutation
- Dark theme throughout (gray-950 background, Tailwind dark palette)
- Confirmation dialogs (`ConfirmDialog`) for all destructive UI actions
- posInt() helper used in all numeric route params for server-side validation
- Broadcast middleware MUST be registered before routes in server/index.ts

## Daily backup setup (run once on server)
```bash
chmod +x /home/dckakadia/warehouse-stocks/scripts/backup-db.sh
# Add cron: crontab -e
0 2 * * * /home/dckakadia/warehouse-stocks/scripts/backup-db.sh >> /home/dckakadia/warehouse-stocks/backups/backup.log 2>&1
```
