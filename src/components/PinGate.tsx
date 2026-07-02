import { useState } from 'react'

// TODO: move to env var before sharing APK externally
const WAREHOUSE_PIN = '7477'

type Key = { kind: 'digit'; digit: string; sub?: string } | { kind: 'blank' } | { kind: 'del' }

const KEYS: Key[] = [
  { kind: 'digit', digit: '1' }, { kind: 'digit', digit: '2', sub: 'ABC' }, { kind: 'digit', digit: '3', sub: 'DEF' },
  { kind: 'digit', digit: '4', sub: 'GHI' }, { kind: 'digit', digit: '5', sub: 'JKL' }, { kind: 'digit', digit: '6', sub: 'MNO' },
  { kind: 'digit', digit: '7', sub: 'PQRS' }, { kind: 'digit', digit: '8', sub: 'TUV' }, { kind: 'digit', digit: '9', sub: 'WXYZ' },
  { kind: 'blank' }, { kind: 'digit', digit: '0' }, { kind: 'del' },
]

interface Props {
  onSuccess: () => void
}

export function PinGate({ onSuccess }: Props) {
  const [entered, setEntered] = useState('')
  const [dotState, setDotState] = useState<'idle' | 'success' | 'error'>('idle')
  const [shaking, setShaking] = useState(false)

  const handleKey = (digit: string) => {
    if (entered.length >= 4) return
    const next = entered + digit
    setEntered(next)
    if (next.length === 4) {
      if (next === WAREHOUSE_PIN) {
        setDotState('success')
        setTimeout(() => onSuccess(), 400)
      } else {
        setDotState('error')
        setShaking(true)
        setTimeout(() => {
          setShaking(false)
          setDotState('idle')
          setEntered('')
        }, 600)
      }
    }
  }

  const handleDelete = () => setEntered(prev => prev.slice(0, -1))

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center bg-gray-950">
      <div className="pt-12 flex flex-col items-center">
        <div className="w-14 h-14 rounded-2xl bg-gray-800 flex items-center justify-center">
          <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 018 0v4" />
          </svg>
        </div>
        <p className="text-white text-lg font-medium mt-4">Enter PIN</p>
      </div>

      <div className={`flex flex-row gap-4 my-8 ${shaking ? 'shake' : ''}`}>
        {Array.from({ length: 4 }).map((_, i) => {
          const filled = i < entered.length
          const stateClass =
            dotState === 'success' ? 'bg-green-400 border-green-400' :
            dotState === 'error'   ? 'bg-red-400 border-red-400' :
            filled                 ? 'bg-white border-white' :
                                      'border-gray-600 bg-transparent'
          return <div key={i} className={`w-4 h-4 rounded-full border-2 ${stateClass}`} />
        })}
      </div>

      <div className="grid grid-cols-3 gap-3 w-full max-w-xs px-4">
        {KEYS.map((key, i) => {
          if (key.kind === 'blank') return <div key={i} className="h-16" />
          if (key.kind === 'del') {
            return (
              <button key={i} type="button" onClick={handleDelete}
                className="h-16 rounded-2xl bg-transparent flex items-center justify-center text-white text-xl select-none cursor-pointer">
                ⌫
              </button>
            )
          }
          return (
            <button key={i} type="button" onClick={() => handleKey(key.digit)}
              className="h-16 rounded-2xl bg-gray-800 flex flex-col items-center justify-center text-white text-xl active:bg-gray-700 select-none cursor-pointer">
              {key.digit}
              {key.sub && <span className="text-[8px] text-gray-500 tracking-widest mt-0.5">{key.sub}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
