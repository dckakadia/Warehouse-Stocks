import { Fragment, useState, useEffect, useMemo, useCallback } from 'react'
import * as api from '../api'
import type { CustomerSummary, CustomerLedgerDetail, CustomerOrderRow, SupplierSummary, SupplierLedgerDetail, SupplierBatchRow, TransferRecord, DailyReportResponse, DailyOutwardRow } from '../api'
import Ic from '../icons'
import { useToast } from '../hooks/useToast'
import ConfirmDialog from '../components/ConfirmDialog'
import ErrorBlock from '../components/ErrorBlock'
import Skeleton from '../components/Skeleton'
import Lightbox from '../components/Lightbox'
import { todayISO, printHtmlDocument, groupByOrder } from '../utils'

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

interface RightsProps {
  canEdit: boolean
  canDelete: boolean
}

/* ── Customer Ledger ── */
function CustomerLedger({ canEdit, canDelete }: RightsProps) {
  const [customers, setCustomers] = useState<CustomerSummary[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<CustomerLedgerDetail | null>(null)
  const [loadingList, setLoadingList] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [editOrder, setEditOrder] = useState<CustomerOrderRow | null>(null)
  const [editStatus, setEditStatus] = useState('')
  const [editBags, setEditBags] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [deleteOrderId, setDeleteOrderId] = useState<number | null>(null)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [lightbox, setLightbox] = useState<{ src: string; title: string } | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const { add: toast } = useToast()

  const toggleExpand = (key: string) => setExpandedGroups(prev => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  const loadList = useCallback(() => {
    setLoadingList(true)
    setListError(null)
    api.getLedgerCustomers()
      .then(setCustomers)
      .catch(err => setListError(err instanceof Error ? err.message : 'Failed to load customers'))
      .finally(() => setLoadingList(false))
  }, [])

  useEffect(() => { loadList() }, [loadList])

  const filtered = useMemo(() =>
    customers.filter(c =>
      c.customer_name.toLowerCase().includes(search.toLowerCase()) ||
      c.contact_number.includes(search)
    ), [customers, search])

  const openDetail = async (id: number) => {
    setLoadingDetail(true)
    try {
      const detail = await api.getLedgerCustomer(id)
      setSelected(detail)
      setFromDate('')
      setToDate('')
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to load customer', 'err')
    }
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
    const { customer, orders } = selected

    const dateFilteredOrders = orders.filter(o => {
      const d = o.created_at.slice(0, 10)
      if (fromDate && d < fromDate) return false
      if (toDate && d > toDate) return false
      return true
    })

    // Lines from the same cart order (see "Group multi-item dispatch orders" in CLAUDE.md) are
    // grouped so a multi-item delivery reads as one order, not several disconnected rows.
    const groupedOrders = groupByOrder(dateFilteredOrders)

    const filteredTotals = {
      total_orders: groupedOrders.length,
      total_bags: dateFilteredOrders.filter(o => o.status !== 'Cancelled').reduce((s, o) => s + o.bags_dispatched, 0),
      picked_bags: dateFilteredOrders.filter(o => o.status === 'Picked').reduce((s, o) => s + o.bags_dispatched, 0),
      pending_bags: dateFilteredOrders.filter(o => o.status === 'Pending').reduce((s, o) => s + o.bags_dispatched, 0),
      cancelled_bags: dateFilteredOrders.filter(o => o.status === 'Cancelled').reduce((s, o) => s + o.bags_dispatched, 0),
    }

    const handlePrint = () => {
      const period = fromDate || toDate
        ? `${fromDate ? new Date(fromDate).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : 'Start'} — ${toDate ? new Date(toDate).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : 'Today'}`
        : 'All Time'

      const orderRow = (o: CustomerOrderRow) => `
        <tr>
          <td class="mono">DIS-${o.id}</td>
          <td>${new Date(o.created_at).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}</td>
          <td class="bold">${o.color_name}</td>
          <td class="mono sm">${o.batch_number}</td>
          <td>${o.packing_size}</td>
          <td class="bold center">${o.bags_dispatched}</td>
          <td class="sm">${o.warehouse_name}</td>
          <td><span class="badge badge-${o.status.toLowerCase()}">${o.status}</span></td>
        </tr>`

      // Multi-item orders (a cart submitted together) get a header row spanning the table so they
      // read as one delivery, not several unrelated line items — a printed page can't be expanded
      // interactively like the on-screen table, so every item is always shown.
      const rows = groupedOrders.map(({ items }) => items.length === 1
        ? orderRow(items[0])
        : `
        <tr class="order-header"><td colspan="8">Order ${items.map(o => `DIS-${o.id}`).join(', ')} — ${items.length} items</td></tr>
        ${items.map(orderRow).join('')}`
      ).join('')

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Customer Ledger — ${customer.customer_name}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; background: #fff; font-size: 11px; line-height: 1.4; }
  .page { padding: 24px 28px; }
  /* Header */
  .header { display: flex; align-items: flex-start; justify-content: space-between; padding-bottom: 14px; border-bottom: 2.5px solid #1a1a1a; margin-bottom: 16px; }
  .company-name { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; color: #111; }
  .report-title { font-size: 12px; color: #555; margin-top: 2px; font-weight: 500; }
  .header-right { text-align: right; }
  .header-right .label { font-size: 9px; color: #888; text-transform: uppercase; letter-spacing: 0.08em; }
  .header-right .value { font-size: 13px; font-weight: 700; margin-top: 1px; }
  .header-right .sub { font-size: 10px; color: #555; margin-top: 2px; }
  /* Customer info */
  .customer-bar { display: flex; justify-content: space-between; align-items: center; background: #f5f5f5; border-radius: 8px; padding: 10px 14px; margin-bottom: 14px; }
  .customer-name { font-size: 16px; font-weight: 700; }
  .customer-contact { font-size: 11px; color: #555; margin-top: 2px; }
  .period-tag { background: #1a1a1a; color: #fff; padding: 4px 12px; border-radius: 20px; font-size: 10px; font-weight: 600; letter-spacing: 0.03em; }
  /* Summary grid */
  .summary { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 16px; }
  .stat { border: 1px solid #e0e0e0; border-radius: 8px; padding: 10px 12px; text-align: center; }
  .stat .num { font-size: 20px; font-weight: 800; line-height: 1; }
  .stat .lbl { font-size: 9px; color: #777; text-transform: uppercase; letter-spacing: 0.07em; margin-top: 4px; }
  .num-green { color: #16a34a; }
  .num-amber { color: #d97706; }
  .num-red   { color: #dc2626; }
  /* Table */
  .section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #555; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; }
  thead tr { background: #1a1a1a; }
  th { padding: 7px 10px; text-align: left; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: #fff; }
  td { padding: 7px 10px; border-bottom: 1px solid #f0f0f0; vertical-align: middle; }
  tr:nth-child(even) td { background: #fafafa; }
  tr:last-child td { border-bottom: none; }
  .mono { font-family: 'Courier New', monospace; }
  .sm { font-size: 10px; color: #444; }
  .bold { font-weight: 700; }
  .center { text-align: center; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 9px; font-weight: 700; letter-spacing: 0.04em; }
  .badge-pending   { background: #fef3c7; color: #92400e; }
  .badge-picked    { background: #d1fae5; color: #065f46; }
  .badge-cancelled { background: #fee2e2; color: #991b1b; }
  .order-header td { background: #f5f5f5 !important; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #555; padding: 5px 10px; }
  /* Footer */
  .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #ddd; display: flex; justify-content: space-between; font-size: 9px; color: #aaa; }
  .no-orders { text-align: center; padding: 30px; color: #999; font-style: italic; }
  @media print {
    body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    @page { margin: 12mm 14mm; size: A4 landscape; }
    .page { padding: 0; }
  }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      <div class="company-name">Glass Beads WMS</div>
      <div class="report-title">Customer Ledger Report</div>
    </div>
    <div class="header-right">
      <div class="label">Generated</div>
      <div class="value">${new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}</div>
      <div class="sub">${new Date().toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' })}</div>
    </div>
  </div>

  <div class="customer-bar">
    <div>
      <div class="customer-name">${customer.customer_name}</div>
      ${customer.contact_number ? `<div class="customer-contact">${customer.contact_number}</div>` : ''}
    </div>
    <span class="period-tag">${period}</span>
  </div>

  <div class="summary">
    <div class="stat"><div class="num">${filteredTotals.total_orders}</div><div class="lbl">Total Orders</div></div>
    <div class="stat"><div class="num">${filteredTotals.total_bags.toLocaleString()}</div><div class="lbl">Bags (Active)</div></div>
    <div class="stat"><div class="num num-green">${filteredTotals.picked_bags.toLocaleString()}</div><div class="lbl">Picked</div></div>
    <div class="stat"><div class="num num-amber">${filteredTotals.pending_bags.toLocaleString()}</div><div class="lbl">Pending</div></div>
    <div class="stat"><div class="num num-red">${filteredTotals.cancelled_bags.toLocaleString()}</div><div class="lbl">Cancelled</div></div>
  </div>

  <div class="section-title">Orders (${groupedOrders.length})</div>
  ${dateFilteredOrders.length === 0
    ? '<div class="no-orders">No orders for the selected period.</div>'
    : `<table>
    <thead>
      <tr>
        <th>Order ID</th><th>Date</th><th>Item</th><th>Batch</th><th>Pack Size</th>
        <th style="text-align:center">Bags</th><th>Warehouse</th><th>Status</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`}

  <div class="footer">
    <span>Glass Beads WMS — Confidential</span>
    <span>Customer: ${customer.customer_name} · Period: ${period}</span>
    <span>Page 1</span>
  </div>
</div>
</body>
</html>`

      printHtmlDocument(html)
    }

    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setSelected(null)}
            className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors">
            <Ic.Left /> All Customers
          </button>
          <div className="flex gap-2">
            <button onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-xs font-medium transition-colors">
              <Ic.Print /> Print
            </button>
            <button onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-xs font-medium transition-colors">
              <Ic.FilePdf /> PDF
            </button>
          </div>
        </div>

        {/* Customer header */}
        <div className="flex items-center gap-3 mb-4">
          <span className="w-9 h-9 rounded-full bg-blue-900/40 border border-blue-700/60 flex items-center justify-center text-blue-300 font-bold text-sm flex-shrink-0">
            {customer.customer_name[0].toUpperCase()}
          </span>
          <div>
            <h2 className="text-base font-bold text-white">{customer.customer_name}</h2>
            <p className="text-xs text-gray-400">{customer.contact_number || 'No contact'}</p>
          </div>
        </div>

        {/* Date range filter */}
        <div className="flex flex-wrap items-center gap-3 mb-5 p-3 bg-gray-900 border border-gray-800 rounded-xl">
          <span className="text-xs text-gray-400 font-medium">Period:</span>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">From</label>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
              className="px-2.5 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">To</label>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
              className="px-2.5 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500" />
          </div>
          {(fromDate || toDate) && (
            <button onClick={() => { setFromDate(''); setToDate('') }}
              className="text-xs text-gray-500 hover:text-white px-2 py-1 rounded transition-colors">
              Clear
            </button>
          )}
          {(fromDate || toDate) && (
            <span className="text-xs text-blue-400 ml-auto">{groupedOrders.length} of {groupByOrder(orders).length} orders</span>
          )}
        </div>

        {/* Summary stats (filtered) */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
          {[
            { label: 'Orders', value: filteredTotals.total_orders, color: 'text-white' },
            { label: 'Active Bags', value: filteredTotals.total_bags, color: 'text-white' },
            { label: 'Picked', value: filteredTotals.picked_bags, color: 'text-emerald-400' },
            { label: 'Pending', value: filteredTotals.pending_bags, color: 'text-amber-400' },
            { label: 'Cancelled', value: filteredTotals.cancelled_bags, color: 'text-red-400' },
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
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Orders ({groupedOrders.length})</p>
          </div>
          {dateFilteredOrders.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-gray-500">
              {orders.length === 0 ? 'No orders yet' : 'No orders in selected period'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-800/60 border-b border-gray-800">
                    {['ORDER ID', 'DATE', 'ITEM', 'BATCH', 'PACK', 'BAGS', 'WAREHOUSE', 'STATUS'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                    {(canEdit || canDelete) && <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 tracking-wider whitespace-nowrap">ACTIONS</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {groupedOrders.map(({ key, items }) => {
                    const isGroup = items.length > 1
                    const expanded = expandedGroups.has(key)
                    const first = items[0]
                    const statuses = new Set(items.map(o => o.status))
                    return (
                      <Fragment key={key}>
                        {isGroup && (
                          <tr className="hover:bg-gray-800/40 transition-colors cursor-pointer" onClick={() => toggleExpand(key)}>
                            <td className="px-4 py-3 text-xs font-mono text-gray-400">
                              <span className="inline-flex items-center gap-1.5">
                                {expanded ? <Ic.ChevronDown /> : <Ic.ChevronRight />}
                                DIS-{first.id}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-300 whitespace-nowrap">{new Date(first.created_at).toLocaleDateString()}</td>
                            <td className="px-4 py-3"><span className="text-sm text-white font-medium">{items.length} items</span></td>
                            <td className="px-4 py-3 text-xs text-gray-600">—</td>
                            <td className="px-4 py-3 text-xs text-gray-600">—</td>
                            <td className="px-4 py-3 text-sm font-bold text-white">{items.reduce((s, o) => s + o.bags_dispatched, 0)}</td>
                            <td className="px-4 py-3 text-xs text-gray-600">—</td>
                            <td className="px-4 py-3">
                              {statuses.size === 1 ? <StatusBadge status={first.status} /> : <span className="text-xs text-gray-400">Mixed</span>}
                            </td>
                            {(canEdit || canDelete) && <td className="px-4 py-3" />}
                          </tr>
                        )}
                        {(!isGroup || expanded) && items.map(o => (
                          <tr key={o.id} className={`hover:bg-gray-800/40 transition-colors ${isGroup ? 'bg-gray-950/40' : ''}`}>
                            <td className={`px-4 py-3 text-xs font-mono text-gray-400 ${isGroup ? 'pl-9' : ''}`}>DIS-{o.id}</td>
                            <td className="px-4 py-3 text-xs text-gray-300 whitespace-nowrap">{new Date(o.created_at).toLocaleDateString()}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                {o.item_image
                                  ? <img src={o.item_image}
                                      className="w-7 h-7 rounded object-cover border border-gray-700 flex-shrink-0 cursor-zoom-in hover:opacity-80 transition-opacity"
                                      onClick={() => setLightbox({ src: o.item_image!, title: o.color_name })} />
                                  : <div className="w-7 h-7 rounded bg-gray-700 flex-shrink-0" />}
                                <span className="text-sm text-white font-medium">{o.color_name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs font-mono text-gray-300">{o.batch_number}</td>
                            <td className="px-4 py-3 text-xs text-gray-300">{o.packing_size}</td>
                            <td className="px-4 py-3 text-sm font-bold text-white">{o.bags_dispatched}</td>
                            <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{o.warehouse_name}</td>
                            <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                            {(canEdit || canDelete) && (
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1">
                                  {canEdit && (
                                    <button onClick={() => openEdit(o)} title="Edit order"
                                      className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-blue-900/20 rounded transition-colors">
                                      <Ic.Pencil />
                                    </button>
                                  )}
                                  {canDelete && (
                                    <button onClick={() => setDeleteOrderId(o.id)} title="Delete order"
                                      className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors">
                                      <Ic.Trash />
                                    </button>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                      </Fragment>
                    )
                  })}
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
                  <input type="number" min="1" value={editBags} onChange={e => setEditBags(e.target.value)}
                    className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500" />
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
                  className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm font-medium transition-colors">Cancel</button>
                <button onClick={handleEditSave} disabled={editSaving || !editBags || Number(editBags) < 1}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors">
                  {editSaving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}

        {deleteOrderId !== null && (
          <ConfirmDialog
            message={`Delete order DIS-${deleteOrderId}? Stock will be restored to inventory if the order was active.`}
            danger
            onConfirm={handleDelete}
            onCancel={() => setDeleteOrderId(null)}
          />
        )}

        {lightbox && (
          <Lightbox src={lightbox.src} title={lightbox.title} onClose={() => setLightbox(null)} />
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
      {loadingList && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 bg-gray-900 border border-gray-800 rounded-xl">
              <Skeleton className="w-9 h-9 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="h-4 w-12" />
            </div>
          ))}
        </div>
      )}
      {!loadingList && listError && <ErrorBlock message={listError} onRetry={loadList} />}
      {!loadingList && !listError && filtered.length === 0 && <p className="text-center text-gray-500 py-10 text-sm">No customers found</p>}
      <div className="space-y-2">
        {!loadingList && !listError && filtered.map(c => (
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
function SupplierLedger({ canEdit, canDelete }: RightsProps) {
  const [suppliers, setSuppliers] = useState<SupplierSummary[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<SupplierLedgerDetail | null>(null)
  const [loadingList, setLoadingList] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [editBatch, setEditBatch] = useState<SupplierBatchRow | null>(null)
  const [editBatchNumber, setEditBatchNumber] = useState('')
  const [editImportDate, setEditImportDate] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editLines, setEditLines] = useState<Array<{ id: number; warehouse_name: string; packing_size: string; received: string; received_snapshot: number }>>([])
  const [editLinesLoading, setEditLinesLoading] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [deleteBatchId, setDeleteBatchId] = useState<number | null>(null)
  const [lightbox, setLightbox] = useState<{ src: string; title: string } | null>(null)
  const { add: toast } = useToast()

  const loadList = useCallback(() => {
    setLoadingList(true)
    setListError(null)
    api.getLedgerSuppliers()
      .then(setSuppliers)
      .catch(err => setListError(err instanceof Error ? err.message : 'Failed to load suppliers'))
      .finally(() => setLoadingList(false))
  }, [])

  useEffect(() => { loadList() }, [loadList])

  const filtered = useMemo(() =>
    suppliers.filter(s =>
      s.supplier_name.toLowerCase().includes(search.toLowerCase()) ||
      s.contact_number.includes(search)
    ), [suppliers, search])

  const openDetail = async (id: number) => {
    setLoadingDetail(true)
    try {
      const detail = await api.getLedgerSupplier(id)
      setSelected(detail)
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to load supplier', 'err')
    }
    setLoadingDetail(false)
  }

  const reloadDetail = async () => {
    if (!selected) return
    const detail = await api.getLedgerSupplier(selected.supplier.id)
    setSelected(detail)
  }

  const openEditBatch = async (b: SupplierBatchRow) => {
    setEditBatch(b)
    setEditBatchNumber(b.batch_number)
    setEditImportDate(b.import_date)
    setEditNotes('')
    setEditLines([])
    setEditLinesLoading(true)
    try {
      const allBatches = await api.getInwardBatches()
      const match = allBatches.find(ib => ib.id === b.batch_id)
      setEditLines((match?.inventory ?? []).map(l => ({
        id: l.id,
        warehouse_name: l.warehouse_name,
        packing_size: l.packing_size,
        received: String(l.original_quantity),
        received_snapshot: l.original_quantity,
      })))
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to load inventory lines', 'err')
    }
    setEditLinesLoading(false)
  }

  const handleEditBatchSave = async () => {
    if (!editBatch || !selected) return
    setEditSaving(true)
    try {
      await api.updateInwardBatch(editBatch.batch_id, {
        batch_number: editBatchNumber,
        import_date: editImportDate,
        notes: editNotes,
        supplier_id: selected.supplier.id,
        lines: editLines.map(l => ({
          id: l.id,
          received: Number(l.received),
          received_snapshot: l.received_snapshot,
        })),
      })
      toast('Batch updated', 'ok')
      setEditBatch(null)
      await reloadDetail()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Update failed', 'err')
    }
    setEditSaving(false)
  }

  const handleDeleteBatch = async () => {
    if (deleteBatchId == null) return
    try {
      await api.deleteInwardBatch(deleteBatchId)
      toast('Batch deleted', 'ok')
      setDeleteBatchId(null)
      await reloadDetail()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Delete failed', 'err')
      setDeleteBatchId(null)
    }
  }

  if (selected) {
    const { supplier, batches, totals } = selected

    const activeBatches = batches.filter(b => b.batch_status === 'Active').length
    const depletedBatches = batches.filter(b => b.batch_status === 'Depleted').length

    const handlePrint = () => {
      const rows = batches.map(b => `
        <tr>
          <td class="bold">${b.color_name}</td>
          <td class="mono sm">${b.batch_number}</td>
          <td>${new Date(b.import_date).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}</td>
          <td class="sm">${b.pack_sizes ?? '—'}</td>
          <td class="sm">${b.warehouses ?? '—'}</td>
          <td class="bold center">${b.received.toLocaleString()}</td>
          <td class="center">${b.current_stock.toLocaleString()}</td>
          <td><span class="badge badge-${b.batch_status.toLowerCase()}">${b.batch_status}</span></td>
        </tr>`).join('')

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Supplier Ledger — ${supplier.supplier_name}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; background: #fff; font-size: 11px; line-height: 1.4; }
  .page { padding: 24px 28px; }
  /* Header */
  .header { display: flex; align-items: flex-start; justify-content: space-between; padding-bottom: 14px; border-bottom: 2.5px solid #1a1a1a; margin-bottom: 16px; }
  .company-name { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; color: #111; }
  .report-title { font-size: 12px; color: #555; margin-top: 2px; font-weight: 500; }
  .header-right { text-align: right; }
  .header-right .label { font-size: 9px; color: #888; text-transform: uppercase; letter-spacing: 0.08em; }
  .header-right .value { font-size: 13px; font-weight: 700; margin-top: 1px; }
  .header-right .sub { font-size: 10px; color: #555; margin-top: 2px; }
  /* Supplier info */
  .customer-bar { display: flex; justify-content: space-between; align-items: center; background: #f5f5f5; border-radius: 8px; padding: 10px 14px; margin-bottom: 14px; }
  .customer-name { font-size: 16px; font-weight: 700; }
  .customer-contact { font-size: 11px; color: #555; margin-top: 2px; }
  /* Summary grid */
  .summary { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 16px; }
  .stat { border: 1px solid #e0e0e0; border-radius: 8px; padding: 10px 12px; text-align: center; }
  .stat .num { font-size: 20px; font-weight: 800; line-height: 1; }
  .stat .lbl { font-size: 9px; color: #777; text-transform: uppercase; letter-spacing: 0.07em; margin-top: 4px; }
  .num-green { color: #16a34a; }
  .num-gray  { color: #6b7280; }
  /* Table */
  .section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #555; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; }
  thead tr { background: #1a1a1a; }
  th { padding: 7px 10px; text-align: left; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: #fff; }
  td { padding: 7px 10px; border-bottom: 1px solid #f0f0f0; vertical-align: middle; }
  tr:nth-child(even) td { background: #fafafa; }
  tr:last-child td { border-bottom: none; }
  .mono { font-family: 'Courier New', monospace; }
  .sm { font-size: 10px; color: #444; }
  .bold { font-weight: 700; }
  .center { text-align: center; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 9px; font-weight: 700; letter-spacing: 0.04em; }
  .badge-active   { background: #d1fae5; color: #065f46; }
  .badge-depleted { background: #f3f4f6; color: #4b5563; }
  /* Footer */
  .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #ddd; display: flex; justify-content: space-between; font-size: 9px; color: #aaa; }
  .no-orders { text-align: center; padding: 30px; color: #999; font-style: italic; }
  @media print {
    body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    @page { margin: 12mm 14mm; size: A4 landscape; }
    .page { padding: 0; }
  }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      <div class="company-name">Glass Beads WMS</div>
      <div class="report-title">Supplier Ledger Report</div>
    </div>
    <div class="header-right">
      <div class="label">Generated</div>
      <div class="value">${new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}</div>
      <div class="sub">${new Date().toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' })}</div>
    </div>
  </div>

  <div class="customer-bar">
    <div>
      <div class="customer-name">${supplier.supplier_name}</div>
      ${[supplier.contact_number, supplier.address].filter(Boolean).length ? `<div class="customer-contact">${[supplier.contact_number, supplier.address].filter(Boolean).join(' · ')}</div>` : ''}
    </div>
  </div>

  <div class="summary">
    <div class="stat"><div class="num">${totals.total_batches}</div><div class="lbl">Total Batches</div></div>
    <div class="stat"><div class="num">${totals.received_bags.toLocaleString()}</div><div class="lbl">Received (bags)</div></div>
    <div class="stat"><div class="num">${totals.current_stock_bags.toLocaleString()}</div><div class="lbl">Current Stock (bags)</div></div>
    <div class="stat"><div class="num num-green">${activeBatches}</div><div class="lbl">Active</div></div>
    <div class="stat"><div class="num num-gray">${depletedBatches}</div><div class="lbl">Depleted</div></div>
  </div>

  <div class="section-title">Inward Batches (${batches.length})</div>
  ${batches.length === 0
    ? '<div class="no-orders">No inward batches linked to this supplier yet.</div>'
    : `<table>
    <thead>
      <tr>
        <th>Item</th><th>Batch</th><th>Import Date</th><th>Pack Sizes</th>
        <th>Warehouses</th><th style="text-align:center">Received</th><th style="text-align:center">Current Stock</th><th>Status</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`}

  <div class="footer">
    <span>Glass Beads WMS — Confidential</span>
    <span>Supplier: ${supplier.supplier_name}</span>
    <span>Page 1</span>
  </div>
</div>
</body>
</html>`

      printHtmlDocument(html)
    }

    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setSelected(null)}
            className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors">
            <Ic.Left /> All Suppliers
          </button>
          <div className="flex gap-2">
            <button onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-xs font-medium transition-colors">
              <Ic.Print /> Print
            </button>
            <button onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-xs font-medium transition-colors">
              <Ic.FilePdf /> PDF
            </button>
          </div>
        </div>
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
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: 'Batches Supplied', value: totals.total_batches, color: 'text-white' },
            { label: 'Received (bags)', value: totals.received_bags.toLocaleString(), color: 'text-blue-400' },
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
                    {['ITEM', 'BATCH', 'IMPORT DATE', 'PACK SIZES', 'WAREHOUSES', 'RECEIVED', 'CURRENT STOCK', 'STATUS'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                    {(canEdit || canDelete) && <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-400 tracking-wider">ACTIONS</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {batches.map(b => (
                    <tr key={b.batch_id} className="hover:bg-gray-800/40 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {b.item_image
                            ? <img src={b.item_image}
                                className="w-7 h-7 rounded object-cover border border-gray-700 flex-shrink-0 cursor-zoom-in hover:opacity-80 transition-opacity"
                                onClick={() => setLightbox({ src: b.item_image!, title: b.color_name })} />
                            : <div className="w-7 h-7 rounded bg-gray-700 flex-shrink-0" />}
                          <span className="text-sm text-white font-medium">{b.color_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-gray-300">{b.batch_number}</td>
                      <td className="px-4 py-3 text-xs text-gray-300 whitespace-nowrap">{b.import_date}</td>
                      <td className="px-4 py-3 text-xs text-gray-400">{b.pack_sizes ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-400">{b.warehouses ?? '—'}</td>
                      <td className="px-4 py-3 text-sm font-bold text-blue-400">{b.received.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm font-bold text-white">{b.current_stock.toLocaleString()}</td>
                      <td className="px-4 py-3"><StatusBadge status={b.batch_status} /></td>
                      {(canEdit || canDelete) && (
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {canEdit && (
                              <button onClick={() => openEditBatch(b)} title="Edit batch"
                                className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-blue-900/20 rounded transition-colors">
                                <Ic.Pencil />
                              </button>
                            )}
                            {canDelete && (
                              <button onClick={() => setDeleteBatchId(b.batch_id)} title="Delete batch"
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
          )}
        </div>

        {editBatch && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
            <div className="bg-gray-900 border border-blue-800/50 rounded-xl p-6 max-w-md w-full shadow-2xl">
              <p className="text-sm font-semibold text-white mb-1">Edit Batch <span className="font-mono text-blue-400">{editBatch.batch_number}</span></p>
              <p className="text-xs text-gray-400 mb-4">{editBatch.color_name}</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">Batch Number</label>
                  <input type="text" value={editBatchNumber} onChange={e => setEditBatchNumber(e.target.value)}
                    className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">Import Date</label>
                  <input type="date" value={editImportDate} onChange={e => setEditImportDate(e.target.value)}
                    className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">Notes</label>
                  <input type="text" value={editNotes} onChange={e => setEditNotes(e.target.value)}
                    placeholder="Optional"
                    className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">Received Quantity</label>
                  {editLinesLoading ? (
                    <p className="text-xs text-gray-500">Loading inventory lines…</p>
                  ) : editLines.length === 0 ? (
                    <p className="text-xs text-gray-500">No inventory lines found for this batch.</p>
                  ) : (
                    <div className="space-y-2">
                      {editLines.map((l, idx) => (
                        <div key={l.id} className="flex items-center gap-2 bg-gray-800/60 border border-gray-700 rounded-lg px-3 py-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-gray-300 truncate">{l.warehouse_name}</p>
                            <p className="text-xs text-gray-500">{l.packing_size}</p>
                          </div>
                          <input type="number" min="0" value={l.received}
                            onChange={e => {
                              const v = e.target.value
                              setEditLines(prev => prev.map((row, i) => i === idx ? { ...row, received: v } : row))
                            }}
                            className="w-24 px-2.5 py-1.5 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white text-right focus:outline-none focus:border-blue-500" />
                        </div>
                      ))}
                      <p className="text-xs text-gray-500">
                        Correcting this also adjusts current stock by the same amount — e.g. raising it by 2 assumes those 2 bags are still on hand.
                      </p>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-2 mt-5">
                <button onClick={() => setEditBatch(null)}
                  className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm font-medium transition-colors">Cancel</button>
                <button onClick={handleEditBatchSave}
                  disabled={editSaving || editLinesLoading || !editBatchNumber.trim() || !editImportDate.trim() || editLines.some(l => l.received === '' || Number(l.received) < 0)}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors">
                  {editSaving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}

        {deleteBatchId !== null && (
          <ConfirmDialog
            message="Delete this batch and all its inventory lines? This cannot be undone."
            danger
            onConfirm={handleDeleteBatch}
            onCancel={() => setDeleteBatchId(null)}
          />
        )}

        {lightbox && (
          <Lightbox src={lightbox.src} title={lightbox.title} onClose={() => setLightbox(null)} />
        )}
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
      {loadingList && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 bg-gray-900 border border-gray-800 rounded-xl">
              <Skeleton className="w-9 h-9 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="h-4 w-12" />
            </div>
          ))}
        </div>
      )}
      {!loadingList && listError && <ErrorBlock message={listError} onRetry={loadList} />}
      {!loadingList && !listError && filtered.length === 0 && <p className="text-center text-gray-500 py-10 text-sm">No suppliers found</p>}
      <div className="space-y-2">
        {!loadingList && !listError && filtered.map(s => (
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
              <p className="text-sm font-bold text-white">{s.received_bags.toLocaleString()} <span className="text-xs font-normal text-gray-500">received</span></p>
              <p className="text-xs text-gray-500">{s.total_batches} batches · {s.current_stock_bags.toLocaleString()} in stock</p>
            </div>
            <Ic.ChevronRight />
          </button>
        ))}
      </div>
    </div>
  )
}

/* ── Warehouse Transfer Report ── */
function TransferReport({ canEdit, canDelete }: RightsProps) {
  const [transfers, setTransfers] = useState<TransferRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [editTransfer, setEditTransfer] = useState<TransferRecord | null>(null)
  const [editBags, setEditBags] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [deleteTransferId, setDeleteTransferId] = useState<number | null>(null)
  const { add: toast } = useToast()

  const load = useCallback(() => {
    setLoading(true)
    setLoadError(null)
    api.getTransfers()
      .then(setTransfers)
      .catch(err => setLoadError(err instanceof Error ? err.message : 'Failed to load transfers'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const reload = async () => {
    const rows = await api.getTransfers()
    setTransfers(rows)
  }

  const openEdit = (t: TransferRecord) => {
    setEditTransfer(t)
    setEditBags(String(t.bags))
    setEditNotes(t.notes)
  }

  const handleEditSave = async () => {
    if (!editTransfer) return
    setEditSaving(true)
    try {
      await api.updateTransfer(editTransfer.id, { bags: Number(editBags), notes: editNotes })
      toast('Transfer updated', 'ok')
      setEditTransfer(null)
      await reload()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Update failed', 'err')
    }
    setEditSaving(false)
  }

  const handleDelete = async () => {
    if (deleteTransferId == null) return
    try {
      await api.deleteTransfer(deleteTransferId)
      toast('Transfer deleted', 'ok')
      setDeleteTransferId(null)
      await reload()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Delete failed', 'err')
      setDeleteTransferId(null)
    }
  }

  const filtered = useMemo(() =>
    transfers.filter(t => {
      const matchesSearch =
        t.color_name.toLowerCase().includes(search.toLowerCase()) ||
        t.batch_number.toLowerCase().includes(search.toLowerCase()) ||
        t.from_warehouse_name.toLowerCase().includes(search.toLowerCase()) ||
        t.to_warehouse_name.toLowerCase().includes(search.toLowerCase())
      const d = t.transferred_at.slice(0, 10)
      if (fromDate && d < fromDate) return false
      if (toDate && d > toDate) return false
      return matchesSearch
    }), [transfers, search, fromDate, toDate])

  const totals = {
    total_transfers: filtered.length,
    total_bags: filtered.reduce((s, t) => s + t.bags, 0),
  }

  const handlePrint = () => {
    const period = fromDate || toDate
      ? `${fromDate ? new Date(fromDate).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : 'Start'} — ${toDate ? new Date(toDate).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : 'Today'}`
      : 'All Time'

    const rows = filtered.map(t => `
      <tr>
        <td>${new Date(t.transferred_at).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}</td>
        <td class="bold">${t.color_name}</td>
        <td class="mono sm">${t.batch_number}</td>
        <td>${t.packing_size}</td>
        <td class="bold center">${t.bags}</td>
        <td class="sm">${t.from_warehouse_name}</td>
        <td class="sm">${t.to_warehouse_name}</td>
        <td class="sm">${t.notes || ''}</td>
      </tr>`).join('')

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Warehouse Transfer Report</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; background: #fff; font-size: 11px; line-height: 1.4; }
  .page { padding: 24px 28px; }
  .header { display: flex; align-items: flex-start; justify-content: space-between; padding-bottom: 14px; border-bottom: 2.5px solid #1a1a1a; margin-bottom: 16px; }
  .company-name { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; color: #111; }
  .report-title { font-size: 12px; color: #555; margin-top: 2px; font-weight: 500; }
  .header-right { text-align: right; }
  .header-right .label { font-size: 9px; color: #888; text-transform: uppercase; letter-spacing: 0.08em; }
  .header-right .value { font-size: 13px; font-weight: 700; margin-top: 1px; }
  .header-right .sub { font-size: 10px; color: #555; margin-top: 2px; }
  .period-bar { display: flex; justify-content: flex-end; margin-bottom: 14px; }
  .period-tag { background: #1a1a1a; color: #fff; padding: 4px 12px; border-radius: 20px; font-size: 10px; font-weight: 600; letter-spacing: 0.03em; }
  .summary { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 16px; }
  .stat { border: 1px solid #e0e0e0; border-radius: 8px; padding: 10px 12px; text-align: center; }
  .stat .num { font-size: 20px; font-weight: 800; line-height: 1; }
  .stat .lbl { font-size: 9px; color: #777; text-transform: uppercase; letter-spacing: 0.07em; margin-top: 4px; }
  .section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #555; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; }
  thead tr { background: #1a1a1a; }
  th { padding: 7px 10px; text-align: left; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: #fff; }
  td { padding: 7px 10px; border-bottom: 1px solid #f0f0f0; vertical-align: middle; }
  tr:nth-child(even) td { background: #fafafa; }
  tr:last-child td { border-bottom: none; }
  .mono { font-family: 'Courier New', monospace; }
  .sm { font-size: 10px; color: #444; }
  .bold { font-weight: 700; }
  .center { text-align: center; }
  .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #ddd; display: flex; justify-content: space-between; font-size: 9px; color: #aaa; }
  .no-rows { text-align: center; padding: 30px; color: #999; font-style: italic; }
  @media print {
    body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    @page { margin: 12mm 14mm; size: A4 landscape; }
    .page { padding: 0; }
  }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      <div class="company-name">Glass Beads WMS</div>
      <div class="report-title">Warehouse Transfer Report</div>
    </div>
    <div class="header-right">
      <div class="label">Generated</div>
      <div class="value">${new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}</div>
      <div class="sub">${new Date().toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' })}</div>
    </div>
  </div>

  <div class="period-bar"><span class="period-tag">${period}</span></div>

  <div class="summary">
    <div class="stat"><div class="num">${totals.total_transfers}</div><div class="lbl">Total Transfers</div></div>
    <div class="stat"><div class="num">${totals.total_bags.toLocaleString()}</div><div class="lbl">Bags Transferred</div></div>
  </div>

  <div class="section-title">Transfers (${filtered.length})</div>
  ${filtered.length === 0
    ? '<div class="no-rows">No transfers for the selected period.</div>'
    : `<table>
    <thead>
      <tr>
        <th>Date</th><th>Item</th><th>Batch</th><th>Pack Size</th>
        <th style="text-align:center">Bags</th><th>From</th><th>To</th><th>Notes</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`}

  <div class="footer">
    <span>Glass Beads WMS — Confidential</span>
    <span>Period: ${period}</span>
    <span>Page 1</span>
  </div>
</div>
</body>
</html>`

    printHtmlDocument(html)
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-48">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"><Ic.Search /></span>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search item, batch, or warehouse…"
            className="w-full pl-9 pr-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">From</label>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
            className="px-2.5 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">To</label>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
            className="px-2.5 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500" />
        </div>
        {(fromDate || toDate) && (
          <button onClick={() => { setFromDate(''); setToDate('') }}
            className="text-xs text-gray-500 hover:text-white px-2 py-1 rounded transition-colors">
            Clear
          </button>
        )}
        <div className="flex gap-2 ml-auto">
          <button onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-xs font-medium transition-colors">
            <Ic.Print /> Print
          </button>
          <button onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-xs font-medium transition-colors">
            <Ic.FilePdf /> PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-2 gap-3 mb-5 max-w-md">
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-center">
          <p className="text-xl font-bold text-white">{totals.total_transfers}</p>
          <p className="text-xs text-gray-500 mt-0.5">Total Transfers</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-center">
          <p className="text-xl font-bold text-white">{totals.total_bags.toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-0.5">Bags Transferred</p>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Transfers ({filtered.length})</p>
        </div>
        {loading && (
          <div className="divide-y divide-gray-800">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="px-4 py-3 flex items-center gap-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-16 ml-auto" />
              </div>
            ))}
          </div>
        )}
        {!loading && loadError && <ErrorBlock message={loadError} onRetry={load} />}
        {!loading && !loadError && filtered.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-gray-500">
            {transfers.length === 0 ? 'No transfers recorded yet' : 'No transfers match your filters'}
          </p>
        )}
        {!loading && !loadError && filtered.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-800/60 border-b border-gray-800">
                  {['DATE', 'ITEM', 'BATCH', 'PACK', 'BAGS', 'FROM', 'TO', 'NOTES'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                  {(canEdit || canDelete) && <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-400 tracking-wider">ACTIONS</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {filtered.map(t => (
                  <tr key={t.id} className="hover:bg-gray-800/40 transition-colors">
                    <td className="px-4 py-3 text-xs text-gray-300 whitespace-nowrap">{new Date(t.transferred_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-sm text-white font-medium">{t.color_name}</td>
                    <td className="px-4 py-3 text-xs font-mono text-gray-300">{t.batch_number}</td>
                    <td className="px-4 py-3 text-xs text-gray-300">{t.packing_size}</td>
                    <td className="px-4 py-3 text-sm font-bold text-white">{t.bags}</td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                      <span className="px-1.5 py-0.5 rounded bg-blue-900/30 text-blue-300 border border-blue-800/60">{t.from_warehouse_name}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                      <span className="px-1.5 py-0.5 rounded bg-purple-900/30 text-purple-300 border border-purple-800/60">{t.to_warehouse_name}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{t.notes || '—'}</td>
                    {(canEdit || canDelete) && (
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {canEdit && (
                            <button onClick={() => openEdit(t)} title="Edit transfer"
                              className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-blue-900/20 rounded transition-colors">
                              <Ic.Pencil />
                            </button>
                          )}
                          {canDelete && (
                            <button onClick={() => setDeleteTransferId(t.id)} title="Delete transfer"
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
        )}
      </div>

      {editTransfer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="bg-gray-900 border border-blue-800/50 rounded-xl p-6 max-w-sm w-full shadow-2xl">
            <p className="text-sm font-semibold text-white mb-1">Edit Transfer</p>
            <p className="text-xs text-gray-400 mb-4">
              {editTransfer.color_name} · {editTransfer.batch_number} · {editTransfer.from_warehouse_name} → {editTransfer.to_warehouse_name}
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">Bags</label>
                <input type="number" min="1" value={editBags} onChange={e => setEditBags(e.target.value)}
                  className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">Notes</label>
                <input type="text" value={editNotes} onChange={e => setEditNotes(e.target.value)}
                  placeholder="Optional"
                  className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setEditTransfer(null)}
                className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm font-medium transition-colors">Cancel</button>
              <button onClick={handleEditSave} disabled={editSaving || !editBags || Number(editBags) < 1}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors">
                {editSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTransferId !== null && (
        <ConfirmDialog
          message="Delete this transfer? Stock will be reversed back to the source warehouse."
          danger
          onConfirm={handleDelete}
          onCancel={() => setDeleteTransferId(null)}
        />
      )}
    </div>
  )
}

/* ── Daily Report ── */
function DailyReport() {
  const today = todayISO()
  const [fromDate, setFromDate] = useState(today)
  const [toDate, setToDate] = useState(today)
  const [data, setData] = useState<DailyReportResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<{ src: string; title: string } | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const toggleExpand = (key: string) => setExpandedGroups(prev => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  const load = async (from: string, to: string) => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await api.getDailyReport(from, to)
      setData(res)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load daily report')
    }
    setLoading(false)
  }

  useEffect(() => { load(fromDate, toDate) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const applyRange = (from: string, to: string) => {
    setFromDate(from)
    setToDate(to)
    load(from, to)
  }

  const setToday = () => applyRange(today, today)

  const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

  const period = fromDate === toDate
    ? fmtDate(fromDate)
    : `${fmtDate(fromDate)} — ${fmtDate(toDate)}`

  // Lines from the same cart order (see "Group multi-item dispatch orders" in CLAUDE.md) are
  // grouped so a multi-item delivery reads as one order in the Outward Stock table.
  const groupedOutward = useMemo(() => data ? groupByOrder(data.outward) : [], [data])

  const handlePrint = () => {
    if (!data) return
    const inwardRows = data.inward.map(b => `
      <tr>
        <td>${fmtDate(b.import_date)}</td>
        <td class="bold">${b.color_name}</td>
        <td class="mono sm">${b.batch_number}</td>
        <td class="sm">${b.supplier_name ?? '—'}</td>
        <td class="sm">${b.lines.map(l => `${l.warehouse_name} (${l.packing_size}): ${l.quantity_in_stock}`).join(', ')}</td>
        <td class="bold center">${b.total_bags}</td>
      </tr>`).join('')

    const outwardRow = (o: DailyOutwardRow) => `
      <tr>
        <td>${fmtDate(o.created_at)}</td>
        <td class="bold">${o.color_name}</td>
        <td class="mono sm">${o.batch_number}</td>
        <td class="sm">${o.customer_name}</td>
        <td class="sm">${o.warehouse_name}</td>
        <td>${o.packing_size}</td>
        <td class="bold center">${o.bags_dispatched}</td>
        <td><span class="badge badge-${o.status.toLowerCase()}">${o.status}</span></td>
      </tr>`

    // Multi-item orders (a cart submitted together) get a header row so a delivery reads as one
    // order, not several unrelated line items — see "Group multi-item dispatch orders" in CLAUDE.md.
    const outwardRows = groupByOrder(data.outward).map(({ items }) => items.length === 1
      ? outwardRow(items[0])
      : `
      <tr class="order-header"><td colspan="8">Order ${items.map(o => `DIS-${o.id}`).join(', ')} — ${items.length} items</td></tr>
      ${items.map(outwardRow).join('')}`
    ).join('')

    const transferRows = data.transfers.map(t => `
      <tr>
        <td>${fmtDate(t.transferred_at)}</td>
        <td class="bold">${t.color_name}</td>
        <td class="mono sm">${t.batch_number}</td>
        <td>${t.packing_size}</td>
        <td class="bold center">${t.bags}</td>
        <td class="sm">${t.from_warehouse_name}</td>
        <td class="sm">${t.to_warehouse_name}</td>
        <td class="sm">${t.notes || ''}</td>
      </tr>`).join('')

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Daily Report</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; background: #fff; font-size: 11px; line-height: 1.4; }
  .page { padding: 24px 28px; }
  .header { display: flex; align-items: flex-start; justify-content: space-between; padding-bottom: 14px; border-bottom: 2.5px solid #1a1a1a; margin-bottom: 16px; }
  .company-name { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; color: #111; }
  .report-title { font-size: 12px; color: #555; margin-top: 2px; font-weight: 500; }
  .header-right { text-align: right; }
  .header-right .label { font-size: 9px; color: #888; text-transform: uppercase; letter-spacing: 0.08em; }
  .header-right .value { font-size: 13px; font-weight: 700; margin-top: 1px; }
  .header-right .sub { font-size: 10px; color: #555; margin-top: 2px; }
  .period-bar { display: flex; justify-content: flex-end; margin-bottom: 14px; }
  .period-tag { background: #1a1a1a; color: #fff; padding: 4px 12px; border-radius: 20px; font-size: 10px; font-weight: 600; letter-spacing: 0.03em; }
  .summary { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin-bottom: 18px; }
  .stat { border: 1px solid #e0e0e0; border-radius: 8px; padding: 10px 12px; text-align: center; }
  .stat .num { font-size: 18px; font-weight: 800; line-height: 1; }
  .stat .lbl { font-size: 8px; color: #777; text-transform: uppercase; letter-spacing: 0.06em; margin-top: 4px; }
  .section { margin-bottom: 20px; }
  .section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #555; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; }
  thead tr { background: #1a1a1a; }
  th { padding: 7px 10px; text-align: left; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: #fff; }
  td { padding: 7px 10px; border-bottom: 1px solid #f0f0f0; vertical-align: middle; }
  tr:nth-child(even) td { background: #fafafa; }
  tr:last-child td { border-bottom: none; }
  .mono { font-family: 'Courier New', monospace; }
  .sm { font-size: 10px; color: #444; }
  .bold { font-weight: 700; }
  .center { text-align: center; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 9px; font-weight: 700; letter-spacing: 0.04em; }
  .badge-pending   { background: #fef3c7; color: #92400e; }
  .badge-picked    { background: #d1fae5; color: #065f46; }
  .order-header td { background: #f5f5f5 !important; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #555; padding: 5px 10px; }
  .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #ddd; display: flex; justify-content: space-between; font-size: 9px; color: #aaa; }
  .no-rows { text-align: center; padding: 20px; color: #999; font-style: italic; }
  @media print {
    body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    @page { margin: 12mm 14mm; size: A4 landscape; }
    .page { padding: 0; }
  }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      <div class="company-name">Glass Beads WMS</div>
      <div class="report-title">Daily Stock Movement Report</div>
    </div>
    <div class="header-right">
      <div class="label">Generated</div>
      <div class="value">${new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}</div>
      <div class="sub">${new Date().toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' })}</div>
    </div>
  </div>

  <div class="period-bar"><span class="period-tag">${period}</span></div>

  <div class="summary">
    <div class="stat"><div class="num">${data.totals.inward_batches}</div><div class="lbl">Inward Batches</div></div>
    <div class="stat"><div class="num">${data.totals.inward_bags.toLocaleString()}</div><div class="lbl">Inward Bags</div></div>
    <div class="stat"><div class="num">${data.totals.outward_orders}</div><div class="lbl">Outward Orders</div></div>
    <div class="stat"><div class="num">${data.totals.outward_bags.toLocaleString()}</div><div class="lbl">Outward Bags</div></div>
    <div class="stat"><div class="num">${data.totals.transfer_count}</div><div class="lbl">Transfers</div></div>
    <div class="stat"><div class="num">${data.totals.transfer_bags.toLocaleString()}</div><div class="lbl">Bags Transferred</div></div>
  </div>

  <div class="section">
    <div class="section-title">Inward Stock (${data.inward.length})</div>
    ${data.inward.length === 0 ? '<div class="no-rows">No inward stock in this period.</div>' : `<table>
      <thead><tr><th>Date</th><th>Item</th><th>Batch</th><th>Supplier</th><th>Breakdown</th><th style="text-align:center">Bags</th></tr></thead>
      <tbody>${inwardRows}</tbody>
    </table>`}
  </div>

  <div class="section">
    <div class="section-title">Outward Stock (${data.outward.length})</div>
    ${data.outward.length === 0 ? '<div class="no-rows">No outward stock in this period.</div>' : `<table>
      <thead><tr><th>Date</th><th>Item</th><th>Batch</th><th>Customer</th><th>Warehouse</th><th>Pack</th><th style="text-align:center">Bags</th><th>Status</th></tr></thead>
      <tbody>${outwardRows}</tbody>
    </table>`}
  </div>

  <div class="section">
    <div class="section-title">Warehouse Transfers (${data.transfers.length})</div>
    ${data.transfers.length === 0 ? '<div class="no-rows">No transfers in this period.</div>' : `<table>
      <thead><tr><th>Date</th><th>Item</th><th>Batch</th><th>Pack</th><th style="text-align:center">Bags</th><th>From</th><th>To</th><th>Notes</th></tr></thead>
      <tbody>${transferRows}</tbody>
    </table>`}
  </div>

  <div class="footer">
    <span>Glass Beads WMS — Confidential</span>
    <span>Period: ${period}</span>
    <span>Page 1</span>
  </div>
</div>
</body>
</html>`

    printHtmlDocument(html)
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-5 p-3 bg-gray-900 border border-gray-800 rounded-xl">
        <span className="text-xs text-gray-400 font-medium">Period:</span>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">From</label>
          <input type="date" value={fromDate} max={toDate} onChange={e => applyRange(e.target.value, toDate)}
            className="px-2.5 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">To</label>
          <input type="date" value={toDate} min={fromDate} onChange={e => applyRange(fromDate, e.target.value)}
            className="px-2.5 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500" />
        </div>
        {!(fromDate === today && toDate === today) && (
          <button onClick={setToday}
            className="text-xs text-blue-400 hover:text-blue-300 px-2 py-1 rounded transition-colors">
            Today
          </button>
        )}
        <div className="flex gap-2 ml-auto">
          <button onClick={handlePrint} disabled={!data}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-200 rounded-lg text-xs font-medium transition-colors">
            <Ic.Print /> Print
          </button>
          <button onClick={handlePrint} disabled={!data}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors">
            <Ic.FilePdf /> PDF
          </button>
        </div>
      </div>

      {loading && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl px-3 py-3 text-center">
              <Skeleton className="h-5 w-10 mx-auto mb-1.5" />
              <Skeleton className="h-3 w-14 mx-auto" />
            </div>
          ))}
        </div>
      )}
      {!loading && loadError && <ErrorBlock message={loadError} onRetry={() => load(fromDate, toDate)} />}

      {!loading && !loadError && data && (
        <>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-6">
            {[
              { label: 'Inward Batches', value: data.totals.inward_batches, color: 'text-white' },
              { label: 'Inward Bags', value: data.totals.inward_bags, color: 'text-emerald-400' },
              { label: 'Outward Orders', value: data.totals.outward_orders, color: 'text-white' },
              { label: 'Outward Bags', value: data.totals.outward_bags, color: 'text-amber-400' },
              { label: 'Transfers', value: data.totals.transfer_count, color: 'text-white' },
              { label: 'Transfer Bags', value: data.totals.transfer_bags, color: 'text-blue-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl px-3 py-3 text-center">
                <p className={`text-lg font-bold ${color}`}>{value.toLocaleString()}</p>
                <p className="text-xs text-gray-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* Inward */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden mb-5">
            <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
              <Ic.Download />
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Inward Stock ({data.inward.length})</p>
            </div>
            {data.inward.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-500">No inward stock in this period</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-800/60 border-b border-gray-800">
                      {['DATE', 'ITEM', 'BATCH', 'SUPPLIER', 'BREAKDOWN', 'BAGS'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {data.inward.map(b => (
                      <tr key={b.batch_id} className="hover:bg-gray-800/40 transition-colors">
                        <td className="px-4 py-3 text-xs text-gray-300 whitespace-nowrap">{fmtDate(b.import_date)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {b.item_image
                              ? <img src={b.item_image}
                                  className="w-7 h-7 rounded object-cover border border-gray-700 flex-shrink-0 cursor-zoom-in hover:opacity-80 transition-opacity"
                                  onClick={() => setLightbox({ src: b.item_image!, title: b.color_name })} />
                              : <div className="w-7 h-7 rounded bg-gray-700 flex-shrink-0" />}
                            <span className="text-sm text-white font-medium">{b.color_name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-gray-300">{b.batch_number}</td>
                        <td className="px-4 py-3 text-xs text-gray-400">{b.supplier_name ?? '—'}</td>
                        <td className="px-4 py-3 text-xs text-gray-500 max-w-xs truncate" title={b.lines.map(l => `${l.warehouse_name} (${l.packing_size}): ${l.quantity_in_stock}`).join(', ')}>
                          {b.lines.map(l => `${l.warehouse_name} (${l.packing_size}): ${l.quantity_in_stock}`).join(', ')}
                        </td>
                        <td className="px-4 py-3 text-sm font-bold text-emerald-400">{b.total_bags.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Outward */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden mb-5">
            <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
              <Ic.Upload />
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Outward Stock ({data.outward.length})</p>
            </div>
            {data.outward.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-500">No outward stock in this period</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-800/60 border-b border-gray-800">
                      {['DATE', 'ITEM', 'BATCH', 'CUSTOMER', 'WAREHOUSE', 'PACK', 'BAGS', 'STATUS'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {groupedOutward.map(({ key, items }) => {
                      const isGroup = items.length > 1
                      const expanded = expandedGroups.has(key)
                      const first = items[0]
                      const statuses = new Set(items.map(o => o.status))
                      return (
                        <Fragment key={key}>
                          {isGroup && (
                            <tr className="hover:bg-gray-800/40 transition-colors cursor-pointer" onClick={() => toggleExpand(key)}>
                              <td className="px-4 py-3 text-xs text-gray-300 whitespace-nowrap">{fmtDate(first.created_at)}</td>
                              <td className="px-4 py-3">
                                <span className="inline-flex items-center gap-1.5 text-sm text-white font-medium">
                                  {expanded ? <Ic.ChevronDown /> : <Ic.ChevronRight />}
                                  {items.length} items
                                  <span className="text-xs text-gray-500 font-mono font-normal">DIS-{first.id}</span>
                                </span>
                              </td>
                              <td className="px-4 py-3 text-xs text-gray-600">—</td>
                              <td className="px-4 py-3 text-xs text-gray-400">{first.customer_name}</td>
                              <td className="px-4 py-3 text-xs text-gray-600">—</td>
                              <td className="px-4 py-3 text-xs text-gray-600">—</td>
                              <td className="px-4 py-3 text-sm font-bold text-amber-400">{items.reduce((s, o) => s + o.bags_dispatched, 0).toLocaleString()}</td>
                              <td className="px-4 py-3">
                                {statuses.size === 1 ? <StatusBadge status={first.status} /> : <span className="text-xs text-gray-400">Mixed</span>}
                              </td>
                            </tr>
                          )}
                          {(!isGroup || expanded) && items.map(o => (
                            <tr key={o.id} className={`hover:bg-gray-800/40 transition-colors ${isGroup ? 'bg-gray-950/40' : ''}`}>
                              <td className="px-4 py-3 text-xs text-gray-300 whitespace-nowrap">{fmtDate(o.created_at)}</td>
                              <td className={`px-4 py-3 ${isGroup ? 'pl-9' : ''}`}>
                                <div className="flex items-center gap-2">
                                  {o.item_image
                                    ? <img src={o.item_image}
                                        className="w-7 h-7 rounded object-cover border border-gray-700 flex-shrink-0 cursor-zoom-in hover:opacity-80 transition-opacity"
                                        onClick={() => setLightbox({ src: o.item_image!, title: o.color_name })} />
                                    : <div className="w-7 h-7 rounded bg-gray-700 flex-shrink-0" />}
                                  <span className="text-sm text-white font-medium">{o.color_name}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-xs font-mono text-gray-300">{o.batch_number}</td>
                              <td className="px-4 py-3 text-xs text-gray-400">{o.customer_name}</td>
                              <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{o.warehouse_name}</td>
                              <td className="px-4 py-3 text-xs text-gray-300">{o.packing_size}</td>
                              <td className="px-4 py-3 text-sm font-bold text-amber-400">{o.bags_dispatched.toLocaleString()}</td>
                              <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                            </tr>
                          ))}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Transfers */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
              <Ic.Transfer />
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Warehouse Transfers ({data.transfers.length})</p>
            </div>
            {data.transfers.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-500">No transfers in this period</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-800/60 border-b border-gray-800">
                      {['DATE', 'ITEM', 'BATCH', 'PACK', 'BAGS', 'FROM', 'TO', 'NOTES'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {data.transfers.map(t => (
                      <tr key={t.id} className="hover:bg-gray-800/40 transition-colors">
                        <td className="px-4 py-3 text-xs text-gray-300 whitespace-nowrap">{fmtDate(t.transferred_at)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {t.item_image
                              ? <img src={t.item_image}
                                  className="w-7 h-7 rounded object-cover border border-gray-700 flex-shrink-0 cursor-zoom-in hover:opacity-80 transition-opacity"
                                  onClick={() => setLightbox({ src: t.item_image!, title: t.color_name })} />
                              : <div className="w-7 h-7 rounded bg-gray-700 flex-shrink-0" />}
                            <span className="text-sm text-white font-medium">{t.color_name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-gray-300">{t.batch_number}</td>
                        <td className="px-4 py-3 text-xs text-gray-300">{t.packing_size}</td>
                        <td className="px-4 py-3 text-sm font-bold text-blue-400">{t.bags}</td>
                        <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                          <span className="px-1.5 py-0.5 rounded bg-blue-900/30 text-blue-300 border border-blue-800/60">{t.from_warehouse_name}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                          <span className="px-1.5 py-0.5 rounded bg-purple-900/30 text-purple-300 border border-purple-800/60">{t.to_warehouse_name}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">{t.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {lightbox && (
        <Lightbox src={lightbox.src} title={lightbox.title} onClose={() => setLightbox(null)} />
      )}
    </div>
  )
}

/* ── Report Page ── */
type ReportTab = 'daily' | 'customers' | 'suppliers' | 'transfers'

export default function ReportPage({ canEdit, canDelete }: RightsProps) {
  const [reportTab, setReportTab] = useState<ReportTab>('daily')

  return (
    <main className="max-w-5xl mx-auto px-4 py-6 w-full">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-white tracking-tight">Reports</h1>
        <p className="text-sm text-gray-400 mt-0.5">Daily movement, customer, supplier, and warehouse transfer reports</p>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {([
          { key: 'daily',     label: 'Daily Report',      icon: <Ic.Clipboard /> },
          { key: 'customers', label: 'Customer Ledger',    icon: <Ic.User />     },
          { key: 'suppliers', label: 'Supplier Ledger',    icon: <Ic.Truck />    },
          { key: 'transfers', label: 'Warehouse Transfers', icon: <Ic.Transfer /> },
        ] as { key: ReportTab; label: string; icon: React.ReactNode }[]).map(t => (
          <button key={t.key} onClick={() => setReportTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${reportTab === t.key ? 'bg-rose-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {reportTab === 'daily' && <DailyReport />}
      {reportTab === 'customers' && <CustomerLedger canEdit={canEdit} canDelete={canDelete} />}
      {reportTab === 'suppliers' && <SupplierLedger canEdit={canEdit} canDelete={canDelete} />}
      {reportTab === 'transfers' && <TransferReport canEdit={canEdit} canDelete={canDelete} />}
    </main>
  )
}
