import { useState, useEffect, useCallback } from 'react'

const WARNING_MS = 5 * 60 * 1000

function getTokenExp(token: string | null): number | null {
  if (!token) return null
  try {
    const data = token.split('.')[0]
    const b64 = data.replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - b64.length % 4) % 4)
    const payload = JSON.parse(atob(padded))
    return typeof payload.exp === 'number' ? payload.exp : null
  } catch {
    return null
  }
}

export function useSessionExpiry(token: string | null) {
  const [showWarning, setShowWarning] = useState(false)

  useEffect(() => {
    setShowWarning(false)
    const exp = getTokenExp(token)
    if (!exp) return

    const msUntilWarning = exp - WARNING_MS - Date.now()
    if (msUntilWarning <= 0) {
      setShowWarning(true)
      return
    }
    const timer = setTimeout(() => setShowWarning(true), msUntilWarning)
    return () => clearTimeout(timer)
  }, [token])

  const dismiss = useCallback(() => setShowWarning(false), [])

  return { showWarning, dismiss }
}
