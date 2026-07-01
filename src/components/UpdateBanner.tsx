import { useState } from 'react'

export default function UpdateBanner({ version, apkUrl }: { version: string; apkUrl: string }) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  const handleUpdate = () => {
    // Opens APK URL — Android downloads it and prompts installation
    window.open(apkUrl, '_system')
  }

  return (
    <div className="bg-blue-600 text-white shadow-xl">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight">Update available — v{version}</p>
          <p className="text-xs text-blue-200 mt-0.5">Tap Update to download and install the latest version</p>
        </div>
        <button
          onClick={handleUpdate}
          className="shrink-0 px-4 py-1.5 bg-white text-blue-700 text-xs font-bold rounded-lg hover:bg-blue-50 transition-colors">
          Update
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 text-blue-200 hover:text-white text-xl leading-none px-1">
          ×
        </button>
      </div>
    </div>
  )
}
