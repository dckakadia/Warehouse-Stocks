const BASE = '/api'

/* ── Auth state shared with request() without React coupling ── */
let _token: string | null = sessionStorage.getItem('wms_token')
let _onUnauthorized: (() => void) | null = null

export function setAuthToken(token: string | null) {
  _token = token
  if (token) sessionStorage.setItem('wms_token', token)
  else sessionStorage.removeItem('wms_token')
}

export function getStoredToken(): string | null {
  return sessionStorage.getItem('wms_token')
}

export function setUnauthorizedCallback(fn: () => void) {
  _onUnauthorized = fn
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const tok = _token ?? sessionStorage.getItem('wms_token')
  if (tok) headers['Authorization'] = `Bearer ${tok}`

  const res = await fetch(BASE + path, { headers, ...options })

  if (res.status === 401) {
    _onUnauthorized?.()
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error ?? 'Session expired. Please log in again.')
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

/* ── Auth ── */
export interface LoginResponse {
  token: string
  user: {
    id: number
    username: string
    role: 'manager' | 'helper'
    can_view: number
    can_edit: number
    can_delete: number
  }
}

export const login = (username: string, password: string) =>
  fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  }).then(async res => {
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
    return body as LoginResponse
  })

/* ── Inventory ── */
export const getInventory    = () => request<InventoryRow[]>('/inventory')
export const getColors       = () => request<ColorRow[]>('/inventory/colors')
export const getStockSummary = () => request<StockSummary[]>('/inventory/summary')
export const getBatches      = (colorName: string, warehouseId?: number) =>
  request<BatchRow[]>(`/inventory/batches?colorName=${encodeURIComponent(colorName)}${warehouseId ? `&warehouseId=${warehouseId}` : ''}`)

/* ── Customers ── */
export const getCustomers  = () => request<Customer[]>('/customers')
export const createCustomer = (customer_name: string, contact_number: string) =>
  request<Customer>('/customers', { method: 'POST', body: JSON.stringify({ customer_name, contact_number }) })
export const getRecommendedBatch = (customerId: number, colorName: string) =>
  request<{ recommended: RecommendedBatch | null }>(`/customers/${customerId}/recommended-batch?colorName=${encodeURIComponent(colorName)}`)

/* ── Dispatch ── */
export const getDispatchOrders = (status?: string) =>
  request<DispatchOrder[]>(`/dispatch${status ? `?status=${status}` : ''}`)
export const createDispatchOrder = (body: CreateDispatchBody) =>
  request<DispatchOrder>('/dispatch', { method: 'POST', body: JSON.stringify(body) })
export const confirmPickedOrder = (id: number) =>
  request<{ success: boolean }>(`/dispatch/${id}/confirm`, { method: 'PUT' })
export const cancelDispatchOrder = (id: number) =>
  request<{ success: boolean }>(`/dispatch/${id}/cancel`, { method: 'PUT' })

/* ── Inwarding ── */
export const inwardStock = (body: InwardBody) =>
  request<unknown>('/inward', { method: 'POST', body: JSON.stringify(body) })

/* ── Transfers ── */
export const createTransfer = (body: TransferBody) =>
  request<unknown>('/transfers', { method: 'POST', body: JSON.stringify(body) })
export const getTransfers = () =>
  request<TransferRecord[]>('/transfers')

/* ── Masters ── */
export const getItems      = () => request<Item[]>('/masters/items')
export const createItem    = (b: Omit<Item,'id'|'batch_numbers'>) => request<Item>('/masters/items', { method: 'POST', body: JSON.stringify(b) })
export const updateItem    = (id: number, b: Omit<Item,'id'|'batch_numbers'>) => request<{success:boolean}>(`/masters/items/${id}`, { method: 'PUT', body: JSON.stringify(b) })
export const deleteItem    = (id: number) => request<{success:boolean}>(`/masters/items/${id}`, { method: 'DELETE' })

export const getMasterCustomers = () => request<Customer[]>('/masters/customers')
export const updateCustomer     = (id: number, b: Omit<Customer,'id'>) => request<{success:boolean}>(`/masters/customers/${id}`, { method: 'PUT', body: JSON.stringify(b) })
export const deleteCustomer     = (id: number) => request<{success:boolean}>(`/masters/customers/${id}`, { method: 'DELETE' })

