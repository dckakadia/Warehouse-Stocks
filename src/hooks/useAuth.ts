import { useState, useCallback, useEffect } from 'react'
import { login as apiLogin, setAuthToken, setUnauthorizedCallback, getStoredToken } from '../api'

export interface AuthUser {
  id: number
  username: string
  role: 'manager' | 'helper'
  can_view: number
  can_edit: number
  can_delete: number
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

  const logout = useCallback(() => {
    setAuthToken(null)
    setUser(null)
  }, [])

  const doLogin = useCallback(async (username: string, password: string): Promise<void> => {
    const resp = await apiLogin(username, password)
    setAuthToken(resp.token)
    setUser(resp.user as AuthUser)
  }, [])

  useEffect(() => {
    setUnauthorizedCallback(logout)
    return () => setUnauthorizedCallback(() => {})
  }, [logout])

  return { user, login: doLogin, logout }
}
