import { Router } from 'express'
import db from '../db.js'

const router = Router()

router.get('/', (_req, res) => {
  res.json(db.prepare('SELECT * FROM customers ORDER BY customer_name').all())
})

router.post('/', (req, res) => {
  const { customer_name, contact_number = '' } = req.body
  if (!customer_name?.trim()) return res.status(400).json({ error: 'customer_name required' })
  const result = db.prepare(
    'INSERT INTO customers (customer_name, contact_number) VALUES (?, ?)'
  ).run(customer_name.trim(), contact_number.trim())
  res.status(201).json({ id: result.lastInsertRowid, customer_name, contact_number })
})

// GET recommended batch for a customer + color (shade matching)
router.get('/:id/recommended-batch', (req, res) => {
  const { id } = req.params
  const { colorName } = req.query
  if (!colorName) return res.status(400).json({ error: 'colorName required' })

  const recommended = db.prepare(`
    SELECT b.batch_number, b.import_date, dl.confirmed_at
    FROM dispatch_logs dl
    JOIN batches b  ON dl.batch_id = b.id
    JOIN items it   ON b.item_id   = it.id
    WHERE dl.customer_id = ? AND it.color_name = ?
    ORDER BY dl.confirmed_at DESC
    LIMIT 1
  `).get(id, colorName) as { batch_number: string; import_date: string; confirmed_at: string } | undefined

  res.json({ recommended: recommended ?? null })
})

export default router
