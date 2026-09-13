import { motion } from 'framer-motion'
import { useRef, useState } from 'react'
import { audio } from '../audio/AudioManager'
import { phraseId } from '../content/audioIds'

interface Props {
  onHold: () => void
  holdMs?: number
  className?: string
}

/**
 * Föräldraknapp: måste hållas in (3 s). Ett kort tryck ger bara
 * en vänlig röst som förklarar att det är för vuxna.
 */
export default function HoldButton({ onHold, holdMs = 3000, className = '' }: Props) {
  const [progress, setProgress] = useState(0)
  const timer = useRef<number | null>(null)
  const start = useRef(0)

  const stop = (fired: boolean) => {
    if (timer.current) window.clearInterval(timer.current)
    timer.current = null
    const held = Date.now() - start.current
    setProgress(0)
    if (!fired && held > 150 && held < holdMs) void audio.speak(phraseId('parent_only'))
  }

  const begin = () => {
    if (timer.current) return
    start.current = Date.now()
    // setInterval i stället för requestAnimationFrame: rAF pausas i dolda flikar.
    timer.current = window.setInterval(() => {
      const p = Math.min(1, (Date.now() - start.current) / holdMs)
      setProgress(p)
      if (p >= 1) {
        stop(true)
        onHold()
      }
    }, 50)
  }

  const r = 30
  const c = 2 * Math.PI * r

  return (
    <motion.button
      type="button"
      aria-label="Föräldrar"
      whileTap={{ scale: 0.92 }}
      onPointerDown={begin}
      onPointerUp={() => stop(false)}
      onPointerLeave={() => timer.current && stop(false)}
      onPointerCancel={() => stop(false)}
      onContextMenu={(e) => e.preventDefault()}
      className={`relative flex h-16 w-16 items-center justify-center rounded-full bg-black/40 text-[30px] ${className}`}
    >
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 68 68">
        <circle cx="34" cy="34" r={r} fill="none" stroke="#fff" strokeOpacity="0.15" strokeWidth="5" />
        <circle cx="34" cy="34" r={r} fill="none" stroke="#ffcc33" strokeWidth="5" strokeDasharray={c} strokeDashoffset={c * (1 - progress)} strokeLinecap="round" />
      </svg>
      <span className="big-emoji">⚙️</span>
    </motion.button>
  )
}
