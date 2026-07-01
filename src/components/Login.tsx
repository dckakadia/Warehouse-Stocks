import { useState, type FormEvent } from 'react'
import Ic from '../icons'
import { useAppVersion } from '../hooks/useAppVersion'

interface Props {
  onLogin: (username: string, password: string) => Promise<void>
  reason?: string | null
}

export default function Login({ onLogin, reason }: Props) {
  const version = useAppVersion()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!username.trim() || !password) {
      setError('Username and password are required')
      return
    }
    setError('')
    setLoading(true)
    try {
      await onLogin(username.trim(), password)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">💎</div>
          <h1 className="text-2xl font-bold text-white">Glass Beads WMS</h1>
          <p className="text-gray-400 text-sm mt-1">Warehouse Management System</p>
        </div>

        {reason && (
          <div className="mb-4 text-sm text-amber-300 bg-amber-900/30 border border-amber-700 rounded-lg px-3 py-2">
            {reason}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-gray-900 rounded-2xl p-6 shadow-xl space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Username</label>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className={`w-full px-3 py-2 bg-gray-800 text-white rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${error && !username.trim() ? 'border-red-500' : 'border-gray-700'}`}
              placeholder="Enter username"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className={`w-full px-3 py-2 pr-10 bg-gray-800 text-white rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${error && !password ? 'border-red-500' : 'border-gray-700'}`}
                placeholder="Enter password"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                tabIndex={-1}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <Ic.Eye />
              </button>
            </div>
          </div>

          {error && (
            <div className="text-sm text-red-400 bg-red-900/30 border border-red-700 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors text-sm"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-600 mt-4">v{version}</p>
      </div>
    </div>
  )
}
