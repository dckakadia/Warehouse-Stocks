import { useEffect } from 'react'
import Ic from '../icons'

interface Props {
  src: string
  title: string
  onClose: () => void
}

export default function Lightbox({ src, title, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90" onClick={onClose}>
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors z-10"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <Ic.X />
      </button>
      <img
        src={src}
        alt={title}
        className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
        onClick={e => e.stopPropagation()}
      />
      {title && <p className="mt-4 text-sm font-medium text-gray-300 px-6 text-center">{title}</p>}
    </div>
  )
}
