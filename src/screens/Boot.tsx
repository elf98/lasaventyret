import { motion } from 'framer-motion'
import { audio } from '../audio/AudioManager'
import { sfx, unlockSfx } from '../audio/sfx'
import Starfield from '../components/Starfield'
import { useApp } from '../store/app'
import { useProgress } from '../store/progress'

/** Startskärm: ett enda stort tryck som låser upp ljudet (krav på iOS). */
export default function Boot() {
  const go = useApp((s) => s.go)
  const resetPlayTimer = useApp((s) => s.resetPlayTimer)
  const onboarded = useProgress((s) => s.onboarded)

  const start = () => {
    audio.unlock()
    unlockSfx()
    sfx.whoosh()
    resetPlayTimer()
    go(onboarded ? 'map' : 'onboarding')
  }

  return (
    <div className="screen flex items-center justify-center">
      <Starfield />
      <motion.button
        type="button"
        aria-label="Starta"
        onClick={start}
        whileTap={{ scale: 0.85 }}
        animate={{ y: [0, -16, 0], rotate: [0, -5, 5, 0] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
        className="big-emoji relative z-10 text-[170px]"
      >
        🚀
      </motion.button>
      <motion.div
        aria-hidden
        animate={{ scale: [1, 1.25, 1], y: [0, -6, 0] }}
        transition={{ duration: 1, repeat: Infinity }}
        className="big-emoji absolute bottom-[12%] left-1/2 -translate-x-1/2 text-[64px]"
      >
        👆
      </motion.div>
    </div>
  )
}
