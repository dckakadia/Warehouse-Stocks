import { useState, useCallback, useEffect } from 'react'
import { login as apiLogin, setAuthToken, setUnauthorizedCallback, getStoredToken } from '../api'

export interface AuthUser {
  id: number
  username: string
  role: 'manager' | 'helper' | 'admin'
  can_view: number
  can_edit: number
  can_delete: number
  can_view_dashboard: number
  can_view_warehouse: number
  can_view_master: number
  can_view_report: number
}

function parseTokenUser(token: string): AuthUser | null {
  try {
    const data = token.split('.')[0]
    const b64 = data.replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - b64.length % 4) % 4)
    const payload = JSON.parse(atob(padded))
    if (payload.exp < Date.now()) return null
    return {
      id: payload.uid,
      username: payload.username,
      role: payload.role,
      can_view: payload.can_view,
      can_edit: payload.can_edit,
      can_delete: payload.can_delete,
      can_view_dashboard: payload.can_view_dashboard,
      can_view_warehouse: payload.can_view_warehouse,
      can_view_master: payload.can_view_master,
      can_view_report: payload.can_view_report,
    }
  } catch {
    return null
  }
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const tok = getStoredToken()
    return tok ? parseTokenUser(tok) : null
  })
  const [token, setToken] = useState<string | null>(() => getStoredToken())
  const [logoutReason, setLogoutReason] = useState<string | null>(null)

  const logout = useCallback((reason?: string) => {
    setAuthToken(null)
    setUser(null)
    setToken(null)
    setLogoutReason(reason ?? null)
  }, [])

  const doLogin = useCallback(async (username: string, password: string): Promise<void> => {
    const resp = await apiLogin(username, password)
    setAuthToken(resp.token)
    setUser(resp.user as AuthUser)
    setToken(resp.token)
    setLogoutReason(null)
  }, [])

  // Re-authenticates in place (used by the session-expiry warning banner) without
  // unmounting the current view, since `user`/`token` update alone doesn't remount pages.
  const refreshSession = useCallback(async (password: string): Promise<void> => {
    if (!user) throw new Error('Not logged in')
    await doLogin(user.username, password)
  }, [user, doLogin])

  useEffect(() => {
    setUnauthorizedCallback(() => logout('Your session expired — please sign in again.'))
    return () => setUnauthorizedCallback(() => {})
  }, [logout])

  return { user, token, login: doLogin, logout, refreshSession, logoutReason }
}
