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
import ReportPage from './pages/Report'

type View = 'dashboard' | 'warehouse' | 'master' | 'report' | 'admin'

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

  // Page access is configurable per-user (manager, helper, and admin all use the same flags)
  const canViewDashboard = !user || !!user.can_view_dashboard
  const canViewWarehouse = !user || !!user.can_view_warehouse
  const canViewMaster    = !user || !!user.can_view_master
  // Report (Customer/Supplier ledger) and Admin panel: manager and admin roles, full access
  const canViewReport     = user?.role === 'manager' || user?.role === 'admin'
  const canViewAdminPanel = user?.role === 'manager' || user?.role === 'admin'
  const allowedViews: View[] = [
    ...(canViewDashboard ? ['dashboard' as const] : []),
    ...(canViewWarehouse ? ['warehouse' as const] : []),
    ...(canViewMaster ? ['master' as const] : []),
    ...(canViewReport ? ['report' as const] : []),
    ...(canViewAdminPanel ? ['admin' as const] : []),
  ]

  // Redirect away from a view the user no longer has access to (e.g. after re-login or rights change)
  useEffect(() => {
    if (!user) return
    if (!allowedViews.includes(view) && allowedViews.length > 0) setView(allowedViews[0])
  }, [user, view, allowedViews])

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
            {canViewDashboard && (
            <button onClick={() => setView('dashboard')}
              className={`flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${view === 'dashboard' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-800'}`}>
              <Ic.Monitor /><span className="hidden sm:inline">Dashboard</span>
            </button>
            )}
            {canViewWarehouse && (
            <button onClick={() => setView('warehouse')}
              className={`flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${view === 'warehouse' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}>
              <Ic.Building /><span className="hidden sm:inline">Warehouse</span>
            </button>
            )}
            {canViewMaster && (
            <button onClick={() => setView('master')}
              className={`flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${view === 'master' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}>
              <Ic.Database /><span className="hidden sm:inline">Master</span>
            </button>
            )}
            {canViewReport && (
            <button onClick={() => setView('report')}
              className={`flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${view === 'report' ? 'bg-teal-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}>
              <Ic.Clipboard /><span className="hidden sm:inline">Report</span>
            </button>
            )}
            {canViewAdminPanel && (
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

      {view === 'dashboard' && canViewDashboard && (
        <Dashboard
          refreshSig={refreshSig}
          canEdit={canEdit}
          onAddCustomer={() => setShowAddCustomer(true)}
          onCreateDispatch={() => setShowDispatch(true)}
        />
      )}
      {view === 'warehouse' && canViewWarehouse && <WarehouseApp refreshSig={refreshSig} canEdit={canEdit} isManager={user.role === 'manager' || user.role === 'admin'} />}
      {view === 'master' && canViewMaster && <MasterPage canEdit={canEdit} canDelete={canDelete} />}
      {view === 'report' && canViewReport && <ReportPage canEdit={canEdit} canDelete={canDelete} />}
      {view === 'admin' && canViewAdminPanel && <AdminPage />}
      {allowedViews.length === 0 && (
        <main className="max-w-lg mx-auto px-4 py-16 text-center text-gray-400">
          <p className="text-sm">You don't have access to any pages. Contact a manager to update your permissions.</p>
        </main>
      )}

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
