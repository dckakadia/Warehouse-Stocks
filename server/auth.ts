import { createHmac, timingSafeEqual, randomBytes } from 'crypto'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SECRET_FILE = path.join(__dirname, '.auth_secret')

function loadSecret(): string {
  if (existsSync(SECRET_FILE)) return readFileSync(SECRET_FILE, 'utf8').trim()
  const secret = randomBytes(32).toString('hex')
  writeFileSync(SECRET_FILE, secret, { mode: 0o600 })
  return secret
}

export const AUTH_SECRET = loadSecret()

export interface TokenPayload {
  uid: number
  username: string
  role: 'manager' | 'helper'
  can_view: number
  can_edit: number
  can_delete: number
  exp: number
}

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

export function signToken(user: Omit<TokenPayload, 'exp'>): string {
  const payload: TokenPayload = { ...user, exp: Date.now() + TOKEN_TTL_MS }
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = createHmac('sha256', AUTH_SECRET).update(data).digest('base64url')
  return `${data}.${sig}`
}

export function verifyToken(token: string): TokenPayload | null {
  const dot = token.lastIndexOf('.')
  if (dot === -1) return null
  const data = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  try {
    const expected = createHmac('sha256', AUTH_SECRET).update(data).digest('base64url')
    const sigBuf = Buffer.from(sig, 'base64url')
    const expBuf = Buffer.from(expected, 'base64url')
    if (sigBuf.length !== expBuf.length) return null
    if (!timingSafeEqual(sigBuf, expBuf)) return null
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString()) as TokenPayload
    if (payload.exp < Date.now()) return null
    return payload
  } catch {
    return null
  }
}
