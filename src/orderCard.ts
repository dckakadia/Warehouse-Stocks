import type { DispatchOrder } from './api'
import { printHtmlDocument } from './utils'

interface AndroidShareBridge { shareImage: (base64: string, filename: string) => void }
declare global {
  interface Window {
    AndroidShare?: AndroidShareBridge
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function buildOrderCardHtml(orders: DispatchOrder[]): string {
  const first = orders[0]
  const orderIdText = orders.length === 1 ? `DIS-${first.id}` : orders.map(o => `DIS-${o.id}`).join(', ')

  // Single item keeps the original hero layout (big photo, big "Bags to Pick" figure). A real
  // multi-item order (from a cart submission, see order_group in server/db.ts) repeats that same
  // large-photo item-section per item instead of a compact row — the photo is a sticker the worker
  // has to read, so it needs to stay just as large no matter how many items are in the order.
  const itemBlock = (o: DispatchOrder, showOrderTag: boolean) => `
  <div class="item-section">
    ${o.item_image
      ? `<img class="item-photo" src="${o.item_image}" alt="${o.color_name}">`
      : `<div class="item-photo-placeholder">No photo</div>`}
    <div class="item-fields">
      <div>
        ${showOrderTag ? `<div class="item-order-tag">DIS-${o.id}</div>` : ''}
        <div class="color-name">${o.color_name}</div>
        <div class="hsn">HSN: ${o.hsn_code}</div>
      </div>
      <div class="field-grid">
        <div>
          <div class="field-label">Batch Number</div>
          <div class="field-value mono">${o.batch_number}</div>
        </div>
        <div>
          <div class="field-label">Warehouse</div>
          <div class="field-value">${o.warehouse_name}</div>
        </div>
        <div>
          <div class="field-label">Pack Size</div>
          <div class="field-value">${o.packing_size}</div>
        </div>
        ${showOrderTag ? `
        <div>
          <div class="field-label">Bags</div>
          <div class="field-value bags-value">${o.bags_dispatched}</div>
        </div>` : ''}
      </div>
    </div>
  </div>`

  const itemContent = orders.length === 1 ? `
  ${itemBlock(first, false)}
  <div class="bags-box">
    <div class="num">${first.bags_dispatched}</div>
    <div class="lbl">Bags to Pick</div>
  </div>` : `
  <div class="items-list">
    ${orders.map(o => itemBlock(o, true)).join('')}
  </div>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Dispatch Order — ${orderIdText}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; background: #fff; font-size: 12px; line-height: 1.4; }
  .page { padding: 24px 28px; }
  .header { display: flex; align-items: flex-start; justify-content: space-between; padding-bottom: 14px; border-bottom: 2.5px solid #1a1a1a; margin-bottom: 18px; }
  .company-name { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; color: #111; }
  .report-title { font-size: 12px; color: #555; margin-top: 2px; font-weight: 500; }
  .header-right { text-align: right; }
  .header-right .label { font-size: 9px; color: #888; text-transform: uppercase; letter-spacing: 0.08em; }
  .header-right .value { font-size: 13px; font-weight: 700; margin-top: 1px; }
  .header-right .sub { font-size: 10px; color: #555; margin-top: 2px; }
  .order-bar { display: flex; justify-content: space-between; align-items: center; background: #f5f5f5; border-radius: 8px; padding: 12px 16px; margin-bottom: 18px; gap: 12px; }
  .order-id { font-size: 18px; font-weight: 800; font-family: 'Courier New', monospace; }
  .order-date { font-size: 11px; color: #555; margin-top: 2px; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 10px; font-weight: 700; letter-spacing: 0.04em; background: #fef3c7; color: #92400e; flex-shrink: 0; }
  .customer-bar { margin-bottom: 20px; }
  .field-label { font-size: 9px; color: #888; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 3px; }
  .customer-name { font-size: 22px; font-weight: 800; }
  /* Photo is the sticker the worker has to read on the actual bag — kept as large as the page
     comfortably allows, for both the single-item hero card and every item in a multi-item order. */
  .item-section { display: flex; gap: 22px; margin-bottom: 20px; }
  .item-photo { width: 260px; height: 260px; object-fit: cover; border-radius: 12px; border: 1px solid #e0e0e0; flex-shrink: 0; }
  .item-photo-placeholder { width: 260px; height: 260px; border-radius: 12px; border: 1px dashed #ccc; flex-shrink: 0; display: flex; align-items: center; justify-content: center; color: #aaa; font-size: 11px; text-align: center; }
  .item-fields { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 14px; }
  .item-order-tag { font-size: 11px; font-weight: 700; color: #888; font-family: 'Courier New', monospace; margin-bottom: 4px; }
  .color-name { font-size: 24px; font-weight: 800; }
  .hsn { font-size: 11px; color: #888; margin-top: 2px; }
  .field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .field-value { font-size: 17px; font-weight: 700; }
  .field-value.mono { font-family: 'Courier New', monospace; }
  .field-value.bags-value { font-size: 22px; color: #059669; }
  .bags-box { border: 2px solid #1a1a1a; border-radius: 10px; padding: 16px 20px; text-align: center; margin-bottom: 20px; }
  .bags-box .num { font-size: 44px; font-weight: 800; line-height: 1; }
  .bags-box .lbl { font-size: 11px; color: #555; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 6px; font-weight: 700; }
  .items-list .item-section { padding-bottom: 20px; margin-bottom: 20px; border-bottom: 2px dashed #ddd; }
  .items-list .item-section:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
  .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #ddd; display: flex; justify-content: space-between; font-size: 9px; color: #aaa; }
  @media print {
    body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    @page { margin: 15mm; size: A4 portrait; }
    .page { padding: 0; }
  }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      <div class="company-name">Glass Beads WMS</div>
      <div class="report-title">Dispatch Order</div>
    </div>
    <div class="header-right">
      <div class="label">Generated</div>
      <div class="value">${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
      <div class="sub">${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
    </div>
  </div>

  <div class="order-bar">
    <div>
      <div class="order-id">${orderIdText}</div>
      <div class="order-date">Created ${formatDate(first.created_at)}</div>
    </div>
    <span class="badge">${first.status}</span>
  </div>

  <div class="customer-bar">
    <div class="field-label">Deliver To</div>
    <div class="customer-name">${first.customer_name}</div>
  </div>
  ${itemContent}
  <div class="footer">
    <span>Glass Beads WMS — Confidential</span>
    <span>${orderIdText} · ${first.customer_name}</span>
  </div>
</div>
</body>
</html>`
}

export function printOrderCard(orders: DispatchOrder[]) {
  printHtmlDocument(buildOrderCardHtml(orders))
}

const JPEG_QUALITY = 0.85
const CARD_W = 900
const CARD_H = 1250

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = src
  })
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  return lines
}

