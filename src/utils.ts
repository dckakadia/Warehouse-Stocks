export const W_COLORS = [
  'bg-blue-800/40 text-blue-300 border-blue-700/60',
  'bg-purple-800/40 text-purple-300 border-purple-700/60',
  'bg-teal-800/40 text-teal-300 border-teal-700/60',
  'bg-amber-800/40 text-amber-300 border-amber-700/60',
]

export const whColor = (wid: number) => W_COLORS[(wid - 1) % W_COLORS.length]

export function todayISO() {
  return new Date().toISOString().split('T')[0]
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
    const closeBtn = document.createElement('button')
    closeBtn.textContent = '✕ Close'
    closeBtn.className = 'wms-print-close'
    closeBtn.style.cssText = 'position:fixed;top:8px;right:8px;z-index:10000;padding:8px 14px;background:#1a1a1a;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;'
    // The native print job captures whatever the main WebView is currently rendering, so the
    // Close button — being outside the iframe, in the main document — would otherwise show up
    // in the printed/PDF output too.
    const printHideStyle = document.createElement('style')
    printHideStyle.textContent = '@media print { .wms-print-close { display: none !important } }'
    document.head.appendChild(printHideStyle)
    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:none;'
    overlay.appendChild(iframe)
    overlay.appendChild(closeBtn)
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

export async function compressImage(file: File): Promise<string> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const MAX = 600
      const scale = Math.min(MAX / img.width, MAX / img.height, 1)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.78))
    }
    img.src = url
  })
}
