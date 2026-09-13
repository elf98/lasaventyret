import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { audio } from '../audio/AudioManager'
import { sfx } from '../audio/sfx'

interface Props {
  icon: ReactNode
  /** Ljud-id som läses upp när knappen trycks (t.ex. phrase.btn_play). */
  speakId?: string
  onPress: () => void
  size?: 'md' | 'lg' | 'xl'
  color?: string
  className?: string
  disabled?: boolean
  label: string
}

const sizes = { md: 'w-20 h-20 text-[40px]', lg: 'w-28 h-28 text-[56px]', xl: 'w-40 h-40 text-[88px]' }

/**
 * Stor ikonknapp utan text. Läser upp sin etikett med röst när den trycks
 * och gör sedan sin sak direkt, så barnet aldrig behöver vänta.
 */
export default function BigButton({ icon, speakId, onPress, size = 'lg', color = 'bg-go', className = '', disabled, label }: Props) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      disabled={disabled}
      whileTap={{ scale: 0.88 }}
      whileHover={{ scale: 1.05 }}
      onPointerDown={() => sfx.pop()}
      onClick={() => {
        if (speakId) void audio.speak(speakId)
        onPress()
      }}
      className={`${sizes[size]} ${color} big-emoji flex items-center justify-center rounded-full shadow-[0_8px_0_rgba(0,0,0,0.3)] disabled:opacity-40 ${className}`}
    >
      <span className="big-emoji">{icon}</span>
    </motion.button>
  )
}
