import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import * as api from '../api'
import type { DispatchOrder, ColorRow, Warehouse as WarehouseType, BatchRow, InwardBatch } from '../api'
import Ic from '../icons'
import { todayISO, compressImage, whColor } from '../utils'
import { useToast } from '../hooks/useToast'
import ConfirmDialog from '../components/ConfirmDialog'
import ErrorBlock from '../components/ErrorBlock'
import Skeleton from '../components/Skeleton'
import Lightbox from '../components/Lightbox'

interface Props {
  refreshSig: number
  refreshEntity: string
  canEdit: boolean
  isManager: boolean
  // Manual trigger after a local inward/transfer/batch-edit mutation — the server's own broadcast
  // for the same mutation will also arrive via WS, this just avoids waiting on that round-trip
  // (mobile WebSocket connections routinely drop while backgrounded/screen-locked, which otherwise
  // left the very page that made the change stuck showing stale data until logout/login forced a
  // remount). Mirrors CreateDispatchModal's onCreated={refresh} pattern in App.tsx.
  onDataChanged?: (entity: string) => void
}

// Entities that affect the picking list / inward / transfer forms — anything else
// (e.g. a customer or user edit) shouldn't flash-refetch this page.
const RELEVANT_ENTITIES = new Set(['inventory', 'dispatch', 'transfers', 'items', 'warehouses', 'suppliers'])

