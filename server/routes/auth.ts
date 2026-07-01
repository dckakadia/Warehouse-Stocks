import { Router } from 'express'
import db from '../db.js'
import { verifyPassword } from './admin.js'
import { signToken } from '../auth.js'

const router = Router()

/* ── In-memory rate limiter: 5 attempts per IP per 15 min ── */
const attempts = new Map<string, { count: number; resetAt: number }>()
const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 5

function checkRateLimit(ip: string): { allowed: boolean; retryAfterSec?: number } {
  const now = Date.now()
  const entry = attempts.get(ip)
  if (!entry || entry.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return { allowed: true }
  }
  if (entry.count >= MAX_ATTEMPTS) {
    return { allowed: false, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) }
  }
  entry.count++
  return { allowed: true }
}

function clearRateLimit(ip: string) {
  attempts.delete(ip)
}

/* ── POST /api/auth/login ── */
router.post('/login', (req, res) => {
  const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? req.socket.remoteAddress ?? 'unknown'

  const rl = checkRateLimit(ip)
  if (!rl.allowed) {
    return res.status(429).json({
      error: `Too many failed attempts. Try again in ${rl.retryAfterSec} seconds.`,
    })
  }

  const { username, password } = req.body as { username?: string; password?: string }
  if (!username?.trim() || !password) {
    return res.status(400).json({ error: 'Username and password are required' })
  }

  const user = db.prepare(
    'SELECT id, username, password_hash, role, can_view, can_edit, can_delete, can_view_dashboard, can_view_warehouse, can_view_master, can_view_report, is_active FROM app_users WHERE username = ?'
  ).get(username.trim()) as {
    id: number; username: string; password_hash: string
    role: 'manager' | 'helper' | 'admin'
    can_view: number; can_edit: number; can_delete: number
    can_view_dashboard: number; can_view_warehouse: number; can_view_master: number; can_view_report: number
    is_active: number
  } | undefined

  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' })
  }

  if (!user.is_active) {
    return res.status(403).json({ error: 'Account is disabled. Contact an administrator.' })
  }

  clearRateLimit(ip)

  const token = signToken({
    uid: user.id,
    username: user.username,
    role: user.role,
    can_view: user.can_view,
    can_edit: user.can_edit,
    can_delete: user.can_delete,
    can_view_dashboard: user.can_view_dashboard,
    can_view_warehouse: user.can_view_warehouse,
    can_view_master: user.can_view_master,
    can_view_report: user.can_view_report,
  })

  return res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      can_view: user.can_view,
      can_edit: user.can_edit,
      can_delete: user.can_delete,
      can_view_dashboard: user.can_view_dashboard,
      can_view_warehouse: user.can_view_warehouse,
      can_view_master: user.can_view_master,
      can_view_report: user.can_view_report,
    },
  })
})

/* ── POST /api/auth/logout ── (stateless — client drops token) ── */
router.post('/logout', (_req, res) => {
  res.json({ success: true })
})

export default router
