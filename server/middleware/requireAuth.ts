import type { Request, Response, NextFunction } from 'express'
import { verifyToken, type TokenPayload } from '../auth.js'

// Attach verified user to res.locals.user
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers['authorization']
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Authentication required' })
  const user = verifyToken(token)
  if (!user) return res.status(401).json({ error: 'Invalid or expired token' })
  res.locals.user = user
  next()
}

// Convenience: require can_edit flag
export function requireEdit(req: Request, res: Response, next: NextFunction) {
  const user = res.locals.user as TokenPayload | undefined
  if (!user?.can_edit) return res.status(403).json({ error: 'Edit permission required' })
  next()
}

// Convenience: require can_delete flag
export function requireDelete(req: Request, res: Response, next: NextFunction) {
  const user = res.locals.user as TokenPayload | undefined
  if (!user?.can_delete) return res.status(403).json({ error: 'Delete permission required' })
  next()
}

// Convenience: require manager or admin role (admin panel — admin has full access, same as manager)
export function requireUserAdmin(req: Request, res: Response, next: NextFunction) {
  const user = res.locals.user as TokenPayload | undefined
  if (user?.role !== 'manager' && user?.role !== 'admin') return res.status(403).json({ error: 'Manager or admin role required' })
  next()
}
