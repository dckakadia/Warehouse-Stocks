export const W_COLORS = [
  'bg-blue-800/40 text-blue-300 border-blue-700/60',
  'bg-purple-800/40 text-purple-300 border-purple-700/60',
  'bg-teal-800/40 text-teal-300 border-teal-700/60',
  'bg-amber-800/40 text-amber-300 border-amber-700/60',
]

export const whColor = (wid: number) => W_COLORS[(wid - 1) % W_COLORS.length]

// Groups rows sharing a non-null order_group (a cart submitted together via POST /dispatch/bulk)
// into one entry; rows with no group (every pre-existing/single-line order) each form their own
// group of one. Used everywhere a dispatch order/line is listed — Picking tab, Customer Ledger,
// Daily Report — so a multi-item order reads as one order, not several disconnected rows.
export function groupByOrder<T extends { id: number; order_group: number | null }>(rows: T[]): { key: string; items: T[] }[] {
  const map = new Map<string, T[]>()
  for (const r of rows) {
    const key = r.order_group != null ? `g-${r.order_group}` : `s-${r.id}`
    const arr = map.get(key)
    if (arr) arr.push(r)
    else map.set(key, [r])
  }
  return [...map.entries()].map(([key, items]) => ({ key, items }))
}

export function todayISO() {
  // Local calendar date, not UTC — toISOString() converts to UTC first, which returns yesterday's
  // date for part of the day in any timezone ahead of UTC (e.g. IST, UTC+5:30, until 05:29 local).
  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function parseKgPerBag(ps: string): number {
  const m = ps.match(/^(\d+(?:\.\d+)?)\s*kg/i)
  return m ? parseFloat(m[1]) : 0
}

interface AndroidPrintBridge { print: () => void }
interface AndroidUpdaterBridge { downloadAndInstall: (url: string) => void }
declare global {
  interface Window {
    Capacitor?: { isNativePlatform?: () => boolean }
    AndroidPrint?: AndroidPrintBridge
    AndroidUpdater?: AndroidUpdaterBridge
  }
}

// Prints an HTML document without window.open() — in the Capacitor Android WebView, window.open()
// gets treated as an external-URL navigation and hands off to a system browser Intent with no way
// back into the app. A same-origin iframe stays inside the WebView and prints in place instead.
export function printHtmlDocument(html: string) {
  const isNative = !!window.Capacitor?.isNativePlatform?.()

  if (isNative && window.AndroidPrint) {
    // Android's WebView doesn't wire window.print() up to anything on its own — the native side
    // prints whatever is currently rendered in the main WebView, so the report has to actually be
    // on screen (not hidden) for MainActivity's PrintDocumentAdapter to capture it. A visible
    // full-screen overlay with its own Close button doubles as insurance against ever being
    // stranded with no way back, regardless of whether the print job itself succeeds.
    const overlay = document.createElement('div')
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#fff;'
    // A dedicated toolbar strip (its own background, occupying real layout space) rather than a
    // button floating on top of the iframe — the report's own printed header also renders text in
    // that top-right corner, so a floating button sat directly on top of it and covered it up. The
    // toolbar reserves space so the iframe content is pushed down below it instead of underneath it.
    const TOOLBAR_H = 48
    const toolbar = document.createElement('div')
    toolbar.className = 'wms-print-toolbar'
    toolbar.style.cssText = `position:fixed;top:0;left:0;right:0;z-index:10000;height:calc(env(safe-area-inset-top) + ${TOOLBAR_H}px);padding-top:env(safe-area-inset-top);padding-right:max(8px, env(safe-area-inset-right));box-sizing:border-box;background:#1a1a1a;display:flex;align-items:center;justify-content:flex-end;`
    const closeBtn = document.createElement('button')
    closeBtn.textContent = '✕ Close'
    closeBtn.style.cssText = 'padding:8px 14px;background:#333;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;'
    toolbar.appendChild(closeBtn)
    // The native print job captures whatever the main WebView is currently rendering, so the
    // toolbar — being outside the iframe, in the main document — would otherwise show up in the
    // printed/PDF output too.
    const printHideStyle = document.createElement('style')
    printHideStyle.textContent = '@media print { .wms-print-toolbar { display: none !important } }'
    document.head.appendChild(printHideStyle)
    const iframe = document.createElement('iframe')
    iframe.style.cssText = `position:fixed;left:0;right:0;bottom:0;top:calc(env(safe-area-inset-top) + ${TOOLBAR_H}px);width:100%;height:calc(100% - env(safe-area-inset-top) - ${TOOLBAR_H}px);border:none;`
    overlay.appendChild(iframe)
    overlay.appendChild(toolbar)
    document.body.appendChild(overlay)

    const cleanup = () => {
      if (overlay.parentNode) document.body.removeChild(overlay)
      if (printHideStyle.parentNode) document.head.removeChild(printHideStyle)
    }
    const autoCleanup = setTimeout(cleanup, 60_000)
    closeBtn.onclick = () => { clearTimeout(autoCleanup); cleanup() }

    // iframe.contentWindow/contentDocument isn't always populated synchronously right after
    // appendChild in this WebView — wait a tick rather than bailing out immediately.
    requestAnimationFrame(() => {
      const doc = iframe.contentWindow?.document
      if (!doc) { cleanup(); return }
      iframe.onload = () => window.AndroidPrint?.print()
      doc.open()
      doc.write(html)
      doc.close()
    })
    return
  }

  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = 'none'
  iframe.style.visibility = 'hidden'
  document.body.appendChild(iframe)

  const cleanup = () => { if (iframe.parentNode) document.body.removeChild(iframe) }

  requestAnimationFrame(() => {
    const doc = iframe.contentWindow?.document
    if (!doc) { cleanup(); return }

    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus()
        iframe.contentWindow?.print()
      } finally {
        setTimeout(cleanup, 1000)
      }
    }
    doc.open()
    doc.write(html)
    doc.close()
  })
}
