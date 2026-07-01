import { useState, useEffect, useCallback, useMemo } from 'react'
import * as api from '../api'
import type { AppUser, CustomerSummary, CustomerLedgerDetail, CustomerOrderRow, SupplierSummary, SupplierLedgerDetail } from '../api'
import Ic from '../icons'
import { useToast } from '../hooks/useToast'
import ConfirmDialog from '../components/ConfirmDialog'

/* ── Status Badge ── */
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    Pending:   'bg-amber-900/30 text-amber-300 border-amber-700/60',
    Picked:    'bg-emerald-900/30 text-emerald-400 border-emerald-700/60',
    Cancelled: 'bg-red-900/30 text-red-400 border-red-700/60',
    Active:    'bg-emerald-900/30 text-emerald-400 border-emerald-700/60',
    Depleted:  'bg-gray-700 text-gray-400 border-gray-600',
  }
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${map[status] ?? 'bg-gray-700 text-gray-300 border-gray-600'}`}>
      {status}
    </span>
  )
}

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

/* ── Customer Ledger ── */
function CustomerLedger() {
  const [customers, setCustomers] = useState<CustomerSummary[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<CustomerLedgerDetail | null>(null)
  const [loadingList, setLoadingList] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [editOrder, setEditOrder] = useState<CustomerOrderRow | null>(null)
  const [editStatus, setEditStatus] = useState('')
  const [editBags, setEditBags] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [deleteOrderId, setDeleteOrderId] = useState<number | null>(null)
  const { add: toast } = useToast()

  useEffect(() => {
    api.getLedgerCustomers().then(rows => { setCustomers(rows); setLoadingList(false) })
  }, [])

  const filtered = useMemo(() =>
    customers.filter(c =>
      c.customer_name.toLowerCase().includes(search.toLowerCase()) ||
      c.contact_number.includes(search)
    ), [customers, search])

  const openDetail = async (id: number) => {
    setLoadingDetail(true)
    const detail = await api.getLedgerCustomer(id)
    setSelected(detail)
    setLoadingDetail(false)
  }

  const reloadDetail = async () => {
    if (!selected) return
    const detail = await api.getLedgerCustomer(selected.customer.id)
    setSelected(detail)
  }

  const openEdit = (o: CustomerOrderRow) => {
    setEditOrder(o)
    setEditStatus(o.status)
    setEditBags(String(o.bags_dispatched))
  }

  const handleEditSave = async () => {
    if (!editOrder) return
    setEditSaving(true)
    try {
      await api.updateLedgerOrder(editOrder.id, {
        status: editStatus,
        bags_dispatched: Number(editBags),
      })
      toast('Order updated', 'ok')
      setEditOrder(null)
      await reloadDetail()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Update failed', 'err')
    }
    setEditSaving(false)
  }

  const handleDelete = async () => {
    if (deleteOrderId == null) return
    try {
      await api.deleteLedgerOrder(deleteOrderId)
      toast(`Order DIS-${deleteOrderId} deleted`, 'ok')
      setDeleteOrderId(null)
      await reloadDetail()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Delete failed', 'err')
    }
  }

  if (selected) {
    const { customer, orders, totals } = selected
    return (
      <div>
        <button onClick={() => setSelected(null)}
          className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 mb-4 transition-colors">
          <Ic.Left /> All Customers
        </button>
        <div className="mb-5">
          <div className="flex items-center gap-3 mb-1">
            <span className="w-9 h-9 rounded-full bg-blue-900/40 border border-blue-700/60 flex items-center justify-center text-blue-300 font-bold text-sm">
              {customer.customer_name[0].toUpperCase()}
            </span>
            <div>
              <h2 className="text-base font-bold text-white">{customer.customer_name}</h2>
              <p className="text-xs text-gray-400">{customer.contact_number || 'No contact'}</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {[
            { label: 'Total Orders', value: totals.total_orders, color: 'text-white' },
            { label: 'Bags Dispatched', value: totals.total_bags, color: 'text-white' },
            { label: 'Picked', value: totals.picked_bags, color: 'text-emerald-400' },
            { label: 'Pending', value: totals.pending_bags, color: 'text-amber-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-center">
              <p className={`text-xl font-bold ${color}`}>{value.toLocaleString()}</p>
              <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">All Orders ({orders.length})</p>
          </div>
          {orders.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-gray-500">No orders yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-800/60 border-b border-gray-800">
                    {['ORDER ID', 'DATE', 'ITEM', 'BATCH', 'PACK', 'BAGS', 'WAREHOUSE', 'STATUS', 'ACTIONS'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {orders.map(o => (
                    <tr key={o.id} className="hover:bg-gray-800/40 transition-colors">
                      <td className="px-4 py-3 text-xs font-mono text-gray-400">DIS-{o.id}</td>
                      <td className="px-4 py-3 text-xs text-gray-300 whitespace-nowrap">{new Date(o.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {o.item_image
                            ? <img src={o.item_image} className="w-7 h-7 rounded object-cover border border-gray-700 flex-shrink-0" />
                            : <div className="w-7 h-7 rounded bg-gray-700 flex-shrink-0" />}
                          <span className="text-sm text-white font-medium">{o.color_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-gray-300">{o.batch_number}</td>
                      <td className="px-4 py-3 text-xs text-gray-300">{o.packing_size}</td>
                      <td className="px-4 py-3 text-sm font-bold text-white">{o.bags_dispatched}</td>
                      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{o.warehouse_name} · {o.location_city}</td>
                      <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEdit(o)} title="Edit order"
                            className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-blue-900/20 rounded transition-colors">
                            <Ic.Pencil />
                          </button>
                          <button onClick={() => setDeleteOrderId(o.id)} title="Delete order"
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
          )}
        </div>

        {/* Edit order modal */}
        {editOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
            <div className="bg-gray-900 border border-blue-800/50 rounded-xl p-6 max-w-sm w-full shadow-2xl">
              <p className="text-sm font-semibold text-white mb-1">Edit Order <span className="font-mono text-blue-400">DIS-{editOrder.id}</span></p>
              <p className="text-xs text-gray-400 mb-4">{editOrder.color_name} · {editOrder.batch_number} · {editOrder.packing_size}</p>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">Bags Dispatched</label>
                  <input
                    type="number" min="1" value={editBags}
                    onChange={e => setEditBags(e.target.value)}
                    className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">Status</label>
                  <div className="flex gap-2">
                    {(['Pending', 'Picked', 'Cancelled'] as const).map(s => (
                      <button key={s} type="button" onClick={() => setEditStatus(s)}
                        className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                          editStatus === s
                            ? s === 'Pending'   ? 'bg-amber-900/40 border-amber-600 text-amber-300'
                            : s === 'Picked'    ? 'bg-emerald-900/40 border-emerald-600 text-emerald-300'
                            :                    'bg-red-900/40 border-red-600 text-red-300'
                            : 'bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-500'
                        }`}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-2 mt-5">
                <button onClick={() => setEditOrder(null)}
                  className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm font-medium transition-colors">
                  Cancel
                </button>
                <button onClick={handleEditSave} disabled={editSaving || !editBags || Number(editBags) < 1}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors">
                  {editSaving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete confirmation */}
        {deleteOrderId !== null && (
          <ConfirmDialog
            message={`Delete order DIS-${deleteOrderId}? Stock will be restored to inventory if the order was active.`}
            danger
            onConfirm={handleDelete}
            onCancel={() => setDeleteOrderId(null)}
          />
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="relative mb-4">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"><Ic.Search /></span>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search customers…"
          className="w-full pl-9 pr-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
      </div>
      {loadingList && <p className="text-center text-gray-500 py-10 text-sm">Loading…</p>}
      {!loadingList && filtered.length === 0 && <p className="text-center text-gray-500 py-10 text-sm">No customers found</p>}
      <div className="space-y-2">
        {filtered.map(c => (
          <button key={c.id} onClick={() => openDetail(c.id)} disabled={loadingDetail}
            className="w-full flex items-center gap-3 px-4 py-3 bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-xl text-left transition-colors disabled:opacity-60">
            <span className="w-9 h-9 rounded-full bg-blue-900/30 border border-blue-800/60 flex items-center justify-center text-blue-300 font-bold text-sm flex-shrink-0">
              {c.customer_name[0].toUpperCase()}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{c.customer_name}</p>
              <p className="text-xs text-gray-400">{c.contact_number || 'No contact'}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-sm font-bold text-white">{c.total_bags.toLocaleString()} <span className="text-xs font-normal text-gray-500">bags</span></p>
              <p className="text-xs text-gray-500">{c.total_orders} orders</p>
            </div>
            <Ic.ChevronRight />
          </button>
        ))}
      </div>
    </div>
  )
}

