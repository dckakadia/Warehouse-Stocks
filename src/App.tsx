import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import './App.css'
import * as api from './api'
import type {
  Customer, DispatchOrder, BatchRow, RecommendedBatch, ColorRow,
  Warehouse, StockSummary, AppUser,
  CustomerSummary, CustomerLedgerDetail,
  SupplierSummary, SupplierLedgerDetail,
} from './api'

/* ── Warehouse chip colors (rotates by warehouse id) ── */
const W_COLORS = [
  'bg-blue-800/40 text-blue-300 border-blue-700/60',
  'bg-purple-800/40 text-purple-300 border-purple-700/60',
  'bg-teal-800/40 text-teal-300 border-teal-700/60',
  'bg-amber-800/40 text-amber-300 border-amber-700/60',
]
const whColor = (wid: number) => W_COLORS[(wid - 1) % W_COLORS.length]

/* ── Icons ── */
const Ic = {
  Cube: () => (
    <svg className="w-8 h-8" viewBox="0 0 32 32" fill="none">
      <rect x="2" y="2" width="28" height="28" rx="6" fill="#3b82f6" opacity="0.15"/>
      <path d="M16 4L28 10V22L16 28L4 22V10L16 4Z" stroke="#3b82f6" strokeWidth="2"/>
      <path d="M16 4L28 10M16 4L4 10M16 28V16M28 10L16 16M4 10L16 16" stroke="#3b82f6" strokeWidth="1.5" opacity="0.6"/>
    </svg>
  ),
  Monitor:      () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>,
  Clipboard:    () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>,
  Search:       () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>,
  User:         () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  Truck:        () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M1 3h15v13H1zM16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>,
  Pin:          () => <svg className="w-3.5 h-3.5 inline mr-1 opacity-50" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>,
  Hash:         () => <svg className="w-3 h-3 inline mr-1 opacity-50" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>,
  X:            () => <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>,
  Plus:         () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>,
  Refresh:      () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>,
  Check:        () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>,
  Warning:      () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  Star:         () => <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>,
  Left:         () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>,
  Database:     () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>,
  Pencil:       () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  Trash:        () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>,
  Building:     () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h1M14 9h1M9 14h1M14 14h1M9 19h6"/></svg>,
  ChevronDown:  () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>,
  ChevronRight: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>,
  Transfer:     () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/></svg>,
  Camera:       () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>,
  Image:        () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>,
  Minus:        () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M5 12h14"/></svg>,
  Shield:       () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  Key:          () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="7.5" cy="15.5" r="5.5"/><path d="M21 2l-9.6 9.6M15.5 7.5l3 3"/></svg>,
  Eye:          () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
}

/* ── helpers ── */
function todayISO() {
  return new Date().toISOString().split('T')[0]
}

function parseKgPerBag(ps: string): number {
  const m = ps.match(/^(\d+(?:\.\d+)?)\s*kg/i)
  return m ? parseFloat(m[1]) : 0
}

async function compressImage(file: File): Promise<string> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const MAX = 600
      const scale = Math.min(MAX / img.width, MAX / img.height, 1)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.78))
    }
    img.src = url
  })
}

/* ── WebSocket live-sync hook ── */
function useWSSync(onRefresh: () => void) {
  const cbRef = useRef(onRefresh)
  cbRef.current = onRefresh
  useEffect(() => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    let ws: WebSocket
    let retry: ReturnType<typeof setTimeout>
    const connect = () => {
      ws = new WebSocket(`${proto}://${location.host}/ws`)
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data)
        if (msg.event === 'data_changed') cbRef.current()
      }
      ws.onclose = () => { retry = setTimeout(connect, 3000) }
    }
    connect()
    return () => { ws?.close(); clearTimeout(retry) }
  }, [])
}

/* ── Toast ── */
interface Toast { id: number; msg: string; type: 'ok' | 'err' }
function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const add = useCallback((msg: string, type: Toast['type'] = 'ok') => {
    const id = Date.now()
    setToasts(p => [...p, { id, msg, type }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500)
  }, [])
  return { toasts, add }
}

