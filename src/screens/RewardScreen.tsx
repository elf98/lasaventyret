import { motion } from 'framer-motion'
import { useEffect } from 'react'
import { audio } from '../audio/AudioManager'
import { sfx } from '../audio/sfx'
import BigButton from '../components/BigButton'
import { burstConfetti } from '../components/confetti'
import Mascot from '../components/Mascot'
import Starfield from '../components/Starfield'
import { outfits } from '../content'
import { phraseId } from '../content/audioIds'
import { useApp } from '../store/app'

/** Efter passet: konfetti, stjärnor, ev. klistermärke och nytt plagg. */
export default function RewardScreen() {
  const summary = useApp((s) => s.summary)
  const go = useApp((s) => s.go)

  useEffect(() => {
    if (!summary) {
      go('map')
      return
    }
    sfx.jingle()
    burstConfetti()
    const t = setTimeout(burstConfetti, 900)
    const lines = summary.newlyCompleted.length
      ? [phraseId('level_complete'), phraseId('well_done_planet')]
      : [phraseId('session_done'), phraseId('stars_earned')]
    if (summary.sticker) lines.push(phraseId('sticker_earned'))
    if (summary.newOutfit) lines.push(phraseId('new_outfit'))
    void audio.speak(lines)
    return () => {
      clearTimeout(t)
      audio.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!summary) return null
  const outfit = outfits.find((o) => o.id === summary.newOutfit)
  const starList = Array.from({ length: Math.min(summary.stars, 16) })

  return (
    <div className="screen flex items-center justify-center gap-12">
      <Starfield />
      <div className="relative z-10">
        <Mascot size={230} mood="celebrate" />
      </div>
      <div className="relative z-10 flex flex-col items-center gap-6">
        <div className="flex max-w-[520px] flex-wrap justify-center gap-2">
          {starList.map((_, i) => (
            <motion.span
              key={i}
              initial={{ scale: 0, rotate: -90, y: 60 }}
              animate={{ scale: 1, rotate: 0, y: 0 }}
              transition={{ delay: 0.15 + i * 0.09, type: 'spring', stiffness: 300 }}
              onAnimationComplete={() => sfx.star()}
              className="big-emoji text-[52px]"
            >
              ⭐
            </motion.span>
          ))}
        </div>
        <div className="flex items-center gap-8">
          {summary.sticker && (
            <motion.div initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: [0, -8, 8, 0] }} transition={{ delay: 1.6, type: 'spring' }} className="flex h-40 w-40 items-center justify-center rounded-3xl bg-white/90 shadow-xl">
              <span className="big-emoji text-[100px]">{summary.sticker}</span>
            </motion.div>
          )}
          {outfit && (
            <motion.div initial={{ scale: 0 }} animate={{ scale: [0, 1.3, 1] }} transition={{ delay: 2.2 }} className="flex h-40 w-40 items-center justify-center rounded-3xl bg-sun/80 shadow-xl">
              <span className="big-emoji text-[100px]">{outfit.emoji}</span>
            </motion.div>
          )}
          {summary.newlyCompleted.length > 0 && (
            <motion.div initial={{ scale: 0 }} animate={{ scale: [0, 1.4, 1] }} transition={{ delay: 1 }} className="big-emoji text-[120px]">
              🏆
            </motion.div>
          )}
        </div>
        <BigButton icon="🗺️" speakId={phraseId('btn_home')} onPress={() => go('map')} label="Till kartan" />
      </div>
    </div>
  )
}
