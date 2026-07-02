import { useState, useEffect, useCallback, useRef } from 'react'
import './App.css'
import * as api from './api'
import type { Customer, ColorRow } from './api'

import Ic from './icons'
import { useAuth } from './hooks/useAuth'
import { useWSSync } from './hooks/useWSSync'
import { useToast } from './hooks/useToast'
import { useAppUpdate } from './hooks/useAppUpdate'
import { useAppVersion } from './hooks/useAppVersion'
import { useSessionExpiry } from './hooks/useSessionExpiry'
import { useOnlineStatus } from './hooks/useOnlineStatus'
import { PinGate } from './components/PinGate'
import Login from './components/Login'
import UpdateBanner from './components/UpdateBanner'
import SessionExpiryBanner from './components/SessionExpiryBanner'
import OfflineBanner from './components/OfflineBanner'
import CreateDispatchModal from './components/CreateDispatchModal'
import Dashboard from './pages/Dashboard'
import WarehouseApp from './pages/Warehouse'
import MasterPage from './pages/Master'
import AdminPage from './pages/Admin'
import ReportPage from './pages/Report'

type View = 'dashboard' | 'warehouse' | 'master' | 'report' | 'admin'

function BannerStack({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed top-0 left-0 right-0 z-[200] flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      {children}
    </div>
  )
}

function AppInner() {
  const { user, token, login, logout, refreshSession, logoutReason } = useAuth()
  const { showWarning: showSessionWarning, dismiss: dismissSessionWarning } = useSessionExpiry(token)
  const updateInfo = useAppUpdate()
  const version = useAppVersion()
  const isOnline = useOnlineStatus()
  const [view, setView] = useState<View>('dashboard')
  const [showDispatch, setShowDispatch] = useState(false)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [colors, setColors] = useState<ColorRow[]>([])
  const [refreshSig, setRefreshSig] = useState(0)
  const [refreshEntity, setRefreshEntity] = useState('all')
  const bumpRefresh = useCallback((entity: string) => {
    setRefreshSig(s => s + 1)
    setRefreshEntity(entity)
  }, [])
  // Manual trigger after locally creating a dispatch order — the server's own broadcast
  // for the same mutation will also arrive via WS, this just avoids waiting on that round-trip.
  const refresh = useCallback(() => bumpRefresh('dispatch'), [bumpRefresh])
  const { toasts } = useToast()
  const hasLoadedAppDataRef = useRef(false)

  useWSSync(bumpRefresh)

  useEffect(() => {
    if (!user) { hasLoadedAppDataRef.current = false; return }
    // Gate on this tab's own "have I loaded since logging in" flag, not the shared refreshSig
    // counter — refreshSig persists across a logout/re-login, so a fresh login (e.g. after the
    // session-expiry re-auth flow) must always refetch regardless of the last broadcast's entity.
    if (hasLoadedAppDataRef.current && !['customers', 'items', 'all'].includes(refreshEntity)) return
    hasLoadedAppDataRef.current = true
    api.getCustomers().then(setCustomers).catch(() => {})
    api.getColors().then(setColors).catch(() => {})
  }, [refreshSig, refreshEntity, user])

  // Page access is configurable per-user (manager, helper, and admin all use the same flags)
  const canViewDashboard = !user || !!user.can_view_dashboard
  const canViewWarehouse = !user || !!user.can_view_warehouse
  const canViewMaster    = !user || !!user.can_view_master
  const canViewReport    = !user || !!user.can_view_report
  // Admin panel stays role-based (it manages users) — not a per-user page flag; admin role only, managers no longer get it
  const canViewAdminPanel = user?.role === 'admin'
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

  if (!user) {
    return (
      <>
        <BannerStack>
          {!isOnline && <OfflineBanner />}
          {updateInfo && <UpdateBanner version={updateInfo.version} apkUrl={updateInfo.apk_url} />}
        </BannerStack>
        <Login onLogin={login} reason={logoutReason} />
      </>
    )
  }

  const canEdit   = !!user.can_edit
  const canDelete = !!user.can_delete

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      <BannerStack>
        {!isOnline && <OfflineBanner />}
        {updateInfo && <UpdateBanner version={updateInfo.version} apkUrl={updateInfo.apk_url} />}
        {showSessionWarning && (
          <SessionExpiryBanner onReauth={refreshSession} onDismiss={dismissSessionWarning} />
        )}
      </BannerStack>
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
            <span className="text-xs text-gray-600 hidden md:block">v{version}</span>
            <button onClick={() => logout()} title="Sign out"
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
              <Ic.LogOut />
            </button>
          </div>
        </div>
      </header>

      {view === 'dashboard' && canViewDashboard && (
        <Dashboard
          refreshSig={refreshSig}
          refreshEntity={refreshEntity}
          canEdit={canEdit}
          onCreateDispatch={() => setShowDispatch(true)}
        />
      )}
      {view === 'warehouse' && canViewWarehouse && (
        <WarehouseApp
          refreshSig={refreshSig}
          refreshEntity={refreshEntity}
          canEdit={canEdit}
          isManager={user.role === 'manager' || user.role === 'admin'}
        />
      )}
      {view === 'master' && canViewMaster && <MasterPage canEdit={canEdit} canDelete={canDelete} />}
      {view === 'report' && canViewReport && <ReportPage canEdit={canEdit} canDelete={canDelete} />}
      {view === 'admin' && canViewAdminPanel && <AdminPage />}
      {allowedViews.length === 0 && (
        <main className="max-w-lg mx-auto px-4 py-16 text-center text-gray-400">
          <p className="text-sm">You don't have access to any pages. Contact a manager to update your permissions.</p>
        </main>
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

// PIN gate wrapped around the whole app, kept as a separate outer component (rather than an
// early return inside AppInner) so it doesn't change AppInner's hook count/order between
// renders — an early return before other hooks in the same component violates the Rules of
// Hooks and crashes React once the gate unlocks and the rest of the hooks start being called.
export default function App() {
  const [pinUnlocked, setPinUnlocked] = useState(false)
  if (!pinUnlocked) return <PinGate onSuccess={() => setPinUnlocked(true)} />
  return <AppInner />
}
