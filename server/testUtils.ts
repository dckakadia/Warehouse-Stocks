import express, { type Router } from 'express'
import { createServer } from 'http'

export interface TestServer {
  url: string
  close: () => Promise<void>
}

// Mounts a router behind a stub-authenticated Express app (bypassing requireAuth's token
// verification) so route-handler business logic can be exercised over real HTTP without
// needing a signed token — role/rights checks still apply via res.locals.user.
export function startTestServer(router: Router, user: Record<string, unknown> = { can_edit: 1, can_delete: 1, role: 'manager' }): Promise<TestServer> {
  const app = express()
  app.use(express.json())
  app.use((_req, res, next) => { res.locals.user = user; next() })
  app.use('/', router)

  const server = createServer(app)
  return new Promise(resolve => {
    server.listen(0, () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise(res => server.close(() => res())),
      })
    })
  })
}
