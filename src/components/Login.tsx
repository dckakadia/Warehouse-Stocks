import { useState, type FormEvent } from 'react'

interface Props {
  onLogin: (username: string, password: string) => Promise<void>
}

function PasswordStrength({ password }: { password: string }) {
  if (!password) return null
  const score = password.length >= 12 ? 3 : password.length >= 8 ? 2 : 1
  const labels = ['', 'Weak', 'Medium', 'Strong']
  const colors = ['', 'bg-red-500', 'bg-yellow-400', 'bg-green-500']
  return (
    <div className="mt-1 flex items-center gap-2">
      <div className="flex gap-1 flex-1">
        {[1, 2, 3].map(i => (
          <div key={i} className={`h-1 flex-1 rounded-full ${i <= score ? colors[score] : 'bg-gray-700'}`} />
        ))}
      </div>
      <span className="text-xs text-gray-400">{labels[score]}</span>
    </div>
  )
}

export default function Login({ onLogin }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
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
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className={`w-full px-3 py-2 bg-gray-800 text-white rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${error && !password ? 'border-red-500' : 'border-gray-700'}`}
              placeholder="Enter password"
              disabled={loading}
            />
            <PasswordStrength password={password} />
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
      </div>
    </div>
  )
}
