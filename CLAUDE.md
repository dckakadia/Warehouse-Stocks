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
3. Sync dist: `rsync -avz --delete dist/ dckakadia@116.74.77.22:/home/dckakadia/warehouse-stocks/dist/`
4. Sync changed server files: `rsync -avz server/db.ts server/index.ts dckakadia@116.74.77.22:/home/dckakadia/warehouse-stocks/server/`
5. Sync new route files: `rsync -avz server/routes/<file>.ts dckakadia@116.74.77.22:/home/dckakadia/warehouse-stocks/server/routes/`
6. Restart: `ssh dckakadia@116.74.77.22 'pm2 restart warehouse-api'`
7. Verify: `ssh dckakadia@116.74.77.22 'curl -s http://127.0.0.1:3005/api/...'`

No server-side TypeScript compile needed — tsx runs `.ts` directly.

## Key source files
- `src/App.tsx` — entire frontend (all pages/components in one file; ~1700+ lines)
- `src/api.ts` — all API calls + TypeScript types
- `server/index.ts` — Express app + WebSocket server + route registration
- `server/db.ts` — SQLite schema + all migrations
- `server/routes/` — one file per feature area

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
- `app_users` — admin-managed users with roles and rights *(added June 2026)*

## Navigation views
| View | URL fragment | Description |
|---|---|---|
| Dashboard | default | Global stock summary, accordion by item |
| Warehouse | warehouse | Picking list, stock inward, inter-warehouse transfer |
| Master | master | CRUD for items, customers, suppliers, warehouses |
| Admin | admin | User management — create users, assign roles & rights |

## Admin panel (added June 2026)
- Route: `/api/admin/users` (GET, POST, PUT /:id, DELETE /:id)
- Server file: `server/routes/admin.ts`
- Password hashing: Node built-in `crypto.scryptSync` + random salt (no bcrypt dependency)
- Roles: `manager`, `helper`
- Rights per user: `can_view`, `can_edit`, `can_delete` (independent boolean flags)
- No authentication middleware yet — admin panel is open to anyone who can reach port 8088

## Dev commands
```bash
npm run dev      # Vite frontend dev server (proxies /api to localhost:3001)
npm run server   # tsx watch server/index.ts (runs on PORT env or 3001)
npm run build    # tsc + vite build → dist/
```

## Conventions
- All icons are inline SVG in the `Ic` object at the top of App.tsx
- Toast notifications via `useToast()` hook
- WebSocket sync via `useWSSync()` hook — triggers full data refresh on any mutation
- Dark theme throughout (gray-950 background, Tailwind dark palette)
- No auth/session system yet — single shared session
