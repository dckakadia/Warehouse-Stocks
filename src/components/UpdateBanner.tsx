import { useState } from 'react'

export default function UpdateBanner({ version, apkUrl }: { version: string; apkUrl: string }) {
  const [dismissed, setDismissed] = useState(false)
  const [showManualLink, setShowManualLink] = useState(false)
  if (dismissed) return null

  const handleUpdate = () => {
    if (window.AndroidUpdater) {
      // Downloads via Android's DownloadManager and hands off to the system installer —
      // window.open(url, '_system') never worked here, there's no plugin backing that target.
      window.AndroidUpdater.downloadAndInstall(apkUrl)
    } else {
      // Installed APKs built before this native bridge existed don't have it yet — the only
      // reliable fallback is letting the user open the link in their phone's own browser.
      setShowManualLink(true)
    }
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
      {showManualLink && (
        <div className="px-4 pb-3 text-xs text-blue-100">
          Couldn't start the download automatically — open this link in your phone's browser to install the update:
          <a href={apkUrl} target="_blank" rel="noreferrer" className="block mt-1 underline break-all text-white">
            {apkUrl}
          </a>
        </div>
      )}
    </div>
  )
}