export const getSuppliers   = () => request<Supplier[]>('/masters/suppliers')
export const createSupplier = (b: Omit<Supplier,'id'|'created_at'>) => request<Supplier>('/masters/suppliers', { method: 'POST', body: JSON.stringify(b) })
export const updateSupplier = (id: number, b: Omit<Supplier,'id'|'created_at'>) => request<{success:boolean}>(`/masters/suppliers/${id}`, { method: 'PUT', body: JSON.stringify(b) })
export const deleteSupplier = (id: number) => request<{success:boolean}>(`/masters/suppliers/${id}`, { method: 'DELETE' })

export const getWarehouses    = () => request<Warehouse[]>('/masters/warehouses')
export const createWarehouse  = (b: Omit<Warehouse,'id'>) => request<Warehouse>('/masters/warehouses', { method: 'POST', body: JSON.stringify(b) })
export const updateWarehouse  = (id: number, b: Omit<Warehouse,'id'>) => request<{success:boolean}>(`/masters/warehouses/${id}`, { method: 'PUT', body: JSON.stringify(b) })
export const deleteWarehouse  = (id: number) => request<{success:boolean}>(`/masters/warehouses/${id}`, { method: 'DELETE' })

/* ── Types ── */
export interface Warehouse {
  id: number
  warehouse_name: string
  location_city: string
  is_active: number
}

export interface StockSummaryLine {
  warehouse_id: number
  warehouse_name: string
  location_city: string
  batch_id: number
  batch_number: string
  packing_size: string
  quantity_in_stock: number
  notes: string
  godown_rack_location: string
}

export interface StockSummary {
  color_name: string
  item_image: string | null
  total_bags: number
  total_weight_kg: number
  lines: StockSummaryLine[]
}

export interface TransferBody {
  from_warehouse_id: number
  to_warehouse_id: number
  batch_id: number
  packing_size: string
  bags: number
  notes?: string
}

export interface TransferRecord {
  id: number
  from_warehouse_id: number
  to_warehouse_id: number
  from_warehouse_name: string
  to_warehouse_name: string
  batch_id: number
  batch_number: string
  color_name: string
  packing_size: string
  bags: number
  notes: string
  transferred_at: string
}

export interface InventoryRow {
  id: number
  color_name: string
  hsn_code: string
  batch_number: string
  import_date: string
  batch_status: string
  warehouse_id: number
  warehouse_name: string
  location_city: string
  packing_size: string
  quantity_in_stock: number
  godown_rack_location: string
}

export interface ColorRow {
  id: number
  color_name: string
  hsn_code: string
  item_image: string | null
}

export interface BatchRow {
  id: number
  batch_number: string
  import_date: string
  status: string
  warehouse_id: number
  warehouse_name: string
  location_city: string
  packing_size: string
  quantity_in_stock: number
  godown_rack_location: string
  inv_id: number
}

export interface Customer {
  id: number
  customer_name: string
  contact_number: string
}

export interface RecommendedBatch {
  batch_number: string
  import_date: string
  confirmed_at: string
}

export interface DispatchOrder {
  id: number
  customer_name: string
  contact_number: string
  color_name: string
  hsn_code: string
  item_image: string | null
  batch_number: string
  import_date: string
  warehouse_id: number
  warehouse_name: string
  location_city: string
  packing_size: string
  bags_dispatched: number
  status: 'Pending' | 'Picked' | 'Cancelled'
  created_at: string
  godown_rack_location: string
}

export interface CreateDispatchBody {
  customer_id: number
  batch_id: number
  warehouse_id: number
  packing_size: string
  bags_dispatched: number
}

export interface Item {
  id: number
  color_name: string
  hsn_code: string
  item_image: string | null
  batch_numbers: string
}

export interface Supplier {
  id: number
  supplier_name: string
  contact_number: string
  address: string
  created_at: string
}

export interface InwardBody {
  color_name: string
  batch_number: string
  import_date: string
  warehouse_id: number
  supplier_id?: number
  entries: Array<{ packing_size: string; quantity: number }>
  item_image?: string | null
  notes?: string
}

/* ── Admin / Users ── */
export interface AppUser {
  id: number
  username: string
  role: 'manager' | 'helper'
  can_view: number
  can_edit: number
  can_delete: number
  is_active: number
  created_at: string
}

export interface CreateUserBody {
  username: string
  password: string
  role: 'manager' | 'helper'
  can_view: boolean
  can_edit: boolean
  can_delete: boolean
}

export interface UpdateUserBody {
  role: 'manager' | 'helper'
  can_view: boolean
  can_edit: boolean
  can_delete: boolean
  is_active: boolean
  password?: string
}

/* ── Ledger ── */
export interface CustomerSummary {
  id: number
  customer_name: string
  contact_number: string
  total_orders: number
  total_bags: number
  last_order_at: string | null
}

