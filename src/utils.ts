export const W_COLORS = [
  'bg-blue-800/40 text-blue-300 border-blue-700/60',
  'bg-purple-800/40 text-purple-300 border-purple-700/60',
  'bg-teal-800/40 text-teal-300 border-teal-700/60',
  'bg-amber-800/40 text-amber-300 border-amber-700/60',
]

export const whColor = (wid: number) => W_COLORS[(wid - 1) % W_COLORS.length]

export function todayISO() {
  return new Date().toISOString().split('T')[0]
}

export function parseKgPerBag(ps: string): number {
  const m = ps.match(/^(\d+(?:\.\d+)?)\s*kg/i)
  return m ? parseFloat(m[1]) : 0
}

export async function compressImage(file: File): Promise<string> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const MAX = 600
      const scale = Math.min(MAX / img.width, MAX / img.height, 1)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.78))
    }
    img.src = url
  })
}
