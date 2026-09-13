import { motion } from 'framer-motion'
import { useState } from 'react'
import { sfx } from '../audio/sfx'

interface Props {
  onClose: () => void
  onSuccess: () => void
}

function question() {
  const a = 2 + Math.floor(Math.random() * 8)
  const b = 2 + Math.floor(Math.random() * 8)
  return { a, b }
}

/** Enkel räkneuppgift som andra spärren i föräldralåset. Text är okej här, den är för vuxna. */
export default function ParentGate({ onClose, onSuccess }: Props) {
  const [q, setQ] = useState(question)
  const [answer, setAnswer] = useState('')
  const [shake, setShake] = useState(0)

  const press = (d: string) => {
    sfx.click()
    setAnswer((a) => (a.length < 2 ? a + d : a))
  }

  const check = () => {
    if (Number(answer) === q.a + q.b) {
      sfx.tada()
      onSuccess()
    } else {
      sfx.soft()
      setShake((s) => s + 1)
      setQ(question())
      setAnswer('')
    }
  }

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70" onClick={onClose}>
      <motion.div
        key={shake}
        initial={{ x: shake ? -12 : 0 }}
        animate={{ x: 0 }}
        transition={{ type: 'spring', stiffness: 700, damping: 12 }}
        onClick={(e) => e.stopPropagation()}
        className="flex items-center gap-8 rounded-3xl bg-white p-6 text-space"
      >
        <div className="flex flex-col items-center gap-3">
          <div className="text-[22px] font-semibold text-gray-500">Föräldralås</div>
          <div className="text-[44px] font-extrabold">
            {q.a} + {q.b} = <span className="inline-block min-w-16 border-b-4 border-space text-center">{answer || ' '}</span>
          </div>
          <button type="button" onClick={onClose} className="mt-2 rounded-full bg-gray-200 px-6 py-2 text-[20px] font-semibold">
            Stäng
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✓'].map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => (k === '⌫' ? setAnswer((a) => a.slice(0, -1)) : k === '✓' ? check() : press(k))}
              className={`h-16 w-16 rounded-2xl text-[28px] font-bold ${k === '✓' ? 'bg-go text-white' : 'bg-gray-100'}`}
            >
              {k}
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  )
}
