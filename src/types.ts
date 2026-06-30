export interface StockItem {
  id: string
  colorName: string
  batchNumber: string
  packSize: '20kg' | '25kg'
  stock: number
  rackLocation: string
  importDate: string
  status: 'Active' | 'Inactive'
}

export interface Customer {
  id: string
  name: string
  contact: string
}

export interface DispatchOrder {
  id: string
  colorName: string
  packSize: '20kg' | '25kg'
  batchNumber: string
  bags: number
  customerId: string
  customerName: string
  status: 'Pending' | 'Completed'
  createdAt: number
}

export type View = 'store' | 'godown'
export type GodownTab = 'picking' | 'inward'