/* ── Supplier Ledger ── */
function SupplierLedger() {
  const [suppliers, setSuppliers] = useState<SupplierSummary[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<SupplierLedgerDetail | null>(null)
  const [loadingList, setLoadingList] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)

  useEffect(() => {
    api.getLedgerSuppliers().then(rows => { setSuppliers(rows); setLoadingList(false) })
  }, [])

  const filtered = useMemo(() =>
    suppliers.filter(s =>
      s.supplier_name.toLowerCase().includes(search.toLowerCase()) ||
      s.contact_number.includes(search)
    ), [suppliers, search])

  const openDetail = async (id: number) => {
    setLoadingDetail(true)
    const detail = await api.getLedgerSupplier(id)
    setSelected(detail)
    setLoadingDetail(false)
  }

  if (selected) {
    const { supplier, batches, totals } = selected
    return (
      <div>
        <button onClick={() => setSelected(null)}
          className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 mb-4 transition-colors">
          <Ic.Left /> All Suppliers
        </button>
        <div className="mb-5">
          <div className="flex items-center gap-3 mb-1">
            <span className="w-9 h-9 rounded-full bg-purple-900/40 border border-purple-700/60 flex items-center justify-center text-purple-300 font-bold text-sm">
              {supplier.supplier_name[0].toUpperCase()}
            </span>
            <div>
              <h2 className="text-base font-bold text-white">{supplier.supplier_name}</h2>
              <p className="text-xs text-gray-400">{[supplier.contact_number, supplier.address].filter(Boolean).join(' · ') || 'No details'}</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-5">
          {[
            { label: 'Batches Supplied', value: totals.total_batches, color: 'text-white' },
            { label: 'Current Stock (bags)', value: totals.current_stock_bags.toLocaleString(), color: 'text-emerald-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-center">
              <p className={`text-xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Inward Batches ({batches.length})</p>
          </div>
          {batches.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-gray-500">No inward batches linked to this supplier yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-800/60 border-b border-gray-800">
                    {['ITEM', 'BATCH', 'IMPORT DATE', 'PACK SIZES', 'WAREHOUSES', 'STOCK (bags)', 'STATUS'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {batches.map(b => (
                    <tr key={b.batch_id} className="hover:bg-gray-800/40 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {b.item_image
                            ? <img src={b.item_image} className="w-7 h-7 rounded object-cover border border-gray-700 flex-shrink-0" />
                            : <div className="w-7 h-7 rounded bg-gray-700 flex-shrink-0" />}
                          <span className="text-sm text-white font-medium">{b.color_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-gray-300">{b.batch_number}</td>
                      <td className="px-4 py-3 text-xs text-gray-300 whitespace-nowrap">{b.import_date}</td>
                      <td className="px-4 py-3 text-xs text-gray-400">{b.pack_sizes ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-400">{b.warehouses ?? '—'}</td>
                      <td className="px-4 py-3 text-sm font-bold text-white">{b.current_stock.toLocaleString()}</td>
                      <td className="px-4 py-3"><StatusBadge status={b.batch_status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="relative mb-4">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"><Ic.Search /></span>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search suppliers…"
          className="w-full pl-9 pr-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
      </div>
      {loadingList && <p className="text-center text-gray-500 py-10 text-sm">Loading…</p>}
      {!loadingList && filtered.length === 0 && <p className="text-center text-gray-500 py-10 text-sm">No suppliers found</p>}
      <div className="space-y-2">
        {filtered.map(s => (
          <button key={s.id} onClick={() => openDetail(s.id)} disabled={loadingDetail}
            className="w-full flex items-center gap-3 px-4 py-3 bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-xl text-left transition-colors disabled:opacity-60">
            <span className="w-9 h-9 rounded-full bg-purple-900/30 border border-purple-800/60 flex items-center justify-center text-purple-300 font-bold text-sm flex-shrink-0">
              {s.supplier_name[0].toUpperCase()}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{s.supplier_name}</p>
              <p className="text-xs text-gray-400 truncate">{[s.contact_number, s.address].filter(Boolean).join(' · ') || 'No details'}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-sm font-bold text-white">{s.current_stock_bags.toLocaleString()} <span className="text-xs font-normal text-gray-500">bags</span></p>
              <p className="text-xs text-gray-500">{s.total_batches} batches</p>
            </div>
            <Ic.ChevronRight />
          </button>
        ))}
      </div>
    </div>
  )
}

/* ── Admin Page ── */
const ROLE_LABELS: Record<string, string> = { manager: 'Manager', helper: 'Helper' }
const ROLE_COLORS: Record<string, string> = {
  manager: 'bg-blue-900/40 text-blue-300 border-blue-700/60',
  helper:  'bg-amber-900/40 text-amber-300 border-amber-700/60',
}

const EMPTY_USER_FORM = {
  id: null as number | null,
  username: '',
  password: '',
  role: 'helper' as 'manager' | 'helper',
  can_view: true,
  can_edit: false,
  can_delete: false,
  is_active: true,
}

type AdminTab = 'users' | 'customers' | 'suppliers' | 'backup'

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
        <p className="text-sm text-gray-400 mt-0.5">Manage users, roles, and view ledger reports</p>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {([
          { key: 'users',     label: 'Users',           icon: <Ic.Shield /> },
          { key: 'customers', label: 'Customer Ledger', icon: <Ic.User />   },
          { key: 'suppliers', label: 'Supplier Ledger', icon: <Ic.Truck />  },
          { key: 'backup',    label: 'Backup',          icon: <Ic.Download /> },
        ] as { key: AdminTab; label: string; icon: React.ReactNode }[]).map(t => (
          <button key={t.key} onClick={() => setAdminTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${adminTab === t.key ? 'bg-rose-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {adminTab === 'customers' && <CustomerLedger />}
      {adminTab === 'suppliers' && <SupplierLedger />}
      {adminTab === 'backup'    && <BackupPanel />}

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
                {(['manager', 'helper'] as const).map(r => (
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
                {['USERNAME', 'ROLE', 'RIGHTS', 'STATUS', 'CREATED'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 tracking-wider whitespace-nowrap">{h}</th>
                ))}
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-400 tracking-wider">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {loading && <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-500 text-sm">Loading…</td></tr>}
              {!loading && users.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-500 text-sm">No users yet.</td></tr>}
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
            { role: 'Manager', color: ROLE_COLORS.manager, desc: 'Full operational access — can be granted any combination of View, Edit, and Delete rights.' },
            { role: 'Helper',  color: ROLE_COLORS.helper,  desc: 'Support role — typically assigned View-only access; edit/delete rights can be enabled if needed.' },
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
