import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import * as api from '../api'
import type { DispatchOrder, ColorRow, Warehouse as WarehouseType, BatchRow } from '../api'
import Ic from '../icons'
import { todayISO, compressImage, whColor } from '../utils'
import { useToast } from '../hooks/useToast'
import ConfirmDialog from '../components/ConfirmDialog'

interface Props {
  refreshSig: number
  canEdit: boolean
}

export default function WarehouseApp({ refreshSig, canEdit }: Props) {
  const [tab, setTab] = useState<'picking' | 'inward' | 'transfer'>('picking')
  const [orders, setOrders] = useState<DispatchOrder[]>([])
  const [colors, setColors] = useState<ColorRow[]>([])
  const [warehouses, setWarehouses] = useState<WarehouseType[]>([])
  const [loadingOrders, setLoadingOrders] = useState(true)
  const [pickingSearch, setPickingSearch] = useState('')
  const [confirmPickId, setConfirmPickId] = useState<number | null>(null)
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
  const [allSuppliers, setAllSuppliers] = useState<api.Supplier[]>([])
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
      <div className="grid grid-cols-3 gap-2 mb-6">
        <button onClick={() => setTab('picking')}
          className={`flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-lg text-xs font-medium transition-colors ${tab === 'picking' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'}`}>
          <Ic.Clipboard /><span>Picking List</span>
        </button>
        {canEdit && (
          <button onClick={() => setTab('inward')}
            className={`flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-lg text-xs font-medium transition-colors ${tab === 'inward' ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'}`}>
            <Ic.Plus /><span>Stock Inward</span>
          </button>
        )}
        {canEdit && (
          <button onClick={() => setTab('transfer')}
            className={`flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-lg text-xs font-medium transition-colors ${tab === 'transfer' ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'}`}>
            <Ic.Transfer /><span>Transfer</span>
          </button>
        )}
        {!canEdit && <div className="col-span-2" />}
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
          {loadingOrders && <p className="text-center text-gray-500 py-10 text-sm">Loading…</p>}
          {!loadingOrders && orders.length === 0 && <p className="text-center text-gray-500 py-10 text-sm">No pending orders</p>}
          {!loadingOrders && orders.length > 0 && filteredOrders.length === 0 && <p className="text-center text-gray-500 py-10 text-sm">No orders match your search</p>}
          <div className="space-y-3">
            {filteredOrders.map(o => (
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
      {tab === 'transfer' && canEdit && (
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

      {confirmPickId !== null && (
        <ConfirmDialog
          message={`Mark order DIS-${confirmPickId} as Picked?`}
          confirmLabel="Confirm Picked"
          danger={false}
          onConfirm={() => { confirmPick(confirmPickId); setConfirmPickId(null) }}
          onCancel={() => setConfirmPickId(null)}
        />
      )}
    </main>
  )
}
