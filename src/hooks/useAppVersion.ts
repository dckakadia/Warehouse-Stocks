import { useEffect, useState } from 'react'
import { APP_VERSION } from '../version'

// Reads the version straight off the installed APK (native versionName) instead of trusting the
// APP_VERSION constant, which has to be bumped by hand and has drifted out of sync with the actual
// build before — this way every APK always shows its own real version, automatically.
export function useAppVersion(): string {
  const [version, setVersion] = useState(APP_VERSION)

  useEffect(() => {
    const isNative = !!(window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()
    if (!isNative) return
    let cancelled = false
    ;(async () => {
      try {
        const { App } = await import('@capacitor/app')
        const info = await App.getInfo()
        if (!cancelled) setVersion(info.version)
      } catch {
        // keep the APP_VERSION fallback
      }
    })()
    return () => { cancelled = true }
  }, [])

  return version
}
