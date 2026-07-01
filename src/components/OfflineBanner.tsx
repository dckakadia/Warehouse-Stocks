import Ic from '../icons'

export default function OfflineBanner() {
  return (
    <div className="bg-gray-700 text-white shadow-xl">
      <div className="flex items-center gap-3 px-4 py-2.5">
        <span className="flex-shrink-0 text-gray-300"><Ic.Warning /></span>
        <p className="text-sm font-medium">You're offline — changes won't save until reconnected</p>
      </div>
    </div>
  )
}
