import Ic from '../icons'

interface Props {
  message: string
  onRetry: () => void
}

export default function ErrorBlock({ message, onRetry }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 px-4 text-center">
      <span className="text-red-400"><Ic.Warning /></span>
      <p className="text-sm text-gray-400 max-w-sm">{message}</p>
      <button onClick={onRetry}
        className="flex items-center gap-1.5 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 rounded-lg text-xs font-medium transition-colors">
        <Ic.Refresh /> Retry
      </button>
    </div>
  )
}