async function renderSingleOrderJpeg(order: DispatchOrder): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = CARD_W
  canvas.height = CARD_H
  const ctx = canvas.getContext('2d')!
  const PAD = 48

  // Background
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, CARD_W, CARD_H)

  // Header band
  const HEADER_H = 130
  ctx.fillStyle = '#1a1a1a'
  ctx.fillRect(0, 0, CARD_W, HEADER_H)
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 34px Arial, sans-serif'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('Glass Beads WMS', PAD, 62)
  ctx.font = '18px Arial, sans-serif'
  ctx.fillStyle = '#cccccc'
  ctx.fillText('Dispatch Order', PAD, 90)
  ctx.font = 'bold 26px "Courier New", monospace'
  ctx.fillStyle = '#ffffff'
  const orderIdText = `DIS-${order.id}`
  ctx.fillText(orderIdText, CARD_W - PAD - ctx.measureText(orderIdText).width, 62)
  ctx.font = '14px Arial, sans-serif'
  ctx.fillStyle = '#cccccc'
  const dateText = formatDate(order.created_at)
  ctx.fillText(dateText, CARD_W - PAD - ctx.measureText(dateText).width, 88)

  let y = HEADER_H + 50

  // Deliver To
  ctx.fillStyle = '#888888'
  ctx.font = 'bold 13px Arial, sans-serif'
  ctx.fillText('DELIVER TO', PAD, y)
  y += 34
  ctx.fillStyle = '#1a1a1a'
  ctx.font = 'bold 32px Arial, sans-serif'
  for (const line of wrapText(ctx, order.customer_name, CARD_W - PAD * 2)) {
    ctx.fillText(line, PAD, y)
    y += 38
  }
  y += 12

  // Photo
  const PHOTO_SIZE = 240
  if (order.item_image) {
    try {
      const img = await loadImage(order.item_image)
      const side = Math.min(img.width, img.height)
      const sx = (img.width - side) / 2
      const sy = (img.height - side) / 2
      ctx.save()
      const r = 14
      ctx.beginPath()
      ctx.moveTo(PAD + r, y)
      ctx.arcTo(PAD + PHOTO_SIZE, y, PAD + PHOTO_SIZE, y + PHOTO_SIZE, r)
      ctx.arcTo(PAD + PHOTO_SIZE, y + PHOTO_SIZE, PAD, y + PHOTO_SIZE, r)
      ctx.arcTo(PAD, y + PHOTO_SIZE, PAD, y, r)
      ctx.arcTo(PAD, y, PAD + PHOTO_SIZE, y, r)
      ctx.closePath()
      ctx.clip()
      ctx.drawImage(img, sx, sy, side, side, PAD, y, PHOTO_SIZE, PHOTO_SIZE)
      ctx.restore()
    } catch {
      // fall through — leave blank if the photo fails to load
    }
  } else {
    ctx.strokeStyle = '#cccccc'
    ctx.setLineDash([6, 6])
    ctx.strokeRect(PAD, y, PHOTO_SIZE, PHOTO_SIZE)
    ctx.setLineDash([])
    ctx.fillStyle = '#aaaaaa'
    ctx.font = '14px Arial, sans-serif'
    ctx.fillText('No photo', PAD + PHOTO_SIZE / 2 - 30, y + PHOTO_SIZE / 2)
  }

  // Item fields (to the right of the photo)
  const fieldsX = PAD + PHOTO_SIZE + 32
  const fieldsWidth = CARD_W - PAD - fieldsX
  let fy = y + 8
  ctx.fillStyle = '#1a1a1a'
  ctx.font = 'bold 26px Arial, sans-serif'
  for (const line of wrapText(ctx, order.color_name, fieldsWidth)) {
    ctx.fillText(line, fieldsX, fy)
    fy += 32
  }
  ctx.fillStyle = '#888888'
  ctx.font = '13px Arial, sans-serif'
  ctx.fillText(`HSN: ${order.hsn_code}`, fieldsX, fy + 4)
  fy += 40

  const drawField = (label: string, value: string) => {
    ctx.fillStyle = '#888888'
    ctx.font = 'bold 11px Arial, sans-serif'
    ctx.fillText(label.toUpperCase(), fieldsX, fy)
    fy += 22
    ctx.fillStyle = '#1a1a1a'
    ctx.font = 'bold 20px Arial, sans-serif'
    for (const line of wrapText(ctx, value, fieldsWidth)) {
      ctx.fillText(line, fieldsX, fy)
      fy += 24
    }
    fy += 12
  }
  drawField('Batch Number', order.batch_number)
  drawField('Warehouse', order.warehouse_name)
  drawField('Pack Size', order.packing_size)

  // Whichever is taller — the fixed-height photo box or the (possibly wrapped) fields column —
  // determines where the bags-box starts, so long values never overlap it.
  y = Math.max(y + PHOTO_SIZE, fy) + 50

  // Bags-to-pick box
  const boxH = 170
  ctx.strokeStyle = '#1a1a1a'
  ctx.lineWidth = 3
  ctx.strokeRect(PAD, y, CARD_W - PAD * 2, boxH)
  ctx.fillStyle = '#1a1a1a'
  ctx.font = 'bold 72px Arial, sans-serif'
  const numText = String(order.bags_dispatched)
  ctx.fillText(numText, CARD_W / 2 - ctx.measureText(numText).width / 2, y + 90)
  ctx.font = 'bold 16px Arial, sans-serif'
  ctx.fillStyle = '#555555'
  const lblText = 'BAGS TO PICK'
  ctx.fillText(lblText, CARD_W / 2 - ctx.measureText(lblText).width / 2, y + 130)

  y += boxH + 40

  // Footer
  ctx.strokeStyle = '#dddddd'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(PAD, y)
  ctx.lineTo(CARD_W - PAD, y)
  ctx.stroke()
  y += 26
  ctx.fillStyle = '#aaaaaa'
  ctx.font = '12px Arial, sans-serif'
  ctx.fillText('Glass Beads WMS — Confidential', PAD, y)

  return canvas.toDataURL('image/jpeg', JPEG_QUALITY)
}

