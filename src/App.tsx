import { useState, useEffect, useCallback } from 'react'
import './App.css'
import * as api from './api'
import type { Customer, ColorRow } from './api'

import Ic from './icons'
import { useAuth } from './hooks/useAuth'
import { useWSSync } from './hooks/useWSSync'
import { useToast } from './hooks/useToast'
import { useAppUpdate } from './hooks/useAppUpdate'
import Login from './components/Login'
import UpdateBanner from './components/UpdateBanner'
import AddCustomerModal from './components/AddCustomerModal'
import CreateDispatchModal from './components/CreateDispatchModal'
import Dashboard from './pages/Dashboard'
import WarehouseApp from './pages/Warehouse'
import MasterPage from './pages/Master'
import AdminPage from './pages/Admin'

type View = 'dashboard' | 'warehouse' | 'master' | 'admin'

export default function App() {
  const { user, login, logout } = useAuth()
  const updateInfo = useAppUpdate()
  const [view, setView] = useState<View>('dashboard')
  const [showAddCustomer, setShowAddCustomer] = useState(false)
  const [showDispatch, setShowDispatch] = useState(false)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [colors, setColors] = useState<ColorRow[]>([])
  const [refreshSig, setRefreshSig] = useState(0)
  const refresh = useCallback(() => setRefreshSig(s => s + 1), [])
  const { toasts, add: toast } = useToast()

  useWSSync(refresh)

  useEffect(() => {
    if (!user) return
    api.getCustomers().then(setCustomers)
    api.getColors().then(setColors)
  }, [refreshSig, user])

  // Redirect away from admin view if user loses manager role (e.g. after re-login)
  useEffect(() => {
    if (view === 'admin' && user?.role !== 'manager') setView('dashboard')
  }, [user, view])

  const handleAddCustomer = async (name: string, contact: string) => {
    const c = await api.createCustomer(name, contact)
    setCustomers(prev => [...prev, c].sort((a, b) => a.customer_name.localeCompare(b.customer_name)))
    toast(`Customer "${name}" added`, 'ok')
  }

  if (!user) {
    return (
      <>
        {updateInfo && <UpdateBanner version={updateInfo.version} apkUrl={updateInfo.apk_url} />}
        <Login onLogin={login} />
      </>
    )
  }

  const canEdit   = !!user.can_edit
  const canDelete = !!user.can_delete

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      {updateInfo && <UpdateBanner version={updateInfo.version} apkUrl={updateInfo.apk_url} />}
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 sticky top-0 z-40" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Ic.Cube />
            <p className="text-sm font-bold text-white truncate hidden sm:block">Glass Beads WMS</p>
          </div>
          <nav className="ml-2 flex items-center gap-1 flex-1 overflow-x-auto">
            <button onClick={() => setView('dashboard')}
              className={`flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${view === 'dashboard' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-800'}`}>
              <Ic.Monitor /><span className="hidden sm:inline">Dashboard</span>
            </button>
            <button onClick={() => setView('warehouse')}
              className={`flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${view === 'warehouse' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}>
              <Ic.Building /><span className="hidden sm:inline">Warehouse</span>
            </button>
            <button onClick={() => setView('master')}
              className={`flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${view === 'master' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}>
              <Ic.Database /><span className="hidden sm:inline">Master</span>
            </button>
            {user.role === 'manager' && (
              <button onClick={() => setView('admin')}
                className={`flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${view === 'admin' ? 'bg-rose-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}>
                <Ic.Shield /><span className="hidden sm:inline">Admin</span>
              </button>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-2 flex-shrink-0">
            {!canEdit && (
              <span className="hidden sm:flex items-center gap-1 text-xs text-amber-400 bg-amber-900/20 border border-amber-700/40 px-2 py-1 rounded-lg">
                <Ic.Eye /> View only
              </span>
            )}
            <span className="text-xs text-gray-400 hidden sm:block">{user.username}</span>
            <button onClick={logout} title="Sign out"
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
              <Ic.LogOut />
            </button>
          </div>
        </div>
      </header>

      {view === 'dashboard' && (
        <Dashboard
          refreshSig={refreshSig}
          canEdit={canEdit}
          onAddCustomer={() => setShowAddCustomer(true)}
          onCreateDispatch={() => setShowDispatch(true)}
        />
      )}
      {view === 'warehouse' && <WarehouseApp refreshSig={refreshSig} canEdit={canEdit} />}
      {view === 'master' && <MasterPage canEdit={canEdit} canDelete={canDelete} />}
      {view === 'admin' && user.role === 'manager' && <AdminPage />}

      {showAddCustomer && canEdit && (
        <AddCustomerModal onClose={() => setShowAddCustomer(false)} onAdd={handleAddCustomer} />
      )}
      {showDispatch && canEdit && (
        <CreateDispatchModal customers={customers} colors={colors} onClose={() => setShowDispatch(false)} onCreated={refresh} />
      )}

      <div className="fixed bottom-5 right-5 flex flex-col gap-2 z-50 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm border shadow-xl ${t.type === 'ok' ? 'bg-emerald-900/80 text-emerald-300 border-emerald-700' : 'bg-red-900/80 text-red-300 border-red-700'}`}>
            {t.type === 'ok' ? <Ic.Check /> : <Ic.Warning />} {t.msg}
          </div>
        ))}
      </div>
    </div>
  )
}
