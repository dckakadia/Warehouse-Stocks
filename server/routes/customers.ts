import { Router } from 'express'
import db from '../db.js'

const router = Router()

router.get('/', (_req, res) => {
  res.json(db.prepare('SELECT * FROM customers ORDER BY customer_name').all())
})

router.post('/', (req, res) => {
  const { customer_name, contact_number = '', gst_number = '' } = req.body
  if (!customer_name?.trim()) return res.status(400).json({ error: 'customer_name required' })
  const name = customer_name.trim(), contact = contact_number.trim(), gst = gst_number.trim()

  const dup = db.prepare(`
    SELECT customer_name FROM customers
    WHERE LOWER(customer_name) = LOWER(?)
      OR (? != '' AND gst_number = ?)
      OR (? != '' AND contact_number = ?)
    LIMIT 1
  `).get(name, gst, gst, contact, contact) as { customer_name: string } | undefined
  if (dup) return res.status(409).json({ error: `Customer "${dup.customer_name}" already exists with the same name, GST number, or mobile number` })

  const result = db.prepare(
    'INSERT INTO customers (customer_name, contact_number, gst_number) VALUES (?, ?, ?)'
  ).run(name, contact, gst)
  res.status(201).json({ id: result.lastInsertRowid, customer_name: name, contact_number: contact, gst_number: gst })
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
