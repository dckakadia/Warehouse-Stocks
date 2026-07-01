import { useEffect, useState } from 'react'
import { APP_VERSION } from '../version'

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
    // Only show APK update prompt when running inside the native Android app
    const isNative = !!(window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()
    if (!isNative) return

    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/version.json?_=' + Date.now())
        if (!res.ok) return
        const data: VersionInfo = await res.json()
        if (data.version && isNewer(data.version, APP_VERSION)) {
          setUpdateInfo(data)
        }
      } catch {
        // network unavailable — ignore silently
      }
    }, 3000)

    return () => clearTimeout(timer)
  }, [])

  return updateInfo
}
