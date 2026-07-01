import { useState, useEffect, useCallback } from 'react'
import * as api from '../api'
import type { AppUser } from '../api'
import Ic from '../icons'
import { useToast } from '../hooks/useToast'
import ConfirmDialog from '../components/ConfirmDialog'

/* ── Password Strength ── */
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

/* ── Admin Page ── */
const ROLE_LABELS: Record<string, string> = { manager: 'Manager', helper: 'Helper', admin: 'Admin' }
const ROLE_COLORS: Record<string, string> = {
  manager: 'bg-blue-900/40 text-blue-300 border-blue-700/60',
  helper:  'bg-amber-900/40 text-amber-300 border-amber-700/60',
  admin:   'bg-purple-900/40 text-purple-300 border-purple-700/60',
}

const EMPTY_USER_FORM = {
  id: null as number | null,
  username: '',
  password: '',
  role: 'helper' as 'manager' | 'helper' | 'admin',
  can_view: true,
  can_edit: false,
  can_delete: false,
  can_view_dashboard: true,
  can_view_warehouse: true,
  can_view_master: true,
  can_view_report: true,
  is_active: true,
}

type AdminTab = 'users' | 'backup'

/* ── Backup & Restore Panel ── */
function BackupPanel() {
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importConfirm, setImportConfirm] = useState<api.BackupPayload | null>(null)
  const [driveConfigured, setDriveConfigured] = useState<boolean | null>(null)
  const [driveBacking, setDriveBacking] = useState(false)
  const { add: toast } = useToast()

  useEffect(() => {
    api.gdriveStatus().then(s => setDriveConfigured(s.configured)).catch(() => setDriveConfigured(false))
  }, [])

  const handleExport = async () => {
    setExporting(true)
    try {
      const payload = await api.exportData()
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `warehouse-backup-${new Date().toISOString().split('T')[0]}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast('Backup downloaded', 'ok')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Export failed', 'err')
    }
    setExporting(false)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string) as api.BackupPayload
        if (!parsed.data || !parsed.exported_at) throw new Error('Invalid backup file format')
        setImportConfirm(parsed)
      } catch {
        toast('Invalid backup file — must be a JSON export from this app', 'err')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleImport = async () => {
    if (!importConfirm) return
    setImporting(true)
    try {
      const result = await api.importData(importConfirm)
      toast(`Restored ${result.tables.length} tables successfully`, 'ok')
      setImportConfirm(null)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Import failed', 'err')
    }
    setImporting(false)
  }

  const handleDriveBackup = async () => {
    setDriveBacking(true)
    try {
      const result = await api.gdriveBackup()
      toast(result.message, 'ok')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Drive backup failed', 'err')
    }
    setDriveBacking(false)
  }

  const exportedDate = importConfirm?.exported_at
    ? new Date(importConfirm.exported_at).toLocaleString()
    : null

  const tableCount = importConfirm ? Object.keys(importConfirm.data).length : 0
  const rowCount   = importConfirm ? Object.values(importConfirm.data).reduce((s, r) => s + r.length, 0) : 0

  return (
    <div className="space-y-5">
      {/* Export */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-blue-900/30 border border-blue-800/40 flex items-center justify-center text-blue-400 flex-shrink-0">
            <Ic.Download />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white mb-0.5">Export Backup</p>
            <p className="text-xs text-gray-400 mb-3">
              Downloads a full JSON snapshot of all stock, batches, customers, suppliers, dispatch orders, and users
              (including item images). Use this to back up your data before major changes or as an off-site copy.
            </p>
            <button onClick={handleExport} disabled={exporting}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors">
              <Ic.Download /> {exporting ? 'Exporting…' : 'Download Backup JSON'}
            </button>
          </div>
        </div>
      </div>

      {/* Import */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-amber-900/30 border border-amber-800/40 flex items-center justify-center text-amber-400 flex-shrink-0">
            <Ic.Upload />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white mb-0.5">Restore from Backup</p>
            <p className="text-xs text-gray-400 mb-3">
              Restores all data from a previously exported JSON file.{' '}
              <span className="text-red-400 font-medium">This will erase and replace all current data.</span>{' '}
              Use only for disaster recovery.
            </p>
            <label className="flex items-center gap-1.5 px-4 py-2 bg-amber-700/80 hover:bg-amber-600/80 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer w-fit">
              <Ic.Upload /> Choose Backup File
              <input type="file" accept=".json" className="hidden" onChange={handleFileSelect} />
            </label>
          </div>
        </div>
      </div>

      {/* Google Drive */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-emerald-900/30 border border-emerald-800/40 flex items-center justify-center text-emerald-400 flex-shrink-0">
            <Ic.Cloud />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="text-sm font-semibold text-white">Google Drive Backup</p>
              {driveConfigured === true  && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-900/40 text-emerald-400 border border-emerald-700/40">Connected</span>}
              {driveConfigured === false && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-500 border border-gray-700">Not configured</span>}
            </div>

            {driveConfigured === true ? (
              <>
                <p className="text-xs text-gray-400 mb-3">
                  Google Drive is connected. Click below to upload a backup now, or enable the daily 2am auto-backup via cron.
                </p>
                <div className="flex flex-wrap gap-2 mb-3">
                  <button onClick={handleDriveBackup} disabled={driveBacking}
                    className="flex items-center gap-1.5 px-4 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors">
                    <Ic.Cloud /> {driveBacking ? 'Uploading…' : 'Backup to Drive Now'}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mb-1">Enable daily 2am auto-backup — add to server crontab:</p>
                <div className="bg-gray-950 rounded-lg px-3 py-2 font-mono text-xs text-emerald-400 overflow-x-auto">
                  0 2 * * * /home/dckakadia/warehouse-stocks/scripts/backup-db.sh &gt;&gt; /home/dckakadia/warehouse-stocks/backups/backup.log 2&gt;&amp;1
                </div>
              </>
            ) : (
              <>
                <p className="text-xs text-gray-400 mb-3">
                  Run this once on the server to connect Google Drive. Backups will then upload automatically.
                </p>
                <div className="bg-gray-950 rounded-lg px-3 py-2 font-mono text-xs text-emerald-400 overflow-x-auto">
                  bash /home/dckakadia/warehouse-stocks/scripts/setup-gdrive.sh
                </div>
                <p className="text-xs text-gray-500 mt-2">Reload this page after setup to confirm the connection.</p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Import confirmation dialog */}
      {importConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="bg-gray-900 border border-amber-700/60 rounded-xl p-6 max-w-sm w-full shadow-2xl">
            <p className="text-sm font-semibold text-white mb-1">Restore from backup?</p>
            <p className="text-xs text-gray-400 mb-3">
              Backup from <span className="text-amber-300">{exportedDate}</span><br />
              Contains <span className="text-white font-medium">{rowCount}</span> records across{' '}
              <span className="text-white font-medium">{tableCount}</span> tables.
            </p>
            <p className="text-xs text-red-400 mb-4 font-medium">
              All current data will be permanently replaced.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setImportConfirm(null)}
                className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm font-medium transition-colors">
                Cancel
              </button>
              <button onClick={handleImport} disabled={importing}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors">
                {importing ? 'Restoring…' : 'Yes, Restore'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AdminPage() {
  const [adminTab, setAdminTab] = useState<AdminTab>('users')
  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<typeof EMPTY_USER_FORM | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [confirmDeleteName, setConfirmDeleteName] = useState('')
  const { toasts, add: toast } = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    const rows = await api.getAdminUsers()
    setUsers(rows)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const openCreate = () => setForm({ ...EMPTY_USER_FORM })
  const openEdit = (u: AppUser) => setForm({
    id: u.id,
    username: u.username,
    password: '',
    role: u.role,
    can_view: !!u.can_view,
    can_edit: !!u.can_edit,
    can_delete: !!u.can_delete,
    can_view_dashboard: !!u.can_view_dashboard,
    can_view_warehouse: !!u.can_view_warehouse,
    can_view_master: !!u.can_view_master,
    can_view_report: !!u.can_view_report,
    is_active: !!u.is_active,
  })

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form) return
    setSaving(true)
    try {
      if (form.id) {
        await api.updateAdminUser(form.id, {
          role: form.role,
          can_view: form.can_view,
          can_edit: form.can_edit,
          can_delete: form.can_delete,
          can_view_dashboard: form.can_view_dashboard,
          can_view_warehouse: form.can_view_warehouse,
          can_view_master: form.can_view_master,
          can_view_report: form.can_view_report,
          is_active: form.is_active,
          ...(form.password ? { password: form.password } : {}),
        })
        toast('User updated', 'ok')
      } else {
        await api.createAdminUser({
          username: form.username,
          password: form.password,
          role: form.role,
          can_view: form.can_view,
          can_edit: form.can_edit,
          can_delete: form.can_delete,
          can_view_dashboard: form.can_view_dashboard,
          can_view_warehouse: form.can_view_warehouse,
          can_view_master: form.can_view_master,
          can_view_report: form.can_view_report,
        })
        toast(`User "${form.username}" created`, 'ok')
      }
      setForm(null)
      load()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error', 'err')
    }
    setSaving(false)
  }

  const handleDelete = async (id: number) => {
    try {
      await api.deleteAdminUser(id)
      toast(`User "${confirmDeleteName}" deleted`, 'ok')
      load()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error', 'err')
    }
    setConfirmDeleteId(null)
    setConfirmDeleteName('')
  }

  return (
    <main className="max-w-5xl mx-auto px-4 py-6 w-full">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-white tracking-tight">Admin Panel</h1>
        <p className="text-sm text-gray-400 mt-0.5">Manage users and backups</p>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {([
          { key: 'users',     label: 'Users',  icon: <Ic.Shield /> },
          { key: 'backup',    label: 'Backup', icon: <Ic.Download /> },
        ] as { key: AdminTab; label: string; icon: React.ReactNode }[]).map(t => (
          <button key={t.key} onClick={() => setAdminTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${adminTab === t.key ? 'bg-rose-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {adminTab === 'backup' && <BackupPanel />}

      {adminTab === 'users' && <>
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-blue-400"><Ic.Shield /></span>
            <h2 className="text-base font-semibold text-white">Users</h2>
            <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">{users.length}</span>
          </div>
          <div className="flex items-center gap-2">
            {form !== null && (
              <button onClick={() => setForm(null)} className="text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded-lg bg-gray-800 transition-colors">Cancel</button>
            )}
            <button onClick={openCreate}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition-colors">
              <Ic.Plus /> Add User
            </button>
          </div>
        </div>

        {form !== null && (
          <form onSubmit={handleSave} className="mb-5 bg-gray-900 border border-blue-800/40 rounded-xl p-5 space-y-4">
            <p className="text-xs font-semibold text-blue-300 uppercase tracking-wide">
              {form.id ? `Edit User — ${form.username}` : 'New User'}
            </p>

            {!form.id && (
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
                  Username <span className="text-red-400">*</span>
                </label>
                <input autoFocus value={form.username} onChange={e => setForm(f => f && { ...f, username: e.target.value })} required
                  placeholder="e.g. john_manager"
                  className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
                {form.id ? 'New Password' : 'Password'} {!form.id && <span className="text-red-400">*</span>}
              </label>
              <input type="password" value={form.password} onChange={e => setForm(f => f && { ...f, password: e.target.value })}
                required={!form.id} minLength={4} placeholder={form.id ? 'Leave blank to keep current' : 'Min 4 characters'}
                className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
              <PasswordStrength password={form.password} />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">Role <span className="text-red-400">*</span></label>
              <div className="flex gap-2">
                {(['manager', 'helper', 'admin'] as const).map(r => (
                  <button key={r} type="button" onClick={() => setForm(f => f && { ...f, role: r })}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${form.role === r ? ROLE_COLORS[r] : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                    {ROLE_LABELS[r]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">Access Rights</label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { key: 'can_view',   label: 'View',   icon: <Ic.Eye />,    color: 'emerald' },
                  { key: 'can_edit',   label: 'Edit',   icon: <Ic.Pencil />, color: 'blue' },
                  { key: 'can_delete', label: 'Delete', icon: <Ic.Trash />,  color: 'red' },
                ] as const).map(({ key, label, icon, color }) => {
                  const checked = !!form[key]
                  return (
                    <button key={key} type="button"
                      onClick={() => setForm(f => f && { ...f, [key]: !f[key] })}
                      className={`flex flex-col items-center gap-1.5 py-3 rounded-lg border text-xs font-medium transition-colors ${
                        checked
                          ? color === 'emerald' ? 'bg-emerald-900/30 border-emerald-700 text-emerald-300'
                          : color === 'blue'    ? 'bg-blue-900/30 border-blue-700 text-blue-300'
                          :                      'bg-red-900/30 border-red-700 text-red-300'
                          : 'bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-500'
                      }`}>
                      {icon}
                      {label}
                      <span className={`w-4 h-4 rounded border flex items-center justify-center ${
                        checked
                          ? color === 'emerald' ? 'bg-emerald-600 border-emerald-500'
                          : color === 'blue'    ? 'bg-blue-600 border-blue-500'
                          :                      'bg-red-600 border-red-500'
                          : 'border-gray-600 bg-gray-700'
                      }`}>
                        {checked && <Ic.Check />}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">Page Access</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {([
                  { key: 'can_view_dashboard', label: 'Dashboard', icon: <Ic.Monitor /> },
                  { key: 'can_view_warehouse', label: 'Warehouse', icon: <Ic.Building /> },
                  { key: 'can_view_master',    label: 'Master',    icon: <Ic.Database /> },
                  { key: 'can_view_report',    label: 'Report',    icon: <Ic.Clipboard /> },
                ] as const).map(({ key, label, icon }) => {
                  const checked = !!form[key]
                  return (
                    <button key={key} type="button"
                      onClick={() => setForm(f => f && { ...f, [key]: !f[key] })}
                      className={`flex flex-col items-center gap-1.5 py-3 rounded-lg border text-xs font-medium transition-colors ${
                        checked
                          ? 'bg-teal-900/30 border-teal-700 text-teal-300'
                          : 'bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-500'
                      }`}>
                      {icon}
                      {label}
                      <span className={`w-4 h-4 rounded border flex items-center justify-center ${
                        checked ? 'bg-teal-600 border-teal-500' : 'border-gray-600 bg-gray-700'
                      }`}>
                        {checked && <Ic.Check />}
                      </span>
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-gray-500 mt-1.5">Controls which nav pages this user can open.</p>
            </div>

            {form.id && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => f && { ...f, is_active: e.target.checked })}
                  className="w-4 h-4 rounded accent-blue-500" />
                <span className="text-xs text-gray-300">Active</span>
              </label>
            )}

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setForm(null)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs font-medium transition-colors">Cancel</button>
              <button type="submit" disabled={saving}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors">
                {saving ? 'Saving…' : form.id ? 'Save Changes' : 'Create User'}
              </button>
            </div>
          </form>
        )}

        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-800/60 border-b border-gray-800">
                {['USERNAME', 'ROLE', 'RIGHTS', 'PAGES', 'STATUS', 'CREATED'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 tracking-wider whitespace-nowrap">{h}</th>
                ))}
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-400 tracking-wider">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {loading && <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-500 text-sm">Loading…</td></tr>}
              {!loading && users.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-500 text-sm">No users yet.</td></tr>}
              {users.map(u => (
                <tr key={u.id} className="hover:bg-gray-800/40 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center text-gray-300 text-xs font-bold flex-shrink-0">
                        {u.username[0].toUpperCase()}
                      </span>
                      <span className="text-sm font-medium text-white">{u.username}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${ROLE_COLORS[u.role]}`}>
                      {ROLE_LABELS[u.role]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5 flex-wrap">
                      {u.can_view   ? <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-900/30 text-emerald-400 border border-emerald-800/60 font-medium">View</span>   : null}
                      {u.can_edit   ? <span className="text-xs px-1.5 py-0.5 rounded bg-blue-900/30 text-blue-400 border border-blue-800/60 font-medium">Edit</span>   : null}
                      {u.can_delete ? <span className="text-xs px-1.5 py-0.5 rounded bg-red-900/30 text-red-400 border border-red-800/60 font-medium">Delete</span> : null}
                      {!u.can_view && !u.can_edit && !u.can_delete && <span className="text-xs text-gray-600 italic">No rights</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5 flex-wrap">
                      {u.can_view_dashboard ? <span className="text-xs px-1.5 py-0.5 rounded bg-teal-900/30 text-teal-400 border border-teal-800/60 font-medium">Dashboard</span> : null}
                      {u.can_view_warehouse ? <span className="text-xs px-1.5 py-0.5 rounded bg-teal-900/30 text-teal-400 border border-teal-800/60 font-medium">Warehouse</span> : null}
                      {u.can_view_master    ? <span className="text-xs px-1.5 py-0.5 rounded bg-teal-900/30 text-teal-400 border border-teal-800/60 font-medium">Master</span>    : null}
                      {u.can_view_report    ? <span className="text-xs px-1.5 py-0.5 rounded bg-teal-900/30 text-teal-400 border border-teal-800/60 font-medium">Report</span>    : null}
                      {!u.can_view_dashboard && !u.can_view_warehouse && !u.can_view_master && !u.can_view_report && (
                        <span className="text-xs text-gray-600 italic">No pages</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${u.is_active ? 'bg-emerald-900/30 text-emerald-400 border-emerald-800/60' : 'bg-gray-700 text-gray-500 border-gray-600'}`}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(u)}
                        className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-blue-900/20 rounded transition-colors">
                        <Ic.Pencil />
                      </button>
                      <button onClick={() => { setConfirmDeleteId(u.id); setConfirmDeleteName(u.username) }}
                        className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors">
                        <Ic.Trash />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 bg-gray-900 border border-gray-800 rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Role Capabilities</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { role: 'Manager', color: ROLE_COLORS.manager, desc: 'Full operational access — View/Edit/Delete rights and Dashboard/Warehouse/Master/Report page access are both configurable per manager.' },
            { role: 'Helper',  color: ROLE_COLORS.helper,  desc: 'Support role — typically assigned View-only access; edit/delete rights can be enabled if needed.' },
            { role: 'Admin',   color: ROLE_COLORS.admin,   desc: 'Same full access as Manager — a separate role label for user management staff, with identically configurable rights and page access.' },
          ].map(({ role, color, desc }) => (
            <div key={role} className="flex items-start gap-3 p-3 bg-gray-800/40 rounded-lg border border-gray-800">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded border mt-0.5 flex-shrink-0 ${color}`}>{role}</span>
              <p className="text-xs text-gray-400">{desc}</p>
            </div>
          ))}
        </div>
      </div>
      </>}

      <div className="fixed bottom-5 right-5 flex flex-col gap-2 z-50 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm border shadow-xl ${t.type === 'ok' ? 'bg-emerald-900/80 text-emerald-300 border-emerald-700' : 'bg-red-900/80 text-red-300 border-red-700'}`}>
            {t.type === 'ok' ? <Ic.Check /> : <Ic.Warning />} {t.msg}
          </div>
        ))}
      </div>

      {confirmDeleteId !== null && (
        <ConfirmDialog
          message={`Delete user "${confirmDeleteName}"? This cannot be undone.`}
          onConfirm={() => handleDelete(confirmDeleteId)}
          onCancel={() => { setConfirmDeleteId(null); setConfirmDeleteName('') }}
        />
      )}
    </main>
  )
}