export interface CustomerOrderRow {
  id: number
  color_name: string
  item_image: string | null
  batch_number: string
  packing_size: string
  bags_dispatched: number
  status: 'Pending' | 'Picked' | 'Cancelled'
  created_at: string
  warehouse_name: string
  location_city: string
}

export interface CustomerLedgerDetail {
  customer: { id: number; customer_name: string; contact_number: string }
  orders: CustomerOrderRow[]
  totals: { total_orders: number; total_bags: number; picked_bags: number; pending_bags: number; cancelled_bags: number }
}

export interface SupplierSummary {
  id: number
  supplier_name: string
  contact_number: string
  address: string
  total_batches: number
  current_stock_bags: number
  last_inward_date: string | null
}

export interface SupplierBatchRow {
  batch_id: number
  batch_number: string
  import_date: string
  batch_status: string
  color_name: string
  item_image: string | null
  current_stock: number
  warehouses: string | null
  pack_sizes: string | null
}

export interface SupplierLedgerDetail {
  supplier: { id: number; supplier_name: string; contact_number: string; address: string }
  batches: SupplierBatchRow[]
  totals: { total_batches: number; current_stock_bags: number }
}

export const getLedgerCustomers     = () => request<CustomerSummary[]>('/admin/ledger/customers')
export const getLedgerCustomer      = (id: number) => request<CustomerLedgerDetail>(`/admin/ledger/customer/${id}`)
export const getLedgerSuppliers     = () => request<SupplierSummary[]>('/admin/ledger/suppliers')
export const getLedgerSupplier      = (id: number) => request<SupplierLedgerDetail>(`/admin/ledger/supplier/${id}`)
export const updateLedgerOrder      = (id: number, body: { status?: string; bags_dispatched?: number }) =>
  request<{ success: boolean }>(`/admin/ledger/orders/${id}`, { method: 'PUT', body: JSON.stringify(body) })
export const deleteLedgerOrder      = (id: number) =>
  request<{ success: boolean }>(`/admin/ledger/orders/${id}`, { method: 'DELETE' })

/* ── Stock Inward records (admin edit/delete) ── */
export interface InwardInventoryLine {
  id: number
  batch_id: number
  warehouse_id: number
  packing_size: string
  quantity_in_stock: number
  godown_rack_location: string
  warehouse_name: string
  location_city: string
}

export interface InwardBatch {
  id: number
  batch_number: string
  import_date: string
  status: string
  notes: string
  supplier_id: number | null
  supplier_name: string | null
  item_id: number
  color_name: string
  item_image: string | null
  created_at: string
  inventory: InwardInventoryLine[]
}

export const getInwardBatches = () => request<InwardBatch[]>('/admin/inward')
export const updateInwardBatch = (id: number, body: { batch_number: string; import_date: string; notes: string; supplier_id: number | null }) =>
  request<{ success: boolean }>(`/admin/inward/batches/${id}`, { method: 'PUT', body: JSON.stringify(body) })
export const updateInwardInventory = (id: number, body: { quantity_in_stock: number; godown_rack_location: string }) =>
  request<{ success: boolean }>(`/admin/inward/inventory/${id}`, { method: 'PUT', body: JSON.stringify(body) })
export const deleteInwardBatch = (id: number) =>
  request<{ success: boolean }>(`/admin/inward/batches/${id}`, { method: 'DELETE' })
export const deleteInwardInventoryLine = (id: number) =>
  request<{ success: boolean }>(`/admin/inward/inventory/${id}`, { method: 'DELETE' })

export const getAdminUsers   = () => request<AppUser[]>('/admin/users')
export const createAdminUser = (b: CreateUserBody) =>
  request<AppUser>('/admin/users', { method: 'POST', body: JSON.stringify(b) })
export const updateAdminUser = (id: number, b: UpdateUserBody) =>
  request<{ success: boolean }>(`/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(b) })
export const deleteAdminUser = (id: number) =>
  request<{ success: boolean }>(`/admin/users/${id}`, { method: 'DELETE' })

export interface BackupPayload {
  exported_at: string
  schema_version: number
  data: Record<string, unknown[]>
}

export const exportData = () => request<BackupPayload>('/admin/backup/export')
export const importData = (payload: BackupPayload) =>
  request<{ success: boolean; tables: string[] }>('/admin/backup/import', {
    method: 'POST',
    body: JSON.stringify({ data: payload.data }),
  })

export const gdriveStatus  = () => request<{ configured: boolean }>('/admin/backup/gdrive/status')
export const gdriveBackup  = () => request<{ ok: boolean; message: string }>('/admin/backup/gdrive', { method: 'POST' })
