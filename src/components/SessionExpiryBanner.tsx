import { useState } from 'react'
import Ic from '../icons'

interface Props {
  onReauth: (password: string) => Promise<void>
  onDismiss: () => void
}

export default function SessionExpiryBanner({ onReauth, onDismiss }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await onReauth(password)
      setPassword('')
      setExpanded(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Incorrect password')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-amber-600 text-white shadow-xl">
      <div className="px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex-shrink-0"><Ic.Warning /></span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-tight">Your session will expire soon</p>
            <p className="text-xs text-amber-100 mt-0.5">Save your work — you'll be signed out automatically when it expires.</p>
          </div>
          {!expanded && (
            <button onClick={() => setExpanded(true)}
              className="shrink-0 px-4 py-1.5 bg-white text-amber-700 text-xs font-bold rounded-lg hover:bg-amber-50 transition-colors">
              Stay Signed In
            </button>
          )}
          <button onClick={onDismiss} className="shrink-0 text-amber-100 hover:text-white text-xl leading-none px-1">×</button>
        </div>

        {expanded && (
          <form onSubmit={handleSubmit} className="flex items-center gap-2 mt-2.5">
            <input
              type="password"
              autoFocus
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Confirm your password"
              className="flex-1 px-3 py-1.5 bg-white/95 text-gray-900 rounded-lg text-sm placeholder-gray-500 focus:outline-none"
              disabled={submitting}
            />
            <button type="submit" disabled={submitting || !password}
              className="shrink-0 px-4 py-1.5 bg-white text-amber-700 text-xs font-bold rounded-lg hover:bg-amber-50 disabled:opacity-60 transition-colors">
              {submitting ? 'Checking…' : 'Confirm'}
            </button>
            <button type="button" onClick={() => { setExpanded(false); setError('') }}
              className="shrink-0 text-amber-100 hover:text-white text-xs px-2">
              Cancel
            </button>
          </form>
        )}
        {error && <p className="text-xs text-white bg-red-700/60 rounded-lg px-3 py-1.5 mt-2">{error}</p>}
      </div>
    </div>
  )
}
