import { useEffect, useRef } from 'react'

export function useWSSync(onRefresh: (entity: string) => void) {
  const cbRef = useRef(onRefresh)
  cbRef.current = onRefresh
  useEffect(() => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    let ws: WebSocket
    let retry: ReturnType<typeof setTimeout>
    let closedByUs = false
    const connect = () => {
      closedByUs = false
      ws = new WebSocket(`${proto}://${location.host}/ws`)
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data)
        if (msg.event === 'data_changed') cbRef.current(msg.payload?.entity ?? 'all')
      }
      ws.onclose = () => { if (!closedByUs) retry = setTimeout(connect, 3000) }
    }
    connect()

    // Mobile OSes routinely leave a WebSocket in a stale "OPEN"-looking state after the app is
    // backgrounded/screen-locked (suspended JS/network), without ever firing onclose — so the
    // retry-on-close logic above never kicks in and the app can be left listening on a dead
    // socket indefinitely. Force a fresh connection whenever the app/tab regains foreground, and
    // trigger an immediate full refresh at the same time to pick up anything broadcast while away
    // (covers both this device's own missed echoes and changes made by other devices/users).
    const onForeground = () => {
      clearTimeout(retry)
      closedByUs = true
      ws?.close()
      connect()
      cbRef.current('all')
    }
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') onForeground() }
    document.addEventListener('visibilitychange', onVisibilityChange)

    let removeAppListener: (() => void) | undefined
    const isNative = !!(window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()
    if (isNative) {
      import('@capacitor/app').then(({ App }) => {
        App.addListener('resume', onForeground).then(handle => { removeAppListener = () => handle.remove() })
      }).catch(() => {})
    }

    return () => {
      closedByUs = true
      ws?.close()
      clearTimeout(retry)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      removeAppListener?.()
    }
  }, [])
}
