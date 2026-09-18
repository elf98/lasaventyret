import { motion } from 'framer-motion'
import { useEffect } from 'react'
import { audio } from '../audio/AudioManager'
import { sfx } from '../audio/sfx'
import BigButton from '../components/BigButton'
import { burstConfetti } from '../components/confetti'
import Mascot from '../components/Mascot'
import StarRating from '../components/StarRating'
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
    const starSfx = Array.from({ length: summary.stars }, (_, i) => setTimeout(() => sfx.star(), 500 + i * 350))
    const t = setTimeout(burstConfetti, 900)
    const starsLine = phraseId(`stars_${Math.min(3, Math.max(1, summary.stars))}`)
    const lines = summary.newlyCompleted.length
      ? [phraseId('level_complete'), phraseId('well_done_planet'), starsLine]
      : [phraseId('session_done'), starsLine]
    if (summary.sticker) lines.push(phraseId('sticker_earned'))
    if (summary.newOutfit) lines.push(phraseId('new_outfit'))
    void audio.speak(lines)
    return () => {
      clearTimeout(t)
      starSfx.forEach(clearTimeout)
      audio.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!summary) return null
  const outfit = outfits.find((o) => o.id === summary.newOutfit)

  return (
    <div className="screen flex items-center justify-center gap-12">
      <Starfield />
      <div className="relative z-10">
        <Mascot size={230} mood="celebrate" />
      </div>
      <div className="relative z-10 flex flex-col items-center gap-6">
        <StarRating value={summary.stars} size={96} animate />
        <div className="flex items-center gap-8">
          {summary.sticker && (
            <motion.div initial={{ scale: 0 }} animate={{ scale: [0, 1.15, 1], rotate: [0, -8, 8, 0] }} transition={{ delay: 1.6, duration: 0.7 }} className="flex h-40 w-40 items-center justify-center rounded-3xl bg-white/90 shadow-xl">
              {/* ingen drop-shadow-filter här: Safari lämnade rutan tom första gången */}
              <span className="text-[100px] leading-none">{summary.sticker}</span>
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
