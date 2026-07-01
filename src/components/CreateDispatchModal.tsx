import { useState, useMemo } from 'react'
import * as api from '../api'
import type { Customer, ColorRow, BatchRow, RecommendedBatch } from '../api'
import Ic from '../icons'
import { whColor } from '../utils'

interface Props {
  customers: Customer[]
  colors: ColorRow[]
  onClose: () => void
  onCreated: () => void
}

export default function CreateDispatchModal({ customers, colors, onClose, onCreated }: Props) {
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
          {step === 1 && (
            <>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Select Customer</p>
              <div className="relative mb-3">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"><Ic.Search /></span>
                <input autoFocus type="text" value={custSearch} onChange={e => setCustSearch(e.target.value)} placeholder="Search customers…"
                  className="w-full pl-9 pr-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
              </div>
              <div className="space-y-1.5">
                {customers.length === 0
                  ? <p className="text-sm text-gray-500 italic text-center py-6">No customers yet. Add one first.</p>
                  : filteredCustomers.length === 0
                  ? <p className="text-sm text-gray-500 italic text-center py-6">No customers match your search.</p>
                  : filteredCustomers.map(c => (
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

          {step === 2 && (
            <>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Select Color / Item</p>
              <div className="space-y-1.5">
                {colors.length === 0
                  ? <p className="text-sm text-gray-500 italic text-center py-6">No items with available stock.</p>
                  : colors.map(col => (
                    <button key={col.id} onClick={() => selectColor(col)}
                      className="w-full flex items-center gap-3 px-3 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg text-left transition-colors">
                      {col.item_image ? (
                        <img src={col.item_image} alt={col.color_name} className="w-11 h-11 object-cover rounded-lg border border-gray-700 flex-shrink-0" />
                      ) : (
                        <div className="w-11 h-11 rounded-lg bg-gray-700 flex items-center justify-center flex-shrink-0 text-gray-500"><Ic.Image /></div>
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
                    <p className="text-amber-200/80 mt-0.5">Last purchase: <strong>{recommended.batch_number}</strong> — use same batch for shade consistency</p>
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
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-mono font-medium text-white">{b.batch_number}</span>
                                <span className={`text-xs border px-1.5 py-0.5 rounded ${whColor(b.warehouse_id)}`}>
                                  {b.warehouse_name} · {b.location_city}
                                </span>
                                {recommended?.batch_number === b.batch_number && (
                                  <span className="text-xs bg-amber-700/40 text-amber-300 px-1.5 py-0.5 rounded font-medium">Recommended</span>
                                )}
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
