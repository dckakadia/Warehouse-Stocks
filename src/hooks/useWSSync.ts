import { useEffect, useRef } from 'react'

export function useWSSync(onRefresh: () => void) {
  const cbRef = useRef(onRefresh)
  cbRef.current = onRefresh
  useEffect(() => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    let ws: WebSocket
    let retry: ReturnType<typeof setTimeout>
    const connect = () => {
      ws = new WebSocket(`${proto}://${location.host}/ws`)
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data)
        if (msg.event === 'data_changed') cbRef.current()
      }
      ws.onclose = () => { retry = setTimeout(connect, 3000) }
    }
    connect()
    return () => { ws?.close(); clearTimeout(retry) }
  }, [])
}
