import { useState, useEffect } from 'react'
import * as api from '../api'
import type { Customer, Warehouse } from '../api'
import Ic from '../icons'
import { whColor } from '../utils'
import { useToast } from '../hooks/useToast'
import ConfirmDialog from '../components/ConfirmDialog'

type MasterTab = 'items' | 'customers' | 'suppliers' | 'warehouses'

interface Props {
  canEdit: boolean
  canDelete: boolean
}

function MasterSection<T extends { id: number }>({
  title, icon, items, columns, renderRow, form, setForm, emptyForm, onSave, onDelete, renderForm, canEdit, canDelete,
}: {
  title: string
  icon: React.ReactNode
  items: T[]
  columns: string[]
  renderRow: (item: T) => React.ReactNode[]
  form: (Partial<T> & { id: number | null }) | null
  setForm: (f: (Partial<T> & { id: number | null }) | null) => void
  emptyForm: Omit<T, 'id'>
  onSave: (f: Partial<T> & { id: number | null }) => Promise<void>
  onDelete: (id: number) => Promise<void>
  renderForm: (f: Partial<T> & { id: number | null }, set: (f: Partial<T> & { id: number | null }) => void) => React.ReactNode
  canEdit: boolean
  canDelete: boolean
}) {
  const [saving, setSaving] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [deletingItem, setDeletingItem] = useState<T | null>(null)

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form) return
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  const del = async (id: number) => {
    await onDelete(id)
    setConfirmDeleteId(null)
    setDeletingItem(null)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-blue-400">{icon}</span>
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">{items.length}</span>
        </div>
        {canEdit && (
          form === null
            ? <button onClick={() => setForm({ id: null, ...emptyForm } as Partial<T> & { id: number | null })}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition-colors">
                <Ic.Plus /> Add New
              </button>
            : <button onClick={() => setForm(null)} className="text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded-lg bg-gray-800 transition-colors">Cancel</button>
        )}
      </div>

      {canEdit && form !== null && (
        <form onSubmit={save} className="mb-5 bg-gray-900 border border-blue-800/40 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-blue-300 uppercase tracking-wide">{form.id ? 'Edit Record' : 'New Record'}</p>
          {renderForm(form, setForm as (f: Partial<T> & { id: number | null }) => void)}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setForm(null)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs font-medium transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors">
              {saving ? 'Saving…' : form.id ? 'Save Changes' : 'Create'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-800/60 border-b border-gray-800">
              {columns.map(c => <th key={c} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 tracking-wider">{c}</th>)}
              {(canEdit || canDelete) && <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-400 tracking-wider">ACTIONS</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {items.length === 0 && (
              <tr><td colSpan={columns.length + 1} className="px-4 py-10 text-center text-gray-500 text-sm">No records yet</td></tr>
            )}
            {items.map(item => (
              <tr key={item.id} className="hover:bg-gray-800/40 transition-colors">
                {renderRow(item).map((cell, i) => (
                  <td key={i} className="px-4 py-3 text-sm text-gray-200">{cell}</td>
                ))}
                {(canEdit || canDelete) && (
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {canEdit && (
                        <button onClick={() => setForm({ ...item, id: item.id } as Partial<T> & { id: number | null })}
                          className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-blue-900/20 rounded transition-colors">
                          <Ic.Pencil />
                        </button>
                      )}
                      {canDelete && (
                        <button onClick={() => { setConfirmDeleteId(item.id); setDeletingItem(item) }}
                          className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors">
                          <Ic.Trash />
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {confirmDeleteId !== null && (
        <ConfirmDialog
          message={`Delete this ${title.slice(0, -1).toLowerCase()}? This cannot be undone.`}
          onConfirm={() => del(confirmDeleteId)}
          onCancel={() => { setConfirmDeleteId(null); setDeletingItem(null) }}
        />
      )}
      {/* suppress unused warning */}
      {deletingItem && null}
    </div>
  )
}

export default function MasterPage({ canEdit, canDelete }: Props) {
  const [tab, setTab] = useState<MasterTab>('items')
  const { toasts, add: toast } = useToast()

  const [items, setItems] = useState<api.Item[]>([])
  const [itemForm, setItemForm] = useState<(Partial<api.Item> & { id: number | null }) | null>(null)

  const [customers, setCustomers] = useState<Customer[]>([])
  const [custForm, setCustForm] = useState<(Partial<Customer> & { id: number | null }) | null>(null)

  const [suppliers, setSuppliers] = useState<api.Supplier[]>([])
  const [supForm, setSupForm] = useState<(Partial<api.Supplier> & { id: number | null }) | null>(null)

  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [whForm, setWhForm] = useState<(Partial<Warehouse> & { id: number | null }) | null>(null)

  useEffect(() => { api.getItems().then(setItems) }, [tab])
  useEffect(() => { if (tab === 'customers') api.getMasterCustomers().then(setCustomers) }, [tab])
  useEffect(() => { if (tab === 'suppliers') api.getSuppliers().then(setSuppliers) }, [tab])
  useEffect(() => { if (tab === 'warehouses') api.getWarehouses().then(setWarehouses) }, [tab])

  const tabs: { key: MasterTab; label: string }[] = [
    { key: 'items',      label: 'Items Master' },
    { key: 'customers',  label: 'Customer Master' },
    { key: 'suppliers',  label: 'Supplier Master' },
    { key: 'warehouses', label: 'Warehouse Master' },
  ]

  return (
    <main className="max-w-5xl mx-auto px-4 py-6 w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white tracking-tight">Master Data</h1>
        <p className="text-sm text-gray-400 mt-0.5">Manage reference data used across the system</p>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.key ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'items' && (
        <MasterSection<api.Item>
          title="Items" icon={<Ic.Hash />} items={items}
          columns={['ITEMS NAME']}
          emptyForm={{ color_name: '', hsn_code: '7018.90.00', item_image: null, batch_numbers: '' }}
          form={itemForm} setForm={setItemForm}
          canEdit={canEdit} canDelete={canDelete}
          renderRow={item => [
            <span className="font-medium">{item.color_name}</span>,
          ]}
          renderForm={(f, set) => (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Items Name <span className="text-red-400">*</span></label>
              <input autoFocus value={f.color_name ?? ''} onChange={e => set({ ...f, color_name: e.target.value })} required placeholder="e.g., Coral Pink"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
            </div>
          )}
          onSave={async f => {
            try {
              if (f.id) await api.updateItem(f.id, { color_name: f.color_name!, hsn_code: f.hsn_code ?? '7018.90.00', item_image: f.item_image ?? null })
              else await api.createItem({ color_name: f.color_name!, hsn_code: '7018.90.00', item_image: null })
              toast(f.id ? 'Item updated' : 'Item created')
              setItemForm(null)
              api.getItems().then(setItems)
            } catch (err) { toast(err instanceof Error ? err.message : 'Error', 'err') }
          }}
          onDelete={async id => {
            try {
              await api.deleteItem(id)
              toast('Item deleted')
              api.getItems().then(setItems)
            } catch (err) { toast(err instanceof Error ? err.message : 'Error', 'err') }
          }}
        />
      )}

      {tab === 'customers' && (
        <MasterSection<Customer>
          title="Customers" icon={<Ic.User />} items={customers}
          columns={['CUSTOMER NAME', 'CONTACT']}
          emptyForm={{ customer_name: '', contact_number: '' }}
          form={custForm} setForm={setCustForm}
          canEdit={canEdit} canDelete={canDelete}
          renderRow={c => [
            <span className="font-medium">{c.customer_name}</span>,
            <span className="text-gray-400">{c.contact_number || '—'}</span>,
          ]}
          renderForm={(f, set) => (
            <>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Customer Name <span className="text-red-400">*</span></label>
                <input autoFocus value={f.customer_name ?? ''} onChange={e => set({ ...f, customer_name: e.target.value })} required placeholder="e.g., Textile Mills Pvt Ltd"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Contact Number</label>
                <input value={f.contact_number ?? ''} onChange={e => set({ ...f, contact_number: e.target.value })} placeholder="+91-XXXXXXXXXX"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
              </div>
            </>
          )}
          onSave={async f => {
            try {
              if (f.id) await api.updateCustomer(f.id, { customer_name: f.customer_name!, contact_number: f.contact_number ?? '' })
              else await api.createCustomer(f.customer_name!, f.contact_number ?? '')
              toast(f.id ? 'Customer updated' : 'Customer created')
              setCustForm(null)
              api.getMasterCustomers().then(setCustomers)
            } catch (err) { toast(err instanceof Error ? err.message : 'Error', 'err') }
          }}
          onDelete={async id => {
            try {
              await api.deleteCustomer(id)
              toast('Customer deleted')
              api.getMasterCustomers().then(setCustomers)
            } catch (err) { toast(err instanceof Error ? err.message : 'Error', 'err') }
          }}
        />
      )}

      {tab === 'suppliers' && (
        <MasterSection<api.Supplier>
          title="Suppliers" icon={<Ic.Truck />} items={suppliers}
          columns={['SUPPLIER NAME', 'CONTACT', 'ADDRESS']}
          emptyForm={{ supplier_name: '', contact_number: '', address: '', created_at: '' }}
          form={supForm} setForm={setSupForm}
          canEdit={canEdit} canDelete={canDelete}
          renderRow={s => [
            <span className="font-medium">{s.supplier_name}</span>,
            <span className="text-gray-400">{s.contact_number || '—'}</span>,
            <span className="text-gray-400">{s.address || '—'}</span>,
          ]}
          renderForm={(f, set) => (
            <>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Supplier Name <span className="text-red-400">*</span></label>
                <input autoFocus value={f.supplier_name ?? ''} onChange={e => set({ ...f, supplier_name: e.target.value })} required placeholder="e.g., Glass Beads Exports Ltd"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Contact Number</label>
                  <input value={f.contact_number ?? ''} onChange={e => set({ ...f, contact_number: e.target.value })} placeholder="+91-XXXXXXXXXX"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Address</label>
                  <input value={f.address ?? ''} onChange={e => set({ ...f, address: e.target.value })} placeholder="City, State"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
                </div>
              </div>
            </>
          )}
          onSave={async f => {
            try {
              if (f.id) await api.updateSupplier(f.id, { supplier_name: f.supplier_name!, contact_number: f.contact_number ?? '', address: f.address ?? '' })
              else await api.createSupplier({ supplier_name: f.supplier_name!, contact_number: f.contact_number ?? '', address: f.address ?? '' })
              toast(f.id ? 'Supplier updated' : 'Supplier created')
              setSupForm(null)
              api.getSuppliers().then(setSuppliers)
            } catch (err) { toast(err instanceof Error ? err.message : 'Error', 'err') }
          }}
          onDelete={async id => {
            try {
              await api.deleteSupplier(id)
              toast('Supplier deleted')
              api.getSuppliers().then(setSuppliers)
            } catch (err) { toast(err instanceof Error ? err.message : 'Error', 'err') }
          }}
        />
      )}

      {tab === 'warehouses' && (
        <MasterSection<Warehouse>
          title="Warehouses" icon={<Ic.Building />} items={warehouses}
          columns={['WAREHOUSE NAME', 'CITY', 'STATUS']}
          emptyForm={{ warehouse_name: '', location_city: '', is_active: 1 }}
          form={whForm} setForm={setWhForm}
          canEdit={canEdit} canDelete={canDelete}
          renderRow={w => [
            <span className={`font-semibold px-2 py-0.5 rounded border text-xs ${whColor(w.id)}`}>{w.warehouse_name}</span>,
            <span className="text-gray-400">{w.location_city || '—'}</span>,
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${w.is_active ? 'bg-emerald-900/30 text-emerald-400 border-emerald-800/60' : 'bg-gray-700 text-gray-400 border-gray-600'}`}>
              {w.is_active ? 'Active' : 'Inactive'}
            </span>,
          ]}
          renderForm={(f, set) => (
            <>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Warehouse Name <span className="text-red-400">*</span></label>
                <input autoFocus value={f.warehouse_name ?? ''} onChange={e => set({ ...f, warehouse_name: e.target.value })} required placeholder="e.g., Delta"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">City</label>
                <input value={f.location_city ?? ''} onChange={e => set({ ...f, location_city: e.target.value })} placeholder="e.g., Nagpur"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={!!f.is_active} onChange={e => set({ ...f, is_active: e.target.checked ? 1 : 0 })}
                  className="w-4 h-4 rounded accent-blue-500" />
                <span className="text-xs text-gray-300">Active</span>
              </label>
            </>
          )}
          onSave={async f => {
            try {
              if (f.id) await api.updateWarehouse(f.id, { warehouse_name: f.warehouse_name!, location_city: f.location_city ?? '', is_active: f.is_active ?? 1 })
              else await api.createWarehouse({ warehouse_name: f.warehouse_name!, location_city: f.location_city ?? '', is_active: f.is_active ?? 1 })
              toast(f.id ? 'Warehouse updated' : 'Warehouse created')
              setWhForm(null)
              api.getWarehouses().then(setWarehouses)
            } catch (err) { toast(err instanceof Error ? err.message : 'Error', 'err') }
          }}
          onDelete={async id => {
            try {
              await api.deleteWarehouse(id)
              toast('Warehouse deleted')
              api.getWarehouses().then(setWarehouses)
            } catch (err) { toast(err instanceof Error ? err.message : 'Error', 'err') }
          }}
        />
      )}

      <div className="fixed bottom-5 right-5 flex flex-col gap-2 z-50 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm border shadow-xl ${t.type === 'ok' ? 'bg-emerald-900/80 text-emerald-300 border-emerald-700' : 'bg-red-900/80 text-red-300 border-red-700'}`}>
            {t.type === 'ok' ? <Ic.Check /> : <Ic.Warning />} {t.msg}
          </div>
        ))}
      </div>
    </main>
  )
}
