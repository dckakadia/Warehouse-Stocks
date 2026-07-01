import { useState, useCallback } from 'react'

export interface Toast { id: number; msg: string; type: 'ok' | 'err' }

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const add = useCallback((msg: string, type: Toast['type'] = 'ok') => {
    const id = Date.now()
    setToasts(p => [...p, { id, msg, type }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500)
  }, [])
  return { toasts, add }
}