/* ══════════════════════════════════════════════
   ADD CUSTOMER MODAL
══════════════════════════════════════════════ */
function AddCustomerModal({ onClose, onAdd }: { onClose: () => void; onAdd: (name: string, contact: string) => Promise<void> }) {
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    await onAdd(name.trim(), contact.trim())
    setLoading(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-white">Add New Customer</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><Ic.X /></button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">Customer Name <span className="text-red-400">*</span></label>
            <input autoFocus type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Enter customer name"
              className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">Contact Number</label>
            <input type="text" value={contact} onChange={e => setContact(e.target.value)} placeholder="+91-XXXXXXXXXX"
              className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors" />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm font-medium transition-colors">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
              {loading ? 'Adding…' : 'Add Customer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════
   LIGHTBOX
══════════════════════════════════════════════ */
function Lightbox({ src, title, onClose }: { src: string; title: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors z-10"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <Ic.X />
      </button>

      <img
        src={src}
        alt={title}
        className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
        onClick={e => e.stopPropagation()}
      />
      {title && (
        <p className="mt-4 text-sm font-medium text-gray-300 px-6 text-center">{title}</p>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════
   CREATE DISPATCH MODAL — 3 step
══════════════════════════════════════════════ */
function CreateDispatchModal({
  customers, colors, onClose, onCreated,
}: {
  customers: Customer[]
  colors: ColorRow[]
  onClose: () => void
  onCreated: () => void
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [custSearch, setCustSearch] = useState('')
  const [selCustomer, setSelCustomer] = useState<Customer | null>(null)
  const [selColor, setSelColor] = useState<ColorRow | null>(null)
  const [batches, setBatches] = useState<BatchRow[]>([])
  const [recommended, setRecommended] = useState<RecommendedBatch | null>(null)
  const [selPackSize, setSelPackSize] = useState<string>('')
  const [selInvId, setSelInvId] = useState<number | null>(null)
  const [bags, setBags] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const filteredCustomers = useMemo(() =>
    customers.filter(c => c.customer_name.toLowerCase().includes(custSearch.toLowerCase()) || c.contact_number.includes(custSearch)),
    [customers, custSearch])

  const selectCustomer = (c: Customer) => { setSelCustomer(c); setStep(2) }

  const selectColor = async (col: ColorRow) => {
    setSelColor(col)
    setLoading(true)
    const [bRows, rec] = await Promise.all([
      api.getBatches(col.color_name),
      selCustomer ? api.getRecommendedBatch(selCustomer.id, col.color_name) : Promise.resolve({ recommended: null }),
    ])
    setBatches(bRows)
    setRecommended(rec.recommended)
    const sizes = [...new Set(bRows.map(b => b.packing_size))]
    setSelPackSize(sizes[0] ?? '')
    setSelInvId(null)
    setBags('')
    setError('')
    setLoading(false)
    setStep(3)
  }

  const filteredBatches = useMemo(() =>
    batches.filter(b => b.packing_size === selPackSize),
    [batches, selPackSize])

  const selBatch = useMemo(() => batches.find(b => b.inv_id === selInvId), [batches, selInvId])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selCustomer || !selInvId || !bags) return
    const n = parseInt(bags)
    if (!n || n <= 0) { setError('Enter a valid quantity'); return }
    if (selBatch && n > selBatch.quantity_in_stock) { setError(`Max ${selBatch.quantity_in_stock} bags available`); return }
    setLoading(true)
    setError('')
    try {
      await api.createDispatchOrder({
        customer_id: selCustomer.id,
        batch_id: selBatch!.id,
        warehouse_id: selBatch!.warehouse_id,
        packing_size: selPackSize,
        bags_dispatched: n,
      })
      onCreated()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed')
    }
    setLoading(false)
  }

  const progress = step === 1 ? 'w-1/3' : step === 2 ? 'w-2/3' : 'w-full'

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md shadow-2xl max-h-[90vh] flex flex-col">
        <div className="p-5 pb-4 flex-shrink-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-white">Create Dispatch Order</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-white"><Ic.X /></button>
          </div>
          <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
            <div className={`h-full bg-blue-500 rounded-full transition-all duration-300 ${progress}`} />
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-5 pb-5">
          {/* Step 1 */}
          {step === 1 && (
            <>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Select Customer</p>
              <div className="relative mb-3">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"><Ic.Search /></span>
                <input autoFocus type="text" value={custSearch} onChange={e => setCustSearch(e.target.value)} placeholder="Search customers…"
                  className="w-full pl-9 pr-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
              </div>
              <div className="space-y-1.5">
                {customers.length === 0 ? (
                  <p className="text-sm text-gray-500 italic text-center py-6">No customers yet. Add one first.</p>
                ) : filteredCustomers.length === 0 ? (
                  <p className="text-sm text-gray-500 italic text-center py-6">No customers match your search.</p>
                ) : filteredCustomers.map(c => (
                  <button key={c.id} onClick={() => selectCustomer(c)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg text-left transition-colors">
                    <div>
                      <p className="text-sm font-medium text-white">{c.customer_name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{c.contact_number}</p>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Select Color / Item</p>
              <div className="space-y-1.5">
                {colors.length === 0 ? (
                  <p className="text-sm text-gray-500 italic text-center py-6">No items with available stock. Please inward stock first.</p>
                ) : colors.map(col => (
                  <button key={col.id} onClick={() => selectColor(col)}
                    className="w-full flex items-center gap-3 px-3 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg text-left transition-colors">
                    {col.item_image ? (
                      <img src={col.item_image} alt={col.color_name} className="w-11 h-11 object-cover rounded-lg border border-gray-700 flex-shrink-0" />
                    ) : (
                      <div className="w-11 h-11 rounded-lg bg-gray-700 flex items-center justify-center flex-shrink-0 text-gray-500">
                        <Ic.Image />
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium text-white">{col.color_name}</p>
                      <p className="text-xs text-gray-500">HSN: {col.hsn_code}</p>
                    </div>
                  </button>
                ))}
              </div>
              <button onClick={() => setStep(1)} className="mt-4 flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300">
                <Ic.Left /> Back to customer selection
              </button>
            </>
          )}

          {/* Step 3 */}
          {step === 3 && (
            <form onSubmit={submit} className="space-y-4">
              <div className="bg-gray-800/60 rounded-lg p-3 text-xs space-y-1 border border-gray-700">
                <div className="flex gap-2"><span className="text-gray-500">Customer:</span><span className="text-white font-medium">{selCustomer?.customer_name}</span></div>
                <div className="flex gap-2"><span className="text-gray-500">Color:</span><span className="text-white font-medium">{selColor?.color_name}</span></div>
              </div>

              {recommended && (
                <div className="flex items-start gap-2 bg-amber-900/20 border border-amber-700/40 rounded-lg p-3">
                  <Ic.Star />
                  <div className="text-xs">
                    <p className="text-amber-300 font-semibold">Recommended Batch</p>
                    <p className="text-amber-200/80 mt-0.5">Last purchase: <strong>{recommended.batch_number}</strong> — use same batch to ensure shade consistency</p>
                  </div>
                </div>
              )}

              {loading && <p className="text-sm text-gray-400 text-center py-4">Loading batches…</p>}

              {!loading && (
                <>
                  {[...new Set(batches.map(b => b.packing_size))].length > 0 && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Pack Size</label>
                      <div className="flex flex-wrap gap-2">
                        {[...new Set(batches.map(b => b.packing_size))].map(ps => (
                          <button key={ps} type="button" onClick={() => { setSelPackSize(ps); setSelInvId(null) }}
                            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${selPackSize === ps ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-300'}`}>
                            {ps}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                      Batch <span className="text-red-400">*</span>
                    </label>
                    {filteredBatches.length === 0
                      ? <p className="text-sm text-gray-500 italic">No stock available for {selPackSize}</p>
                      : (
                        <div className="space-y-1.5">
                          {filteredBatches.map(b => (
                            <button key={b.inv_id} type="button" onClick={() => setSelInvId(b.inv_id)}
                              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-left transition-colors ${selInvId === b.inv_id ? 'bg-blue-900/40 border-blue-500' : 'bg-gray-800 border-gray-700 hover:border-gray-600'}`}>
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-mono font-medium text-white">{b.batch_number}</span>
                                  <span className={`text-xs border px-1.5 py-0.5 rounded ${whColor(b.warehouse_id)}`}>
                                    {b.warehouse_name} · {b.location_city}
                                  </span>
                                  {recommended?.batch_number === b.batch_number && (
                                    <span className="text-xs bg-amber-700/40 text-amber-300 px-1.5 py-0.5 rounded font-medium">Recommended</span>
                                  )}
                                </div>
                              </div>
                              <span className="text-sm font-bold text-white ml-2 flex-shrink-0">{b.quantity_in_stock} bags</span>
                            </button>
                          ))}
                        </div>
                      )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                      Bags <span className="text-red-400">*</span>
                      {selBatch && <span className="ml-2 text-gray-500 normal-case font-normal">(max {selBatch.quantity_in_stock})</span>}
                    </label>
                    <input type="number" min="1" max={selBatch?.quantity_in_stock} value={bags} onChange={e => setBags(e.target.value)} placeholder="Enter quantity"
                      className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
                  </div>

                  {error && (
                    <div className="flex items-center gap-2 text-red-400 text-xs bg-red-900/20 border border-red-700/40 rounded-lg px-3 py-2">
                      <Ic.Warning /> {error}
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button type="button" onClick={() => setStep(2)} className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm font-medium transition-colors">Back</button>
                    <button type="submit" disabled={loading || !selInvId || !bags}
                      className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors">
                      {loading ? 'Creating…' : 'Create Order'}
                    </button>
                  </div>
                </>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════
   GLOBAL DASHBOARD — accordion by color
══════════════════════════════════════════════ */
function GlobalDashboard({ onAddCustomer, onCreateDispatch, refreshSig }: {
  onAddCustomer: () => void
  onCreateDispatch: () => void
  refreshSig: number
}) {
  const [summary, setSummary] = useState<StockSummary[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [search, setSearch] = useState('')
  const [filterWid, setFilterWid] = useState<number | 'all'>('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const [lightboxTitle, setLightboxTitle] = useState('')

  const load = useCallback(async () => {
    const [s, w] = await Promise.all([api.getStockSummary(), api.getWarehouses()])
    setSummary(s)
    setWarehouses(w)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load, refreshSig])

  const filtered = useMemo(() => {
    let data = filterWid === 'all'
      ? summary
      : summary
          .map(s => ({
            ...s,
            lines: s.lines.filter(l => l.warehouse_id === filterWid),
          }))
          .filter(s => s.lines.length > 0)
          .map(s => ({
            ...s,
            total_bags: s.lines.reduce((acc, l) => acc + l.quantity_in_stock, 0),
            total_weight_kg: s.lines.reduce((acc, l) => acc + l.quantity_in_stock * parseKgPerBag(l.packing_size), 0),
          }))
    if (search) {
      const q = search.toLowerCase()
      data = data.filter(s => s.color_name.toLowerCase().includes(q))
    }
    return data
  }, [summary, filterWid, search])

  const toggle = (colorName: string) =>
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(colorName) ? next.delete(colorName) : next.add(colorName)
      return next
    })

  const totalBags   = filtered.reduce((a, s) => a + s.total_bags, 0)
  const totalWeight = filtered.reduce((a, s) => a + s.total_weight_kg, 0)

  return (
    <>
    <main className="max-w-7xl mx-auto px-4 py-6 w-full">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-white tracking-tight">Global Stock Dashboard</h1>
        <p className="text-sm text-gray-400 mt-0.5">All warehouses · live inventory grouped by item</p>
      </div>

      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"><Ic.Search /></span>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by item name…"
            className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors" />
        </div>
        <div className="ml-auto flex gap-2 flex-wrap">
          <button onClick={onAddCustomer}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 rounded-lg text-sm font-medium transition-colors">
            <Ic.User /> Add Customer
          </button>
          <button onClick={onCreateDispatch}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors">
            <Ic.Truck /> Create Dispatch Order
          </button>
        </div>
      </div>

      {/* Warehouse filter chips */}
      <div className="flex flex-wrap gap-2 mb-5">
        <button onClick={() => setFilterWid('all')}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${filterWid === 'all' ? 'bg-gray-600 text-white border-gray-500' : 'bg-gray-800/60 text-gray-400 border-gray-700 hover:border-gray-500'}`}>
          All Warehouses
        </button>
        {warehouses.map(w => (
          <button key={w.id} onClick={() => setFilterWid(filterWid === w.id ? 'all' : w.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${filterWid === w.id ? whColor(w.id) : whColor(w.id) + ' opacity-60 hover:opacity-90'}`}>
            {w.warehouse_name} · {w.location_city}
          </button>
        ))}
      </div>

      {/* Summary stats */}
      {!loading && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: 'Item Types', value: filtered.length },
            { label: 'Total Bags', value: totalBags.toLocaleString() },
            { label: 'Total Weight', value: `${(totalWeight / 1000).toFixed(1)} MT` },
          ].map(({ label, value }) => (
            <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-center">
              <p className="text-2xl font-bold text-white">{value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {loading && <p className="text-center text-gray-500 py-16 text-sm">Loading…</p>}
      {!loading && filtered.length === 0 && <p className="text-center text-gray-500 py-16 text-sm">No stock found</p>}

      {/* Accordion list */}
      <div className="space-y-2">
        {filtered.map(item => {
          const isOpen = expanded.has(item.color_name)
          return (
            <div key={item.color_name} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <button
                onClick={() => toggle(item.color_name)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-800/50 transition-colors text-left"
              >
                <span className="text-gray-500 flex-shrink-0">
                  {isOpen ? <Ic.ChevronDown /> : <Ic.ChevronRight />}
                </span>
                {item.item_image ? (
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); setLightboxSrc(item.item_image!); setLightboxTitle(item.color_name) }}
                    className="flex-shrink-0 rounded-lg overflow-hidden focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <img src={item.item_image} alt={item.color_name}
                      className="w-11 h-11 object-cover rounded-lg border border-gray-700 hover:border-blue-500 transition-colors" />
                  </button>
                ) : (
                  <div className="w-11 h-11 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center flex-shrink-0 text-gray-600">
                    <Ic.Image />
                  </div>
                )}
                <span className="flex-1 text-sm font-semibold text-white">{item.color_name}</span>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <span className="text-lg font-bold text-white">{item.total_bags.toLocaleString()}</span>
                    <span className="text-xs text-gray-500 ml-1">bags</span>
                  </div>
                  <div className="hidden sm:block text-right">
                    <span className="text-sm font-semibold text-gray-300">{(item.total_weight_kg / 1000).toFixed(2)}</span>
                    <span className="text-xs text-gray-500 ml-1">MT</span>
                  </div>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-gray-800 overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-800/40">
                        {['WAREHOUSE', 'BATCH', 'PACK SIZE', 'BAGS', 'WEIGHT', 'NOTES'].map(h => (
                          <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-gray-500 tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/60">
                      {item.lines.map((line, i) => (
                        <tr key={i} className="hover:bg-gray-800/30 transition-colors">
                          <td className="px-4 py-2.5">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${whColor(line.warehouse_id)}`}>
                              {line.warehouse_name} · {line.location_city}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="px-2 py-0.5 rounded text-xs font-mono bg-gray-800 text-gray-300 border border-gray-700">{line.batch_number}</span>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="px-2 py-0.5 rounded text-xs font-semibold border bg-gray-700/60 text-gray-300 border-gray-600">
                              {line.packing_size}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 tabular-nums">
                            <span className="text-sm font-bold text-white">{line.quantity_in_stock}</span>
                          </td>
                          <td className="px-4 py-2.5 tabular-nums text-sm text-gray-300">
                            {(line.quantity_in_stock * parseKgPerBag(line.packing_size)).toLocaleString()} kg
                          </td>
                          <td className="px-4 py-2.5 text-xs text-gray-400 max-w-xs">
                            {line.notes ? <span className="italic">{line.notes}</span> : <span className="opacity-30">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </main>

    {lightboxSrc && (
      <Lightbox src={lightboxSrc} title={lightboxTitle} onClose={() => setLightboxSrc(null)} />
    )}
    </>
  )
}

/* ══════════════════════════════════════════════
   WAREHOUSE APP
══════════════════════════════════════════════ */
function WarehouseApp({ refreshSig }: { refreshSig: number }) {
  const [tab, setTab] = useState<'picking' | 'inward' | 'transfer'>('picking')
  const [orders, setOrders] = useState<DispatchOrder[]>([])
  const [colors, setColors] = useState<ColorRow[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loadingOrders, setLoadingOrders] = useState(true)
  const { toasts, add: toast } = useToast()

  // Inward form
  const [iColor, setIColor] = useState('')
  const [iBatch, setIBatch] = useState('')
  const [iDate, setIDate] = useState(todayISO)
  const [iWarehouseId, setIWarehouseId] = useState<number | ''>('')
  const [iSupplierId, setISupplierId] = useState<number | ''>('')
  const [iEntries, setIEntries] = useState<Array<{ packSize: string; qty: string }>>([{ packSize: '', qty: '' }])
  const [iImage, setIImage] = useState<string | null>(null)
  const [iNotes, setINotes] = useState('')
  const [iLoading, setILoading] = useState(false)
  const [allItems, setAllItems] = useState<api.Item[]>([])
  const galleryRef = useRef<HTMLInputElement>(null)
  const cameraRef  = useRef<HTMLInputElement>(null)

  // Transfer form
  const [tFromWid, setTFromWid] = useState<number | ''>('')
  const [tToWid, setTToWid] = useState<number | ''>('')
  const [tColor, setTColor] = useState('')
  const [tBatches, setTBatches] = useState<BatchRow[]>([])
  const [tInvId, setTInvId] = useState<number | null>(null)
  const [tBags, setTBags] = useState('')
  const [tLoading, setTLoading] = useState(false)

  const loadOrders = useCallback(async () => {
    const rows = await api.getDispatchOrders('Pending')
    setOrders(rows)
    setLoadingOrders(false)
  }, [])

  const [allSuppliers, setAllSuppliers] = useState<api.Supplier[]>([])

  useEffect(() => {
    loadOrders()
    api.getColors().then(setColors)
    api.getWarehouses().then(setWarehouses)
    api.getItems().then(setAllItems)
    api.getSuppliers().then(setAllSuppliers)
  }, [loadOrders, refreshSig])

  const onColorChange = (colorName: string) => {
    setIColor(colorName)
    const item = allItems.find(i => i.color_name === colorName)
    setIImage(item?.item_image ?? null)
  }

  const handleImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const compressed = await compressImage(file)
    setIImage(compressed)
    e.target.value = ''
  }

  useEffect(() => {
    if (!tFromWid || !tColor) { setTBatches([]); setTInvId(null); return }
    api.getBatches(tColor, tFromWid as number).then(rows => {
      setTBatches(rows)
      setTInvId(null)
    })
  }, [tFromWid, tColor])

  const confirmPick = async (id: number) => {
    try {
      await api.confirmPickedOrder(id)
      toast('Order marked as Picked ✓', 'ok')
      loadOrders()
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Error', 'err')
    }
  }

  const submitInward = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!iColor || !iBatch || !iWarehouseId) return
    const validEntries = iEntries.filter(en => en.packSize.trim() && parseInt(en.qty) > 0)
    if (validEntries.length === 0) { toast('Enter at least one package with quantity', 'err'); return }
    setILoading(true)
    try {
      await api.inwardStock({
        color_name: iColor,
        batch_number: iBatch,
        import_date: iDate,
        warehouse_id: iWarehouseId as number,
        supplier_id: iSupplierId !== '' ? iSupplierId as number : undefined,
        entries: validEntries.map(en => ({ packing_size: en.packSize.trim(), quantity: parseInt(en.qty) })),
        item_image: iImage,
        notes: iNotes.trim(),
      })
      toast('Stock added successfully ✓', 'ok')
      setIBatch(''); setIWarehouseId(''); setISupplierId(''); setIEntries([{ packSize: '', qty: '' }]); setIImage(null); setINotes('')
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Error', 'err')
    }
    setILoading(false)
  }

  const submitTransfer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tFromWid || !tToWid || !tInvId || !tBags) return
    const selBatch = tBatches.find(b => b.inv_id === tInvId)
    if (!selBatch) return
    const n = parseInt(tBags)
    if (!n || n <= 0) { toast('Enter a valid quantity', 'err'); return }
    setTLoading(true)
    try {
      await api.createTransfer({
        from_warehouse_id: tFromWid as number,
        to_warehouse_id: tToWid as number,
        batch_id: selBatch.id,
        packing_size: selBatch.packing_size,
        bags: n,
      })
      toast('Transfer completed ✓', 'ok')
      setTBags(''); setTInvId(null)
      loadOrders()
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Transfer failed', 'err')
    }
    setTLoading(false)
  }

  return (
    <main className="max-w-xl mx-auto px-4 py-6 w-full">
      {/* Tabs */}
      <div className="grid grid-cols-3 gap-2 mb-6">
        <button onClick={() => setTab('picking')}
          className={`flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-lg text-xs font-medium transition-colors ${tab === 'picking' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'}`}>
          <Ic.Clipboard /><span>Picking List</span>
        </button>
        <button onClick={() => setTab('inward')}
          className={`flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-lg text-xs font-medium transition-colors ${tab === 'inward' ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'}`}>
          <Ic.Plus /><span>Stock Inward</span>
        </button>
        <button onClick={() => setTab('transfer')}
          className={`flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-lg text-xs font-medium transition-colors ${tab === 'transfer' ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'}`}>
          <Ic.Transfer /><span>Transfer</span>
        </button>
      </div>

      {/* ── Picking List ── */}
      {tab === 'picking' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">Pending Dispatch Orders</h2>
            <button onClick={loadOrders} className="p-1.5 text-gray-500 hover:text-gray-200 transition-colors"><Ic.Refresh /></button>
          </div>
          {loadingOrders && <p className="text-center text-gray-500 py-10 text-sm">Loading…</p>}
          {!loadingOrders && orders.length === 0 && <p className="text-center text-gray-500 py-10 text-sm">No pending orders</p>}
          <div className="space-y-3">
            {orders.map(o => (
              <div key={o.id} className="bg-gray-800 border border-gray-700 rounded-xl p-4 hover:border-gray-600 transition-colors">
                <div className="flex items-start gap-3">
                  {o.item_image && (
                    <img src={o.item_image} alt={o.color_name} className="w-14 h-14 object-cover rounded-lg border border-gray-700 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-gray-500 font-mono">DIS-{o.id}</span>
                        <span className={`text-xs border px-1.5 py-0.5 rounded ${whColor(o.warehouse_id)}`}>
                          {o.warehouse_name} · {o.location_city}
                        </span>
                      </div>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded border flex-shrink-0 bg-gray-700/60 text-gray-300 border-gray-600">
                        {o.packing_size}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-white mb-1">{o.color_name}</h3>
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <span><Ic.Hash />{o.batch_number}</span>
                      <span className="text-white font-bold text-sm">{o.bags_dispatched} bags</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2.5 border-t border-gray-700">
                  <span className="text-xs text-gray-400">Customer: <span className="text-gray-200">{o.customer_name}</span></span>
                  <button onClick={() => confirmPick(o.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-medium transition-colors">
                    <Ic.Check /> Confirm Picked
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Stock Inward ── */}
      {tab === 'inward' && (
        <form onSubmit={submitInward} className="space-y-4">
          <h2 className="text-sm font-semibold text-white mb-1">New Stock Inwarding</h2>

          {/* Hidden file inputs */}
          <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={handleImageFile} />
          <input ref={cameraRef}  type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImageFile} />

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Color / Item <span className="text-red-400">*</span></label>
            <select value={iColor} onChange={e => onColorChange(e.target.value)} required
              className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500 appearance-none">
              <option value="">Select color</option>
              {allItems.map(c => <option key={c.id} value={c.color_name}>{c.color_name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Warehouse <span className="text-red-400">*</span></label>
            <select value={iWarehouseId} onChange={e => setIWarehouseId(e.target.value ? Number(e.target.value) : '')} required
              className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500 appearance-none">
              <option value="">Select warehouse</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.warehouse_name} — {w.location_city}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Supplier</label>
            <select value={iSupplierId} onChange={e => setISupplierId(e.target.value ? Number(e.target.value) : '')}
              className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500 appearance-none">
              <option value="">Select supplier (optional)</option>
              {allSuppliers.map(s => <option key={s.id} value={s.id}>{s.supplier_name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Batch Number <span className="text-red-400">*</span></label>
            <input type="text" value={iBatch} onChange={e => setIBatch(e.target.value)} required placeholder="e.g., CN-2024-009"
              className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Import Date</label>
            <input type="date" value={iDate} onChange={e => setIDate(e.target.value)}
              className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Notes</label>
            <textarea value={iNotes} onChange={e => setINotes(e.target.value)} rows={3}
              placeholder="e.g. Special grade, fragile handling, supplier remarks…"
              className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none" />
          </div>

          {/* Item Image */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Item Image</label>
            {iImage ? (
              <div className="flex items-center gap-3 bg-gray-800/40 border border-gray-700 rounded-lg p-3">
                <img src={iImage} alt="Preview" className="w-20 h-20 object-cover rounded-lg border border-gray-600 flex-shrink-0" />
                <div className="flex flex-col gap-2 min-w-0">
                  <button type="button" onClick={() => galleryRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-xs font-medium transition-colors">
                    <Ic.Image /> Gallery
                  </button>
                  <button type="button" onClick={() => cameraRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-xs font-medium transition-colors">
                    <Ic.Camera /> Camera
                  </button>
                  <button type="button" onClick={() => setIImage(null)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded-lg text-xs font-medium transition-colors">
                    <Ic.Trash /> Remove
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button type="button" onClick={() => galleryRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 rounded-lg text-xs font-medium transition-colors">
                  <Ic.Image /> Choose from Gallery
                </button>
                <button type="button" onClick={() => cameraRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 rounded-lg text-xs font-medium transition-colors">
                  <Ic.Camera /> Take Photo
                </button>
              </div>
            )}
          </div>

          {/* Dynamic Packages */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Packages <span className="text-red-400">*</span></label>
            <div className="space-y-2">
              {iEntries.map((entry, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <input type="text" value={entry.packSize}
                    onChange={e => { const v = e.target.value; setIEntries(prev => prev.map((en, i) => i === idx ? { ...en, packSize: v } : en)) }}
                    placeholder="Package (e.g. 20kg, 25kg)"
                    className="flex-1 px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
                  <input type="number" min="1" value={entry.qty}
                    onChange={e => { const v = e.target.value; setIEntries(prev => prev.map((en, i) => i === idx ? { ...en, qty: v } : en)) }}
                    placeholder="Qty"
                    className="w-20 px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
                  {iEntries.length > 1 && (
                    <button type="button" onClick={() => setIEntries(prev => prev.filter((_, i) => i !== idx))}
                      className="p-2 text-gray-500 hover:text-red-400 transition-colors flex-shrink-0">
                      <Ic.Minus />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setIEntries(prev => [...prev, { packSize: '', qty: '' }])}
              className="mt-2 flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors">
              <Ic.Plus /> Add Package
            </button>
          </div>

          <button type="submit" disabled={iLoading}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors">
            <Ic.Plus /> {iLoading ? 'Adding…' : 'Add Stock'}
          </button>
        </form>
      )}

      {/* ── Transfer Stock ── */}
      {tab === 'transfer' && (
        <form onSubmit={submitTransfer} className="space-y-4">
          <h2 className="text-sm font-semibold text-white mb-1">Inter-Warehouse Transfer</h2>

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Source Warehouse <span className="text-red-400">*</span></label>
            <select value={tFromWid} onChange={e => { setTFromWid(e.target.value ? Number(e.target.value) : ''); setTColor(''); setTBatches([]); setTInvId(null) }} required
              className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500 appearance-none">
              <option value="">Select source warehouse</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.warehouse_name} — {w.location_city}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Item / Color <span className="text-red-400">*</span></label>
            <select value={tColor} onChange={e => { setTColor(e.target.value); setTInvId(null) }} required disabled={!tFromWid}
              className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500 appearance-none disabled:opacity-50">
              <option value="">Select color</option>
              {colors.map(c => <option key={c.id} value={c.color_name}>{c.color_name}</option>)}
            </select>
          </div>

          {tFromWid && tColor && (
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Select Batch <span className="text-red-400">*</span></label>
              {tBatches.length === 0
                ? <p className="text-sm text-gray-500 italic py-2">No stock for this item in the selected warehouse</p>
                : (
                  <div className="space-y-1.5">
                    {tBatches.map(b => (
                      <button key={b.inv_id} type="button" onClick={() => setTInvId(b.inv_id)}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-left transition-colors ${tInvId === b.inv_id ? 'bg-purple-900/40 border-purple-500' : 'bg-gray-800 border-gray-700 hover:border-gray-600'}`}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-mono font-medium text-white">{b.batch_number}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded border ${b.packing_size === '20kg' ? 'bg-emerald-900/40 text-emerald-400 border-emerald-800' : 'bg-indigo-900/40 text-indigo-400 border-indigo-800'}`}>
                            {b.packing_size}
                          </span>
                        </div>
                        <span className="text-sm font-bold text-white ml-2 flex-shrink-0">{b.quantity_in_stock} bags</span>
                      </button>
                    ))}
                  </div>
                )
              }
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Destination Warehouse <span className="text-red-400">*</span></label>
            <select value={tToWid} onChange={e => setTToWid(e.target.value ? Number(e.target.value) : '')} required
              className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500 appearance-none">
              <option value="">Select destination warehouse</option>
              {warehouses.filter(w => w.id !== (tFromWid as number)).map(w => (
                <option key={w.id} value={w.id}>{w.warehouse_name} — {w.location_city}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
              Bags to Transfer <span className="text-red-400">*</span>
              {tInvId !== null && tBatches.find(b => b.inv_id === tInvId) && (
                <span className="ml-2 text-gray-500 normal-case font-normal">
                  (max {tBatches.find(b => b.inv_id === tInvId)!.quantity_in_stock})
                </span>
              )}
            </label>
            <input type="number" min="1" value={tBags} onChange={e => setTBags(e.target.value)} placeholder="Enter quantity" required
              className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
          </div>

          <button type="submit" disabled={tLoading || !tFromWid || !tToWid || !tInvId || !tBags}
            className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors">
            <Ic.Transfer /> {tLoading ? 'Transferring…' : 'Transfer Stock'}
          </button>
        </form>
      )}

      {/* Toasts */}
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

/* ══════════════════════════════════════════════
   MASTER PAGE
══════════════════════════════════════════════ */
type MasterTab = 'items' | 'customers' | 'suppliers' | 'warehouses'

function MasterSection<T extends { id: number }>({
  title, icon, items, columns, renderRow, form, setForm, emptyForm, onSave, onDelete, renderForm,
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
}) {
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<number | null>(null)

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form) return
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  const del = async (id: number) => {
    setDeleting(id)
    await onDelete(id)
    setDeleting(null)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-blue-400">{icon}</span>
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">{items.length}</span>
        </div>
        {form === null
          ? <button onClick={() => setForm({ id: null, ...emptyForm } as Partial<T> & { id: number | null })}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition-colors">
              <Ic.Plus /> Add New
            </button>
          : <button onClick={() => setForm(null)} className="text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded-lg bg-gray-800 transition-colors">Cancel</button>
        }
      </div>

      {form !== null && (
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
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-400 tracking-wider">ACTIONS</th>
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
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => setForm({ ...item, id: item.id } as Partial<T> & { id: number | null })}
                      className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-blue-900/20 rounded transition-colors">
                      <Ic.Pencil />
                    </button>
                    <button onClick={() => del(item.id)} disabled={deleting === item.id}
                      className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors disabled:opacity-40">
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
  )
}

function MasterPage() {
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
          title="Items"
          icon={<Ic.Hash />}
          items={items}
          columns={['ITEMS NAME', 'BATCH NUMBERS']}
          emptyForm={{ color_name: '', hsn_code: '7018.90.00', item_image: null, batch_numbers: '' }}
          form={itemForm}
          setForm={setItemForm}
          renderRow={item => [
            <span className="font-medium">{item.color_name}</span>,
            <span className="flex flex-wrap gap-1">
              {item.batch_numbers
                ? item.batch_numbers.split(', ').map(bn => (
                    <span key={bn} className="px-1.5 py-0.5 rounded text-xs font-mono bg-gray-800 text-gray-300 border border-gray-700">{bn}</span>
                  ))
                : <span className="text-gray-500 text-xs italic">No batches</span>
              }
            </span>,
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
              if (f.id) await api.updateItem(f.id, { color_name: f.color_name!, hsn_code: f.hsn_code ?? '7018.90.00', item_image: f.item_image ?? null, batch_numbers: '' })
              else await api.createItem({ color_name: f.color_name!, hsn_code: '7018.90.00', item_image: null, batch_numbers: '' })
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
          title="Customers"
          icon={<Ic.User />}
          items={customers}
          columns={['CUSTOMER NAME', 'CONTACT']}
          emptyForm={{ customer_name: '', contact_number: '' }}
          form={custForm}
          setForm={setCustForm}
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
          title="Suppliers"
          icon={<Ic.Truck />}
          items={suppliers}
          columns={['SUPPLIER NAME', 'CONTACT', 'ADDRESS']}
          emptyForm={{ supplier_name: '', contact_number: '', address: '', created_at: '' }}
          form={supForm}
          setForm={setSupForm}
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
          title="Warehouses"
          icon={<Ic.Building />}
          items={warehouses}
          columns={['WAREHOUSE NAME', 'CITY', 'STATUS']}
          emptyForm={{ warehouse_name: '', location_city: '', is_active: 1 }}
          form={whForm}
          setForm={setWhForm}
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

/* ══════════════════════════════════════════════
   STATUS BADGE helper
══════════════════════════════════════════════ */
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

/* ══════════════════════════════════════════════
   CUSTOMER LEDGER
══════════════════════════════════════════════ */
function CustomerLedger() {
  const [customers, setCustomers] = useState<CustomerSummary[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<CustomerLedgerDetail | null>(null)
  const [loadingList, setLoadingList] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)

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

        {/* Totals */}
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

        {/* Orders table */}
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
                    {['ORDER ID', 'DATE', 'ITEM', 'BATCH', 'PACK', 'BAGS', 'WAREHOUSE', 'STATUS'].map(h => (
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

/* ══════════════════════════════════════════════
   SUPPLIER LEDGER
══════════════════════════════════════════════ */
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

        {/* Totals */}
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

        {/* Batches table */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Inward Batches ({batches.length})</p>
          </div>
          {batches.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-gray-500">No inward batches linked to this supplier yet. Select this supplier when adding stock in the Warehouse → Stock Inward form.</p>
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

/* ══════════════════════════════════════════════
   ADMIN PAGE
══════════════════════════════════════════════ */
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

type AdminTab = 'users' | 'customers' | 'suppliers'

function AdminPage() {
  const [adminTab, setAdminTab] = useState<AdminTab>('users')

  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<typeof EMPTY_USER_FORM | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<number | null>(null)
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

  const handleDelete = async (id: number, username: string) => {
    setDeleting(id)
    try {
      await api.deleteAdminUser(id)
      toast(`User "${username}" deleted`, 'ok')
      load()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error', 'err')
    }
    setDeleting(null)
  }

  return (
    <main className="max-w-5xl mx-auto px-4 py-6 w-full">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-white tracking-tight">Admin Panel</h1>
        <p className="text-sm text-gray-400 mt-0.5">Manage users, roles, and view ledger reports</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {([
          { key: 'users',     label: 'Users',            icon: <Ic.Shield /> },
          { key: 'customers', label: 'Customer Ledger',  icon: <Ic.User />   },
          { key: 'suppliers', label: 'Supplier Ledger',  icon: <Ic.Truck />  },
        ] as { key: AdminTab; label: string; icon: React.ReactNode }[]).map(t => (
          <button key={t.key} onClick={() => setAdminTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${adminTab === t.key ? 'bg-rose-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Customer / Supplier Ledger tabs */}
      {adminTab === 'customers' && <CustomerLedger />}
      {adminTab === 'suppliers' && <SupplierLedger />}

      {adminTab === 'users' && <>
      {/* User management section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-blue-400"><Ic.Shield /></span>
            <h2 className="text-base font-semibold text-white">Users</h2>
            <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">{users.length}</span>
          </div>
          {form === null
            ? <button onClick={openCreate}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition-colors">
                <Ic.Plus /> Create User
              </button>
            : <button onClick={() => setForm(null)} className="text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded-lg bg-gray-800 transition-colors">Cancel</button>
          }
        </div>

        {/* Form */}
        {form !== null && (
          <form onSubmit={handleSave} className="mb-5 bg-gray-900 border border-blue-800/40 rounded-xl p-5 space-y-4">
            <p className="text-xs font-semibold text-blue-300 uppercase tracking-wide">
              {form.id ? `Edit User — ${form.username}` : 'New User'}
            </p>

            {/* Username — only on create */}
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

            {/* Password */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
                {form.id ? 'New Password' : 'Password'} {!form.id && <span className="text-red-400">*</span>}
              </label>
              <input type="password" value={form.password} onChange={e => setForm(f => f && { ...f, password: e.target.value })}
                required={!form.id} minLength={4} placeholder={form.id ? 'Leave blank to keep current' : 'Min 4 characters'}
                className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
            </div>

            {/* Role */}
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

            {/* Rights */}
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

            {/* Active toggle — only on edit */}
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

        {/* Table */}
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
              {loading && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-500 text-sm">Loading…</td></tr>
              )}
              {!loading && users.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-500 text-sm">No users yet. Create one to get started.</td></tr>
              )}
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
                      <button onClick={() => handleDelete(u.id, u.username)} disabled={deleting === u.id}
                        className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors disabled:opacity-40">
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

      {/* Role legend */}
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
    </main>
  )
}

/* ══════════════════════════════════════════════
   ROOT
══════════════════════════════════════════════ */
export default function App() {
  const [view, setView] = useState<'dashboard' | 'warehouse' | 'master' | 'admin'>('dashboard')
  const [showAddCustomer, setShowAddCustomer] = useState(false)
  const [showDispatch, setShowDispatch] = useState(false)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [colors, setColors] = useState<ColorRow[]>([])
  const [refreshSig, setRefreshSig] = useState(0)
  const refresh = useCallback(() => setRefreshSig(s => s + 1), [])
  const { toasts, add: toast } = useToast()

  useWSSync(refresh)

  useEffect(() => {
    api.getCustomers().then(setCustomers)
    api.getColors().then(setColors)
  }, [refreshSig])

  const handleAddCustomer = async (name: string, contact: string) => {
    const c = await api.createCustomer(name, contact)
    setCustomers(prev => [...prev, c].sort((a, b) => a.customer_name.localeCompare(b.customer_name)))
    toast(`Customer "${name}" added`, 'ok')
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 sticky top-0 z-40" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Ic.Cube />
            <p className="text-sm font-bold text-white truncate">Glass Beads WMS</p>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <button onClick={() => setView('dashboard')}
              className={`flex items-center gap-1.5 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${view === 'dashboard' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-800'}`}>
              <Ic.Monitor /><span className="hidden sm:inline">Dashboard</span>
            </button>
            <button onClick={() => setView('warehouse')}
              className={`flex items-center gap-1.5 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${view === 'warehouse' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}>
              <Ic.Building /><span className="hidden sm:inline">Warehouse</span>
            </button>
            <button onClick={() => setView('master')}
              className={`flex items-center gap-1.5 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${view === 'master' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}>
              <Ic.Database /><span className="hidden sm:inline">Master</span>
            </button>
            <button onClick={() => setView('admin')}
              className={`flex items-center gap-1.5 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${view === 'admin' ? 'bg-rose-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}>
              <Ic.Shield /><span className="hidden sm:inline">Admin</span>
            </button>
          </div>
        </div>
      </header>

      {view === 'dashboard' && (
        <GlobalDashboard refreshSig={refreshSig} onAddCustomer={() => setShowAddCustomer(true)} onCreateDispatch={() => setShowDispatch(true)} />
      )}
      {view === 'warehouse' && <WarehouseApp refreshSig={refreshSig} />}
      {view === 'master' && <MasterPage />}
      {view === 'admin' && <AdminPage />}

      {showAddCustomer && (
        <AddCustomerModal onClose={() => setShowAddCustomer(false)} onAdd={handleAddCustomer} />
      )}
      {showDispatch && (
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