export default function WarehouseApp({ refreshSig, refreshEntity, canEdit, isManager, onDataChanged }: Props) {
  const [tab, setTab] = useState<'picking' | 'inward' | 'transfer' | 'records'>('picking')
  const [orders, setOrders] = useState<DispatchOrder[]>([])
  const [colors, setColors] = useState<ColorRow[]>([])
  const [warehouses, setWarehouses] = useState<WarehouseType[]>([])
  const [loadingOrders, setLoadingOrders] = useState(true)
  const [pageError, setPageError] = useState<string | null>(null)
  const [pickingSearch, setPickingSearch] = useState('')
  const [confirmPickId, setConfirmPickId] = useState<number | null>(null)
  const { toasts, add: toast } = useToast()
  const [lightbox, setLightbox] = useState<{ src: string; title: string } | null>(null)

  // Inward form
  const [iColor, setIColor] = useState('')
  const [iBatch, setIBatch] = useState('')
  const [iDate, setIDate] = useState(todayISO)
  const [iWarehouseId, setIWarehouseId] = useState<number | ''>('')
  const [iSupplierId, setISupplierId] = useState<number | ''>('')
  const [iEntries, setIEntries] = useState<Array<{ packSize: string; unit: string; qty: string }>>([{ packSize: '', unit: 'kg', qty: '' }])
  const [iImage, setIImage] = useState<string | null>(null)
  const [iImageIsDefault, setIImageIsDefault] = useState(false)
  const [iNotes, setINotes] = useState('')
  const [iLoading, setILoading] = useState(false)
  const [allItems, setAllItems] = useState<api.Item[]>([])
  const [allSuppliers, setAllSuppliers] = useState<api.Supplier[]>([])
  const galleryRef = useRef<HTMLInputElement>(null)
  const cameraRef  = useRef<HTMLInputElement>(null)
  const hasLoadedBootstrapRef = useRef(false)

  // Transfer form
  const [tFromWid, setTFromWid] = useState<number | ''>('')
  const [tToWid, setTToWid] = useState<number | ''>('')
  const [tColor, setTColor] = useState('')
  const [tBatches, setTBatches] = useState<BatchRow[]>([])
  const [tInvId, setTInvId] = useState<number | null>(null)
  const [tBags, setTBags] = useState('')
  const [tLoading, setTLoading] = useState(false)

  // Records tab
  const [inwardBatches, setInwardBatches] = useState<InwardBatch[]>([])
  const [recordsSearch, setRecordsSearch] = useState('')
  const [expandedBatchId, setExpandedBatchId] = useState<number | null>(null)
  const [editBatch, setEditBatch] = useState<InwardBatch | null>(null)
  const [editBatchForm, setEditBatchForm] = useState({ color_name: '', batch_number: '', import_date: '', notes: '', supplier_id: '', batch_image: null as string | null })
  const [editLines, setEditLines] = useState<Array<{ id?: number; warehouse_id: number | ''; packing_size: string; quantity_in_stock: string; original_quantity_in_stock?: number }>>([])
  const [deleteBatchId, setDeleteBatchId] = useState<number | null>(null)
  const [deleteInvLineId, setDeleteInvLineId] = useState<number | null>(null)
  const [recordsSaving, setRecordsSaving] = useState(false)
  const [recordsLoading, setRecordsLoading] = useState(false)
  const [recordsError, setRecordsError] = useState<string | null>(null)
  const editGalleryRef = useRef<HTMLInputElement>(null)
  const editCameraRef  = useRef<HTMLInputElement>(null)

  const loadOrders = useCallback(async () => {
    try {
      const rows = await api.getDispatchOrders('Pending')
      setOrders(rows)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to refresh orders', 'err')
    } finally {
      setLoadingOrders(false)
    }
  }, [toast])

  const loadInwardBatches = useCallback(async () => {
    setRecordsLoading(true)
    setRecordsError(null)
    try {
      const rows = await api.getInwardBatches()
      setInwardBatches(rows)
    } catch (err) {
      setRecordsError(err instanceof Error ? err.message : 'Failed to load stock records')
    } finally {
      setRecordsLoading(false)
    }
  }, [])

  const loadBootstrap = useCallback(async () => {
    const isInitial = !hasLoadedBootstrapRef.current
    if (isInitial) { setLoadingOrders(true); setPageError(null) }
    try {
      const [ordersRows, colorsRows, whRows, itemsRows, suppliersRows] = await Promise.all([
        api.getDispatchOrders('Pending'),
        api.getColors(),
        api.getWarehouses(),
        api.getItems(),
        api.getSuppliers(),
      ])
      setOrders(ordersRows)
      setColors(colorsRows)
      setWarehouses(whRows)
      setAllItems(itemsRows)
      setAllSuppliers(suppliersRows)
      hasLoadedBootstrapRef.current = true
    } catch (err) {
      // Background refreshes fail silently, keeping the last-known-good data on screen;
      // only the initial load surfaces a retry-able error block.
      if (isInitial) setPageError(err instanceof Error ? err.message : 'Failed to load warehouse data')
    } finally {
      if (isInitial) setLoadingOrders(false)
    }
  }, [])

  useEffect(() => {
    // Gate on this component's own "have I loaded yet" flag, not the shared refreshSig counter —
    // refreshSig persists across a logout/re-login within the same tab, so a freshly-mounted
    // Warehouse page (e.g. after the session-expiry re-auth flow) must always run its first load
    // regardless of what the last broadcast's entity happened to be.
    if (hasLoadedBootstrapRef.current && refreshEntity !== 'all' && !RELEVANT_ENTITIES.has(refreshEntity)) return
    loadBootstrap()
  }, [loadBootstrap, refreshSig, refreshEntity])

  useEffect(() => {
    if (tab === 'records' && isManager) loadInwardBatches()
  }, [tab, isManager, loadInwardBatches])

  const onColorChange = (colorName: string) => {
    setIColor(colorName)
    const item = allItems.find(i => i.color_name === colorName)
    // This is just the color's default photo, shown as a starting point — it is NOT this batch's
    // own photo yet. It only becomes this batch's photo if left untouched when the batch is new.
    setIImage(item?.item_image ?? null)
    setIImageIsDefault(!!item?.item_image)
  }

  const handleImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const compressed = await compressImage(file)
    setIImage(compressed)
    setIImageIsDefault(false)
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

  const openEditBatch = (b: InwardBatch) => {
    setEditBatch(b)
    setEditBatchForm({
      color_name: b.color_name,
      batch_number: b.batch_number,
      import_date: b.import_date,
      notes: b.notes ?? '',
      supplier_id: b.supplier_id != null ? String(b.supplier_id) : '',
      // This batch's own photo only — not the item's borrowed default — so the editor doesn't
      // silently "adopt" a fallback default as this batch's permanent photo on save.
      batch_image: b.batch_image,
    })
    setEditLines(b.inventory.map(l => ({
      id: l.id,
      warehouse_id: l.warehouse_id,
      packing_size: l.packing_size,
      quantity_in_stock: String(l.quantity_in_stock),
      original_quantity_in_stock: l.quantity_in_stock,
    })))
  }

  const handleEditImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const compressed = await compressImage(file)
    setEditBatchForm(f => ({ ...f, batch_image: compressed }))
    e.target.value = ''
  }

  const handleSaveBatchFull = async () => {
    if (!editBatch) return
    const validLines = editLines.filter(l => l.warehouse_id !== '' && l.packing_size.trim() && l.quantity_in_stock !== '')
    if (validLines.length === 0) { toast('Enter at least one inventory line', 'err'); return }
    setRecordsSaving(true)
    try {
      await api.updateInwardBatchFull(editBatch.id, {
        color_name: editBatchForm.color_name,
        batch_number: editBatchForm.batch_number,
        import_date: editBatchForm.import_date,
        notes: editBatchForm.notes,
        supplier_id: editBatchForm.supplier_id ? Number(editBatchForm.supplier_id) : null,
        batch_image: editBatchForm.batch_image,
        lines: validLines.map(l => ({
          id: l.id,
          warehouse_id: l.warehouse_id as number,
          packing_size: l.packing_size.trim(),
          quantity_in_stock: parseInt(l.quantity_in_stock),
          original_quantity_in_stock: l.original_quantity_in_stock,
        })),
      })
      toast('Batch updated ✓', 'ok')
      setEditBatch(null)
      await loadInwardBatches()
      onDataChanged?.('inventory')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Update failed', 'err')
    }
    setRecordsSaving(false)
  }

  const handleDeleteBatch = async () => {
    if (deleteBatchId == null) return
    try {
      await api.deleteInwardBatch(deleteBatchId)
      toast('Batch deleted', 'ok')
      setDeleteBatchId(null)
      setExpandedBatchId(null)
      await loadInwardBatches()
      onDataChanged?.('inventory')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Delete failed', 'err')
    }
  }

  const handleDeleteInvLine = async () => {
    if (deleteInvLineId == null) return
    try {
      await api.deleteInwardInventoryLine(deleteInvLineId)
      toast('Inventory line deleted', 'ok')
      setDeleteInvLineId(null)
      await loadInwardBatches()
      onDataChanged?.('inventory')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Delete failed', 'err')
    }
  }

  const filteredBatches = useMemo(() => {
    if (!recordsSearch.trim()) return inwardBatches
    const q = recordsSearch.toLowerCase()
    return inwardBatches.filter(b =>
      b.color_name.toLowerCase().includes(q) ||
      b.batch_number.toLowerCase().includes(q) ||
      (b.supplier_name ?? '').toLowerCase().includes(q)
    )
  }, [inwardBatches, recordsSearch])

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
        entries: validEntries.map(en => ({ packing_size: `${en.packSize.trim()}${en.unit}`, quantity: parseInt(en.qty) })),
        batch_image: iImage,
        notes: iNotes.trim(),
      })
      toast('Stock added successfully ✓', 'ok')
      setIBatch(''); setIWarehouseId(''); setISupplierId(''); setIEntries([{ packSize: '', unit: 'kg', qty: '' }]); setIImage(null); setIImageIsDefault(false); setINotes('')
      onDataChanged?.('inventory')
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
      // Re-fetch the source warehouse's batch list too — otherwise it keeps showing the
      // pre-transfer bag count until a WS broadcast or remount happens to refresh it.
      if (tFromWid && tColor) api.getBatches(tColor, tFromWid as number).then(setTBatches).catch(() => {})
      onDataChanged?.('transfers')
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Transfer failed', 'err')
    }
    setTLoading(false)
  }

  const filteredOrders = useMemo(() => {
    if (!pickingSearch.trim()) return orders
    const q = pickingSearch.toLowerCase()
    return orders.filter(o =>
      o.color_name.toLowerCase().includes(q) ||
      o.customer_name.toLowerCase().includes(q) ||
      o.batch_number.toLowerCase().includes(q) ||
      o.warehouse_name.toLowerCase().includes(q)
    )
  }, [orders, pickingSearch])

  return (
    <main className="max-w-xl mx-auto px-4 py-6 w-full">
      <div className={`grid gap-2 mb-6 ${isManager ? 'grid-cols-4' : canEdit ? 'grid-cols-3' : 'grid-cols-1'}`}>
        <button onClick={() => setTab('picking')}
          className={`flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-lg text-xs font-medium transition-colors ${tab === 'picking' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'}`}>
          <Ic.Clipboard /><span>Picking</span>
        </button>
        {canEdit && (
          <button onClick={() => setTab('inward')}
            className={`flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-lg text-xs font-medium transition-colors ${tab === 'inward' ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'}`}>
            <Ic.Plus /><span>Inward</span>
          </button>
        )}
        {canEdit && (
          <button onClick={() => setTab('transfer')}
            className={`flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-lg text-xs font-medium transition-colors ${tab === 'transfer' ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'}`}>
            <Ic.Transfer /><span>Transfer</span>
          </button>
        )}
        {isManager && (
          <button onClick={() => setTab('records')}
            className={`flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-lg text-xs font-medium transition-colors ${tab === 'records' ? 'bg-rose-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'}`}>
            <Ic.Database /><span>Records</span>
          </button>
        )}
      </div>

      {/* ── Picking List ── */}
      {tab === 'picking' && (
        <>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white">Pending Dispatch Orders</h2>
            <button onClick={loadOrders} className="p-1.5 text-gray-500 hover:text-gray-200 transition-colors"><Ic.Refresh /></button>
          </div>
          <div className="relative mb-4">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"><Ic.Search /></span>
            <input type="text" value={pickingSearch} onChange={e => setPickingSearch(e.target.value)}
              placeholder="Search by color, customer, batch…"
              className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
          </div>
          {loadingOrders && (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-gray-800 border border-gray-700 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <Skeleton className="w-14 h-14 rounded-lg flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {!loadingOrders && pageError && <ErrorBlock message={pageError} onRetry={loadBootstrap} />}
          {!loadingOrders && !pageError && orders.length === 0 && <p className="text-center text-gray-500 py-10 text-sm">No pending orders</p>}
          {!loadingOrders && !pageError && orders.length > 0 && filteredOrders.length === 0 && <p className="text-center text-gray-500 py-10 text-sm">No orders match your search</p>}
          <div className="space-y-3">
            {!pageError && filteredOrders.map(o => (
              <div key={o.id} className="bg-gray-800 border border-gray-700 rounded-xl p-4 hover:border-gray-600 transition-colors">
                <div className="flex items-start gap-3">
                  {o.item_image && (
                    <img src={o.item_image} alt={o.color_name}
                      className="w-14 h-14 object-cover rounded-lg border border-gray-700 flex-shrink-0 cursor-zoom-in hover:opacity-80 transition-opacity"
                      onClick={() => setLightbox({ src: o.item_image!, title: o.color_name })} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-gray-500 font-mono">DIS-{o.id}</span>
                        <span className={`text-xs border px-1.5 py-0.5 rounded ${whColor(o.warehouse_id)}`}>
                          {o.warehouse_name}
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
                  {canEdit && (
                    <button onClick={() => setConfirmPickId(o.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-medium transition-colors">
                      <Ic.Check /> Confirm Picked
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Stock Inward ── */}
      {tab === 'inward' && canEdit && (
        <form onSubmit={submitInward} className="space-y-4">
          <h2 className="text-sm font-semibold text-white mb-1">New Stock Inwarding</h2>

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
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.warehouse_name}</option>)}
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

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Batch Photo</label>
            {iImage ? (
              <div className="flex items-center gap-3 bg-gray-800/40 border border-gray-700 rounded-lg p-3">
                <img src={iImage} alt="Preview"
                  className="w-20 h-20 object-cover rounded-lg border border-gray-600 flex-shrink-0 cursor-zoom-in hover:opacity-80 transition-opacity"
                  onClick={() => setLightbox({ src: iImage, title: iColor || 'Batch photo' })} />
                <div className="flex flex-col gap-2 min-w-0">
                  {iImageIsDefault && (
                    <p className="text-xs text-amber-400">Default photo for this color — tap Gallery/Camera to set this batch's own photo</p>
                  )}
                  <button type="button" onClick={() => galleryRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-xs font-medium transition-colors">
                    <Ic.Image /> Gallery
                  </button>
                  <button type="button" onClick={() => cameraRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-xs font-medium transition-colors">
                    <Ic.Camera /> Camera
                  </button>
                  <button type="button" onClick={() => { setIImage(null); setIImageIsDefault(false) }}
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

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Packages <span className="text-red-400">*</span></label>
            <div className="space-y-2">
              {iEntries.map((entry, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <input type="text" value={entry.packSize}
                    onChange={e => { const v = e.target.value; setIEntries(prev => prev.map((en, i) => i === idx ? { ...en, packSize: v } : en)) }}
                    placeholder="Size (e.g. 20)"
                    className="flex-1 px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
                  <select value={entry.unit}
                    onChange={e => { const v = e.target.value; setIEntries(prev => prev.map((en, i) => i === idx ? { ...en, unit: v } : en)) }}
                    className="w-20 px-2 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500 appearance-none">
                    <option value="kg">kg</option>
                    <option value="gm">gm</option>
                    <option value="box">box</option>
                    <option value="pcs">pcs</option>
                  </select>
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
            <button type="button" onClick={() => setIEntries(prev => [...prev, { packSize: '', unit: 'kg', qty: '' }])}
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
      {tab === 'transfer' && canEdit && (
        <form onSubmit={submitTransfer} className="space-y-4">
          <h2 className="text-sm font-semibold text-white mb-1">Inter-Warehouse Transfer</h2>

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Source Warehouse <span className="text-red-400">*</span></label>
            <select value={tFromWid} onChange={e => { setTFromWid(e.target.value ? Number(e.target.value) : ''); setTColor(''); setTBatches([]); setTInvId(null) }} required
              className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500 appearance-none">
              <option value="">Select source warehouse</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.warehouse_name}</option>)}
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
                          <span className="text-xs px-1.5 py-0.5 rounded border bg-gray-700/60 text-gray-300 border-gray-600">{b.packing_size}</span>
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
                <option key={w.id} value={w.id}>{w.warehouse_name}</option>
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

      {/* ── Stock Records ── */}
      {tab === 'records' && isManager && (
        <>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white">Stock Inward Records</h2>
            <button onClick={loadInwardBatches} className="p-1.5 text-gray-500 hover:text-gray-200 transition-colors"><Ic.Refresh /></button>
          </div>
          <div className="relative mb-4">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"><Ic.Search /></span>
            <input type="text" value={recordsSearch} onChange={e => setRecordsSearch(e.target.value)}
              placeholder="Search by item, batch, supplier…"
              className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
          </div>
          {recordsLoading && (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex items-center gap-3">
                  <Skeleton className="w-10 h-10 rounded-lg flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-1/2" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                  <Skeleton className="h-4 w-12" />
                </div>
              ))}
            </div>
          )}
          {!recordsLoading && recordsError && <ErrorBlock message={recordsError} onRetry={loadInwardBatches} />}
          {!recordsLoading && !recordsError && filteredBatches.length === 0 && (
            <p className="text-center text-gray-500 py-10 text-sm">No inward records found</p>
          )}
          <div className="space-y-2">
            {!recordsError && filteredBatches.map(b => {
              const isExpanded = expandedBatchId === b.id
              const totalBags = b.inventory.reduce((s, l) => s + l.quantity_in_stock, 0)
              return (
                <div key={b.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                  {/* Batch header row */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    {b.item_image
                      ? <img src={b.item_image}
                          className="w-10 h-10 rounded-lg object-cover border border-gray-700 flex-shrink-0 cursor-zoom-in hover:opacity-80 transition-opacity"
                          onClick={() => setLightbox({ src: b.item_image!, title: b.color_name })} />
                      : <div className="w-10 h-10 rounded-lg bg-gray-700 flex-shrink-0" />}
                    <button className="flex-1 min-w-0 text-left" onClick={() => setExpandedBatchId(isExpanded ? null : b.id)}>
                      <p className="text-sm font-semibold text-white truncate">{b.color_name}</p>
                      <p className="text-xs text-gray-400 font-mono">{b.batch_number} · {b.import_date}</p>
                      {b.supplier_name && <p className="text-xs text-gray-500">{b.supplier_name}</p>}
                    </button>
                    <div className="text-right flex-shrink-0 mr-2">
                      <p className="text-sm font-bold text-white">{totalBags.toLocaleString()} <span className="text-xs font-normal text-gray-500">bags</span></p>
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded border ${b.status === 'Active' ? 'bg-emerald-900/30 text-emerald-400 border-emerald-800/60' : 'bg-gray-700 text-gray-400 border-gray-600'}`}>{b.status}</span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => openEditBatch(b)} title="Edit batch"
                        className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-blue-900/20 rounded transition-colors">
                        <Ic.Pencil />
                      </button>
                      <button onClick={() => setDeleteBatchId(b.id)} title="Delete batch"
                        className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors">
                        <Ic.Trash />
                      </button>
                    </div>
                  </div>

                  {/* Inventory lines (expanded) */}
                  {isExpanded && (
                    <div className="border-t border-gray-800">
                      {b.inventory.length === 0
                        ? <p className="px-4 py-3 text-xs text-gray-500 italic">No inventory lines</p>
                        : b.inventory.map(line => (
                          <div key={line.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-800/60 last:border-0 hover:bg-gray-800/30">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-white">{line.warehouse_name}</p>
                              <p className="text-xs text-gray-400">{line.packing_size} · {line.quantity_in_stock} bags</p>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button onClick={() => setDeleteInvLineId(line.id)} title="Delete inventory line"
                                className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors">
                                <Ic.Trash />
                              </button>
                            </div>
                          </div>
                        ))
                      }
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Edit Batch Modal — full editor, same fields/shape as "+ Inward" */}
          {editBatch && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8 overflow-y-auto">
              <div className="bg-gray-900 border border-blue-800/50 rounded-xl p-6 max-w-md w-full shadow-2xl my-auto">
                <p className="text-sm font-semibold text-white mb-4">Edit Batch</p>

                <input ref={editGalleryRef} type="file" accept="image/*" className="hidden" onChange={handleEditImageFile} />
                <input ref={editCameraRef}  type="file" accept="image/*" capture="environment" className="hidden" onChange={handleEditImageFile} />

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">Color / Item <span className="text-red-400">*</span></label>
                    <select value={editBatchForm.color_name} onChange={e => setEditBatchForm(f => ({ ...f, color_name: e.target.value }))}
                      className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500 appearance-none">
                      {allItems.map(c => <option key={c.id} value={c.color_name}>{c.color_name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">Batch Number</label>
                    <input value={editBatchForm.batch_number} onChange={e => setEditBatchForm(f => ({ ...f, batch_number: e.target.value }))}
                      className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">Import Date</label>
                    <input type="date" value={editBatchForm.import_date} onChange={e => setEditBatchForm(f => ({ ...f, import_date: e.target.value }))}
                      className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">Supplier</label>
                    <select value={editBatchForm.supplier_id} onChange={e => setEditBatchForm(f => ({ ...f, supplier_id: e.target.value }))}
                      className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500 appearance-none">
                      <option value="">No supplier</option>
                      {allSuppliers.map(s => <option key={s.id} value={s.id}>{s.supplier_name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">Notes</label>
                    <textarea value={editBatchForm.notes} onChange={e => setEditBatchForm(f => ({ ...f, notes: e.target.value }))}
                      rows={2} className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500 resize-none" />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">Batch Photo</label>
                    {editBatchForm.batch_image ? (
                      <div className="flex items-center gap-3 bg-gray-800/40 border border-gray-700 rounded-lg p-3">
                        <img src={editBatchForm.batch_image} alt="Preview"
                          className="w-16 h-16 object-cover rounded-lg border border-gray-600 flex-shrink-0 cursor-zoom-in hover:opacity-80 transition-opacity"
                          onClick={() => setLightbox({ src: editBatchForm.batch_image!, title: editBatchForm.color_name || 'Batch photo' })} />
                        <div className="flex flex-col gap-2 min-w-0">
                          <button type="button" onClick={() => editGalleryRef.current?.click()}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-xs font-medium transition-colors">
                            <Ic.Image /> Gallery
                          </button>
                          <button type="button" onClick={() => setEditBatchForm(f => ({ ...f, batch_image: null }))}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded-lg text-xs font-medium transition-colors">
                            <Ic.Trash /> Remove
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button type="button" onClick={() => editGalleryRef.current?.click()}
                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 rounded-lg text-xs font-medium transition-colors">
                        <Ic.Image /> Add a photo for this batch
                      </button>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">Inventory Lines <span className="text-red-400">*</span></label>
                    <div className="space-y-2">
                      {editLines.map((line, idx) => (
                        <div key={idx} className="flex flex-wrap gap-2 items-center bg-gray-800/40 border border-gray-700 rounded-lg p-2">
                          <select value={line.warehouse_id}
                            onChange={e => { const v = e.target.value ? Number(e.target.value) : ''; setEditLines(prev => prev.map((l, i) => i === idx ? { ...l, warehouse_id: v } : l)) }}
                            className="flex-1 min-w-24 px-2 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500 appearance-none">
                            <option value="">Warehouse</option>
                            {warehouses.map(w => <option key={w.id} value={w.id}>{w.warehouse_name}</option>)}
                          </select>
                          <input type="text" value={line.packing_size}
                            onChange={e => { const v = e.target.value; setEditLines(prev => prev.map((l, i) => i === idx ? { ...l, packing_size: v } : l)) }}
                            placeholder="Pack (20kg)"
                            className="w-24 px-2 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
                          <input type="number" min="0" value={line.quantity_in_stock}
                            onChange={e => { const v = e.target.value; setEditLines(prev => prev.map((l, i) => i === idx ? { ...l, quantity_in_stock: v } : l)) }}
                            placeholder="Qty"
                            className="w-16 px-2 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
                          {editLines.length > 1 && (
                            <button type="button" onClick={() => setEditLines(prev => prev.filter((_, i) => i !== idx))}
                              className="p-1.5 text-gray-500 hover:text-red-400 transition-colors flex-shrink-0">
                              <Ic.Minus />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <button type="button" onClick={() => setEditLines(prev => [...prev, { warehouse_id: '', packing_size: '', quantity_in_stock: '' }])}
                      className="mt-2 flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors">
                      <Ic.Plus /> Add Line
                    </button>
                  </div>
                </div>

                <div className="flex gap-2 mt-5">
                  <button onClick={() => setEditBatch(null)}
                    className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm font-medium transition-colors">Cancel</button>
                  <button onClick={handleSaveBatchFull} disabled={recordsSaving || !editBatchForm.batch_number.trim() || !editBatchForm.color_name}
                    className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors">
                    {recordsSaving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {deleteBatchId !== null && (
            <ConfirmDialog
              message="Delete this entire inward batch and all its inventory lines? This cannot be undone."
              onConfirm={handleDeleteBatch}
              onCancel={() => setDeleteBatchId(null)}
            />
          )}
          {deleteInvLineId !== null && (
            <ConfirmDialog
              message="Delete this inventory line? The bags will be removed from stock."
              onConfirm={handleDeleteInvLine}
              onCancel={() => setDeleteInvLineId(null)}
            />
          )}
        </>
      )}

      {/* Toasts */}
      <div className="fixed bottom-5 right-5 flex flex-col gap-2 z-50 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm border shadow-xl ${t.type === 'ok' ? 'bg-emerald-900/80 text-emerald-300 border-emerald-700' : 'bg-red-900/80 text-red-300 border-red-700'}`}>
            {t.type === 'ok' ? <Ic.Check /> : <Ic.Warning />} {t.msg}
          </div>
        ))}
      </div>

      {confirmPickId !== null && (
        <ConfirmDialog
          message={`Mark order DIS-${confirmPickId} as Picked?`}
          confirmLabel="Confirm Picked"
          danger={false}
          onConfirm={() => { confirmPick(confirmPickId); setConfirmPickId(null) }}
          onCancel={() => setConfirmPickId(null)}
        />
      )}

      {lightbox && (
        <Lightbox src={lightbox.src} title={lightbox.title} onClose={() => setLightbox(null)} />
      )}
    </main>
  )
}
