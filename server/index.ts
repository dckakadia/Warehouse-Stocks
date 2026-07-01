import express from 'express'
import cors from 'cors'
import { WebSocketServer, WebSocket } from 'ws'
import { createServer } from 'http'

import { requireAuth } from './middleware/requireAuth.js'
import authRouter      from './routes/auth.js'
import inventoryRouter from './routes/inventory.js'
import customersRouter from './routes/customers.js'
import dispatchRouter  from './routes/dispatch.js'
import inwardingRouter from './routes/inwarding.js'
import mastersRouter   from './routes/masters.js'
import transfersRouter from './routes/transfers.js'
import reportsRouter   from './routes/reports.js'
import adminRouter     from './routes/admin.js'

const app  = express()
const http = createServer(app)
const wss  = new WebSocketServer({ server: http })

app.use(cors())
app.use(express.json({ limit: '50mb' }))

/* ── Request logger ── */
app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    const ms = Date.now() - start
    console.log(`${new Date().toISOString()} ${req.method} ${req.path} ${res.statusCode} ${ms}ms`)
  })
  next()
})

/* ── Maps a mutated route to the data "entity" it affects, so clients can skip
   refetching pages that show none of that data (see useWSSync on the frontend). ── */
function deriveEntity(path: string): string {
  if (path.startsWith('/api/masters/items'))      return 'items'
  if (path.startsWith('/api/masters/customers'))  return 'customers'
  if (path.startsWith('/api/masters/suppliers'))  return 'suppliers'
  if (path.startsWith('/api/masters/warehouses')) return 'warehouses'
  if (path.startsWith('/api/customers'))          return 'customers'
  if (path.startsWith('/api/dispatch'))           return 'dispatch'
  if (path.startsWith('/api/transfers'))          return 'transfers'
  if (path.startsWith('/api/inward'))             return 'inventory'
  if (path.startsWith('/api/inventory'))          return 'inventory'
  if (path.startsWith('/api/admin/users'))        return 'users'
  if (path.startsWith('/api/admin/backup'))       return 'all'
  if (path.startsWith('/api/admin/ledger/orders')) return 'dispatch'
  if (path.startsWith('/api/admin/inward'))       return 'inventory'
  return 'other'
}

/* ── Broadcast middleware — MUST be before routes so res.json is patched first ── */
app.use((req, res, next) => {
  const original = res.json.bind(res)
  res.json = (body) => {
    if (req.method !== 'GET' && res.statusCode < 300) {
      broadcast('data_changed', { path: req.path, entity: deriveEntity(req.path) })
    }
    return original(body)
  }
  next()
})

/* ── Public routes (no auth) ── */
app.use('/api/auth', authRouter)

/* ── Protected routes ── */
app.use('/api', requireAuth)
app.use('/api/inventory', inventoryRouter)
app.use('/api/customers', customersRouter)
app.use('/api/dispatch',  dispatchRouter)
app.use('/api/inward',    inwardingRouter)
app.use('/api/masters',   mastersRouter)
app.use('/api/transfers', transfersRouter)
app.use('/api/reports',   reportsRouter)
app.use('/api/admin',     adminRouter)

/* ── WebSocket broadcast helper ── */
export function broadcast(event: string, payload?: unknown) {
  const msg = JSON.stringify({ event, payload })
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(msg)
  })
}

/* ── WebSocket keepalive ping every 30s ── */
wss.on('connection', ws => {
  ws.send(JSON.stringify({ event: 'connected' }))
  const ping = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.ping()
  }, 30_000)
  ws.on('close', () => clearInterval(ping))
})

const PORT = process.env.PORT ?? 3001
http.listen(PORT, () => console.log(`API server on http://localhost:${PORT}`))
