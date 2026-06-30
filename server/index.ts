import express from 'express'
import cors from 'cors'
import { WebSocketServer, WebSocket } from 'ws'
import { createServer } from 'http'

import inventoryRouter from './routes/inventory.js'
import customersRouter from './routes/customers.js'
import dispatchRouter  from './routes/dispatch.js'
import inwardingRouter from './routes/inwarding.js'
import mastersRouter   from './routes/masters.js'
import transfersRouter from './routes/transfers.js'
import adminRouter     from './routes/admin.js'

const app  = express()
const http = createServer(app)
const wss  = new WebSocketServer({ server: http })

app.use(cors())
app.use(express.json({ limit: '5mb' }))

/* ── API routes ── */
app.use('/api/inventory', inventoryRouter)
app.use('/api/customers', customersRouter)
app.use('/api/dispatch',  dispatchRouter)
app.use('/api/inward',    inwardingRouter)
app.use('/api/masters',   mastersRouter)
app.use('/api/transfers', transfersRouter)
app.use('/api/admin',     adminRouter)

/* ── WebSocket broadcast helper ── */
export function broadcast(event: string, payload?: unknown) {
  const msg = JSON.stringify({ event, payload })
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(msg)
  })
}

wss.on('connection', ws => {
  ws.send(JSON.stringify({ event: 'connected' }))
})

// Monkey-patch dispatch + inward routes to broadcast after mutations
// (simpler than middleware for this scope)
app.use((req, res, next) => {
  const original = res.json.bind(res)
  res.json = (body) => {
    if (req.method !== 'GET' && res.statusCode < 300) {
      broadcast('data_changed', { path: req.path })
    }
    return original(body)
  }
  next()
})

const PORT = process.env.PORT ?? 3001
http.listen(PORT, () => console.log(`API server on http://localhost:${PORT}`))
