import type { StockItem, Customer, DispatchOrder } from './types'

export const COLORS = [
  'Amber Gold',
  'Crystal Clear',
  'Emerald Green',
  'Midnight Black',
  'Pearl White',
  'Rose Pink',
  'Ruby Red',
  'Sapphire Blue',
]

export const HSN = '7018.90.00'

export const initialStock: StockItem[] = [
  { id: '1',  colorName: 'Crystal Clear',  batchNumber: 'CN-2024-001', packSize: '20kg', stock: 45, rackLocation: 'Rack-A1-01', importDate: '15/01/2024', status: 'Active' },
  { id: '2',  colorName: 'Crystal Clear',  batchNumber: 'CN-2024-001', packSize: '25kg', stock: 32, rackLocation: 'Rack-A1-02', importDate: '15/01/2024', status: 'Active' },
  { id: '3',  colorName: 'Crystal Clear',  batchNumber: 'CN-2024-007', packSize: '20kg', stock: 28, rackLocation: 'Rack-A1-03', importDate: '20/06/2024', status: 'Active' },
  { id: '4',  colorName: 'Ruby Red',       batchNumber: 'CN-2024-002', packSize: '20kg', stock: 56, rackLocation: 'Rack-B2-01', importDate: '10/02/2024', status: 'Active' },
  { id: '5',  colorName: 'Ruby Red',       batchNumber: 'CN-2024-002', packSize: '25kg', stock: 41, rackLocation: 'Rack-B2-02', importDate: '10/02/2024', status: 'Active' },
  { id: '6',  colorName: 'Sapphire Blue',  batchNumber: 'CN-2024-003', packSize: '20kg', stock: 38, rackLocation: 'Rack-C3-01', importDate: '05/03/2024', status: 'Active' },
  { id: '7',  colorName: 'Sapphire Blue',  batchNumber: 'CN-2024-003', packSize: '25kg', stock: 52, rackLocation: 'Rack-C3-02', importDate: '05/03/2024', status: 'Active' },
  { id: '8',  colorName: 'Emerald Green',  batchNumber: 'CN-2024-004', packSize: '20kg', stock: 22, rackLocation: 'Rack-D4-01', importDate: '25/03/2024', status: 'Active' },
  { id: '9',  colorName: 'Emerald Green',  batchNumber: 'CN-2024-004', packSize: '25kg', stock: 18, rackLocation: 'Rack-D4-02', importDate: '25/03/2024', status: 'Active' },
  { id: '10', colorName: 'Amber Gold',     batchNumber: 'CN-2024-005', packSize: '20kg', stock: 67, rackLocation: 'Rack-E5-01', importDate: '12/04/2024', status: 'Active' },
  { id: '11', colorName: 'Amber Gold',     batchNumber: 'CN-2024-005', packSize: '25kg', stock: 49, rackLocation: 'Rack-E5-02', importDate: '12/04/2024', status: 'Active' },
  { id: '12', colorName: 'Pearl White',    batchNumber: 'CN-2024-006', packSize: '20kg', stock: 34, rackLocation: 'Rack-F6-01', importDate: '08/05/2024', status: 'Active' },
  { id: '13', colorName: 'Pearl White',    batchNumber: 'CN-2024-006', packSize: '25kg', stock: 29, rackLocation: 'Rack-F6-02', importDate: '08/05/2024', status: 'Active' },
  { id: '14', colorName: 'Midnight Black', batchNumber: 'CN-2024-008', packSize: '20kg', stock: 25, rackLocation: 'Rack-G7-01', importDate: '15/05/2024', status: 'Active' },
]

export const initialCustomers: Customer[] = [
  { id: 'c1', name: 'Textile Mills Pvt Ltd',  contact: '+91-9876543210' },
  { id: 'c2', name: 'Fashion Fabrics India',  contact: '+91-9876543211' },
  { id: 'c3', name: 'Premium Garments Co',    contact: '+91-9876543212' },
  { id: 'c4', name: 'Star Embroidery Works',  contact: '+91-9876543213' },
  { id: 'c5', name: 'Creative Designs Ltd',   contact: '+91-9876543214' },
  { id: 'c6', name: 'Rainbow Textiles',       contact: '+91-9876543215' },
]

export const initialDispatchOrders: DispatchOrder[] = [
  {
    id: 'DIS-1781965795240',
    colorName: 'Amber Gold',
    packSize: '20kg',
    batchNumber: 'CN-2024-005',
    bags: 1,
    customerId: 'c5',
    customerName: 'Creative Designs Ltd',
    status: 'Pending',
    createdAt: 1781965795240,
  },
  {
    id: 'DIS-1781965589-001',
    colorName: 'Crystal Clear',
    packSize: '20kg',
    batchNumber: 'CN-2024-001',
    bags: 5,
    customerId: 'c1',
    customerName: 'Textile Mills Pvt Ltd',
    status: 'Pending',
    createdAt: 1781965589001,
  },
  {
    id: 'DIS-1781965589-002',
    colorName: 'Ruby Red',
    packSize: '25kg',
    batchNumber: 'CN-2024-002',
    bags: 10,
    customerId: 'c2',
    customerName: 'Fashion Fabrics India',
    status: 'Pending',
    createdAt: 1781965589002,
  },
]