function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let t = text
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1)
  return `${t}…`
}

// Compact repeating-row layout for a real multi-item order — unlike the single-order hero layout,
// text is truncated (not wrapped) to a fixed row height so the canvas height can be computed
// upfront from orders.length before any drawing happens (canvas dimensions must be set before
// content is drawn, and resizing clears it).
async function renderGroupOrderJpeg(orders: DispatchOrder[]): Promise<string> {
  const PAD = 48
  const HEADER_H = 130
  const DELIVER_H = 34 + 38 + 12
  // Photo is the sticker the worker has to read on the actual bag — kept exactly as large as the
  // single-item card's (see PHOTO_SIZE in renderSingleOrderJpeg above) no matter how many items
  // are in the order, rather than shrinking it to fit more rows on screen.
  const PHOTO_SIZE = 240
  const ROW_GAP = 40
  const ROW_H = PHOTO_SIZE + ROW_GAP
  const FOOTER_H = 70
  const cardH = HEADER_H + 50 + DELIVER_H + orders.length * ROW_H + FOOTER_H

  const canvas = document.createElement('canvas')
  canvas.width = CARD_W
  canvas.height = cardH
  const ctx = canvas.getContext('2d')!
  ctx.textBaseline = 'alphabetic'

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, CARD_W, cardH)

  ctx.fillStyle = '#1a1a1a'
  ctx.fillRect(0, 0, CARD_W, HEADER_H)
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 34px Arial, sans-serif'
  ctx.fillText('Glass Beads WMS', PAD, 62)
  ctx.font = '18px Arial, sans-serif'
  ctx.fillStyle = '#cccccc'
  ctx.fillText('Dispatch Order', PAD, 90)
  ctx.font = 'bold 20px "Courier New", monospace'
  ctx.fillStyle = '#ffffff'
  const idText = truncateText(ctx, orders.map(o => `DIS-${o.id}`).join(', '), CARD_W - PAD * 2 - 200)
  ctx.fillText(idText, CARD_W - PAD - ctx.measureText(idText).width, 62)
  ctx.font = '14px Arial, sans-serif'
  ctx.fillStyle = '#cccccc'
  const dateText = formatDate(orders[0].created_at)
  ctx.fillText(dateText, CARD_W - PAD - ctx.measureText(dateText).width, 88)

  let y = HEADER_H + 50

  ctx.fillStyle = '#888888'
  ctx.font = 'bold 13px Arial, sans-serif'
  ctx.fillText('DELIVER TO', PAD, y)
  y += 34
  ctx.fillStyle = '#1a1a1a'
  ctx.font = 'bold 32px Arial, sans-serif'
  ctx.fillText(truncateText(ctx, orders[0].customer_name, CARD_W - PAD * 2), PAD, y)
  y += 50

  for (const o of orders) {
    if (o.item_image) {
      try {
        const img = await loadImage(o.item_image)
        const side = Math.min(img.width, img.height)
        const sx = (img.width - side) / 2
        const sy = (img.height - side) / 2
        ctx.save()
        const r = 14
        ctx.beginPath()
        ctx.moveTo(PAD + r, y)
        ctx.arcTo(PAD + PHOTO_SIZE, y, PAD + PHOTO_SIZE, y + PHOTO_SIZE, r)
        ctx.arcTo(PAD + PHOTO_SIZE, y + PHOTO_SIZE, PAD, y + PHOTO_SIZE, r)
        ctx.arcTo(PAD, y + PHOTO_SIZE, PAD, y, r)
        ctx.arcTo(PAD, y, PAD + PHOTO_SIZE, y, r)
        ctx.closePath()
        ctx.clip()
        ctx.drawImage(img, sx, sy, side, side, PAD, y, PHOTO_SIZE, PHOTO_SIZE)
        ctx.restore()
      } catch {
        // fall through — leave blank if the photo fails to load
      }
    } else {
      ctx.strokeStyle = '#cccccc'
      ctx.setLineDash([6, 6])
      ctx.strokeRect(PAD, y, PHOTO_SIZE, PHOTO_SIZE)
      ctx.setLineDash([])
      ctx.fillStyle = '#aaaaaa'
      ctx.font = '14px Arial, sans-serif'
      ctx.fillText('No photo', PAD + PHOTO_SIZE / 2 - 30, y + PHOTO_SIZE / 2)
    }

    const textX = PAD + PHOTO_SIZE + 28
    const textWidth = CARD_W - PAD - textX
    let fy = y + 4

    ctx.fillStyle = '#888888'
    ctx.font = 'bold 13px "Courier New", monospace'
    ctx.fillText(`DIS-${o.id}`, textX, fy + 12)
    fy += 32

    ctx.fillStyle = '#1a1a1a'
    ctx.font = 'bold 28px Arial, sans-serif'
    ctx.fillText(truncateText(ctx, o.color_name, textWidth), textX, fy + 20)
    fy += 38

    ctx.fillStyle = '#888888'
    ctx.font = '13px Arial, sans-serif'
    ctx.fillText(`HSN: ${o.hsn_code}`, textX, fy + 10)
    fy += 44

    const colW = textWidth / 2
    const drawField = (col: number, row: number, label: string, value: string, accent: boolean) => {
      const fx = textX + col * colW
      const fyy = fy + row * 64
      ctx.fillStyle = '#888888'
      ctx.font = 'bold 10px Arial, sans-serif'
      ctx.fillText(label.toUpperCase(), fx, fyy)
      ctx.fillStyle = accent ? '#059669' : '#1a1a1a'
      ctx.font = `bold ${accent ? 24 : 17}px Arial, sans-serif`
      ctx.fillText(truncateText(ctx, value, colW - 16), fx, fyy + (accent ? 26 : 20))
    }
    drawField(0, 0, 'Batch Number', o.batch_number, false)
    drawField(1, 0, 'Warehouse', o.warehouse_name, false)
    drawField(0, 1, 'Pack Size', o.packing_size, false)
    drawField(1, 1, 'Bags', String(o.bags_dispatched), true)

    y += PHOTO_SIZE
    ctx.strokeStyle = '#eeeeee'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PAD, y + ROW_GAP / 2)
    ctx.lineTo(CARD_W - PAD, y + ROW_GAP / 2)
    ctx.stroke()
    y += ROW_GAP
  }

  y += 10
  ctx.strokeStyle = '#dddddd'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(PAD, y)
  ctx.lineTo(CARD_W - PAD, y)
  ctx.stroke()
  y += 26
  ctx.fillStyle = '#aaaaaa'
  ctx.font = '12px Arial, sans-serif'
  ctx.fillText('Glass Beads WMS — Confidential', PAD, y)

  return canvas.toDataURL('image/jpeg', JPEG_QUALITY)
}

export function renderOrderCardJpeg(orders: DispatchOrder[]): Promise<string> {
  return orders.length === 1 ? renderSingleOrderJpeg(orders[0]) : renderGroupOrderJpeg(orders)
}

export async function shareOrderCard(dataUri: string, filename: string): Promise<void> {
  const isNative = !!window.Capacitor?.isNativePlatform?.()

  if (isNative && window.AndroidShare) {
    const base64 = dataUri.split(',')[1]
    window.AndroidShare.shareImage(base64, filename)
    return
  }

  if (navigator.canShare && navigator.share) {
    const blob = await (await fetch(dataUri)).blob()
    const file = new File([blob], `${filename}.jpg`, { type: 'image/jpeg' })
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename })
      } catch (err: unknown) {
        // The user dismissing the native share sheet rejects with AbortError — a normal cancel,
        // not a failure, so don't let it surface as an error toast to the caller.
        if (err instanceof Error && err.name === 'AbortError') return
        throw err
      }
      return
    }
  }

  // Last-resort fallback: trigger a plain download so the user can share it manually.
  const a = document.createElement('a')
  a.href = dataUri
  a.download = `${filename}.jpg`
  a.click()
}
