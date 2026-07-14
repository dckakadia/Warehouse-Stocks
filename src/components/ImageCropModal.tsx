import { useEffect, useRef, useState } from 'react'
import Ic from '../icons'

interface Props {
  file: File
  onCancel: () => void
  onCropped: (dataUri: string) => void
}

const OUTPUT_SIZE = 600
const JPEG_QUALITY = 0.78
const STAGE_SIZE = 320
const MAX_ZOOM = 3

export default function ImageCropModal({ file, onCancel, onCropped }: Props) {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [error, setError] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => { if (!cancelled) setImg(image) }
    image.onerror = () => { if (!cancelled) setError(true) }
    image.src = url
    return () => { cancelled = true; URL.revokeObjectURL(url) }
  }, [file])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  // "Cover" fit: the smaller of width/height-based scale so the image always fully covers the
  // square stage, matching the object-cover thumbnails used everywhere this photo is displayed.
  const baseScale = img ? Math.max(STAGE_SIZE / img.width, STAGE_SIZE / img.height) : 1
  const displayW = img ? img.width * baseScale * zoom : 0
  const displayH = img ? img.height * baseScale * zoom : 0

  const clamp = (x: number, y: number, w: number, h: number) => ({
    x: Math.min(0, Math.max(STAGE_SIZE - w, x)),
    y: Math.min(0, Math.max(STAGE_SIZE - h, y)),
  })

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return
    const { startX, startY, origX, origY } = dragRef.current
    const next = clamp(origX + (e.clientX - startX), origY + (e.clientY - startY), displayW, displayH)
    setPos(next)
  }
  const onPointerUp = () => { dragRef.current = null }

  const onZoomChange = (z: number) => {
    if (!img) return
    const w = img.width * baseScale * z
    const h = img.height * baseScale * z
    setZoom(z)
    setPos(p => clamp(p.x, p.y, w, h))
  }

  const confirm = () => {
    if (!img) return
    const sourceScale = 1 / (baseScale * zoom)
    const sx = -pos.x * sourceScale
    const sy = -pos.y * sourceScale
    const sSize = STAGE_SIZE * sourceScale
    const canvas = document.createElement('canvas')
    canvas.width = OUTPUT_SIZE
    canvas.height = OUTPUT_SIZE
    canvas.getContext('2d')!.drawImage(img, sx, sy, sSize, sSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE)
    onCropped(canvas.toDataURL('image/jpeg', JPEG_QUALITY))
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4" onClick={onCancel}>
      <button
        onClick={onCancel}
        className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors z-10"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <Ic.X />
      </button>

      <div onClick={e => e.stopPropagation()} className="flex flex-col items-center gap-4">
        <p className="text-sm font-medium text-gray-300">Drag to reposition</p>

        {error ? (
          <p className="text-sm text-red-400">Couldn't load this image.</p>
        ) : !img ? (
          <div style={{ width: STAGE_SIZE, height: STAGE_SIZE }} className="flex items-center justify-center text-gray-500 text-sm">
            Loading…
          </div>
        ) : (
          <>
            <div
              style={{ width: STAGE_SIZE, height: STAGE_SIZE, touchAction: 'none' }}
              className="relative overflow-hidden rounded-lg border-2 border-white/80 shadow-2xl cursor-move"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <img
                src={img.src}
                alt="Crop preview"
                draggable={false}
                style={{ position: 'absolute', left: pos.x, top: pos.y, width: displayW, height: displayH, maxWidth: 'none' }}
              />
            </div>

            <div className="flex items-center gap-3 w-full max-w-xs">
              <span className="text-gray-500 text-xs">Zoom</span>
              <input
                type="range"
                min={1}
                max={MAX_ZOOM}
                step={0.01}
                value={zoom}
                onChange={e => onZoomChange(Number(e.target.value))}
                className="flex-1"
              />
            </div>

            <div className="flex gap-3 w-full max-w-xs">
              <button type="button" onClick={onCancel}
                className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm font-medium transition-colors">
                Cancel
              </button>
              <button type="button" onClick={confirm}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors">
                Use Photo
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
