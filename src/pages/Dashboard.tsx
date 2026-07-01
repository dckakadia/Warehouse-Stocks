import { useState, useEffect, useCallback, useMemo } from 'react'
import * as api from '../api'
import type { StockSummary, Warehouse } from '../api'
import Ic from '../icons'
import Lightbox from '../components/Lightbox'
import { whColor, parseKgPerBag } from '../utils'

interface Props {
  refreshSig: number
  onCreateDispatch: () => void
  canEdit: boolean
}

export default function Dashboard({ refreshSig, onCreateDispatch, canEdit }: Props) {
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
          .map(s => ({ ...s, lines: s.lines.filter(l => l.warehouse_id === filterWid) }))
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

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"><Ic.Search /></span>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search items…"
            className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors" />
        </div>
        <div className="ml-auto flex gap-2 flex-wrap">
          {canEdit && (
            <button onClick={onCreateDispatch}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors">
              <Ic.Truck /> Create Dispatch Order
            </button>
          )}
        </div>
      </div>

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
                            <span className="px-2 py-0.5 rounded text-xs font-semibold border bg-gray-700/60 text-gray-300 border-gray-600">{line.packing_size}</span>
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
