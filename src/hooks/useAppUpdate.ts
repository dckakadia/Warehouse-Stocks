import { useEffect, useState } from 'react'

interface VersionInfo {
  version: string
  apk_url: string
}

function isNewer(remote: string, local: string): boolean {
  const r = remote.split('.').map(Number)
  const l = local.split('.').map(Number)
  for (let i = 0; i < Math.max(r.length, l.length); i++) {
    if ((r[i] ?? 0) > (l[i] ?? 0)) return true
    if ((r[i] ?? 0) < (l[i] ?? 0)) return false
  }
  return false
}

export function useAppUpdate() {
  const [updateInfo, setUpdateInfo] = useState<VersionInfo | null>(null)

  useEffect(() => {
    const isNative = !!(window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()
    if (!isNative) return

    const run = async () => {
      try {
        const { App } = await import('@capacitor/app')
        const info = await App.getInfo()
        const res = await fetch('http://116.74.77.22:8088/version.json?_=' + Date.now())
        if (!res.ok) return
        const data: VersionInfo = await res.json()
        if (data.version && isNewer(data.version, info.version)) {
          setUpdateInfo(data)
        }
      } catch {
        // silently ignore — no network or version check failed
      }
    }

    const timer = setTimeout(run, 3000)
    return () => clearTimeout(timer)
  }, [])

  return updateInfo
}
