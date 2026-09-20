import { motion } from 'framer-motion'
import { useEffect } from 'react'
import { audio } from '../audio/AudioManager'
import { sfx } from '../audio/sfx'
import BigButton from '../components/BigButton'
import { burstConfetti } from '../components/confetti'
import Mascot from '../components/Mascot'
import StarRating from '../components/StarRating'
import Starfield from '../components/Starfield'
import { outfits, zones } from '../content'
import { phraseId, zoneDoneId } from '../content/audioIds'
import { useApp } from '../store/app'

/** Efter passet: konfetti, stjärnor, ev. klistermärke, nytt plagg och raketdel. */
export default function RewardScreen() {
  const summary = useApp((s) => s.summary)
  const go = useApp((s) => s.go)
  const part = summary ? zones.find((z) => summary.newParts.includes(z.part)) : undefined

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
    // Raketdelen sist: det är berättelsens belöning och ska få stå för sig själv.
    if (part) lines.push(phraseId('zone_part'), zoneDoneId(part.id))
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
  // Lampan är sista delen: då är raketen hel och resan slut.
  const finale = part?.part === 'lamp'

  return (
    <div className="screen flex items-center justify-center gap-12">
      <Starfield />
      <div className="relative z-10">
        <Mascot size={230} mood="celebrate" />
      </div>
      <div className="relative z-10 flex flex-col items-center gap-6">
        <div className="flex items-center gap-6">
          <StarRating value={summary.stars} size={96} animate />
          {summary.bestStreak >= 3 && (
            <motion.div initial={{ scale: 0 }} animate={{ scale: [0, 1.2, 1] }} transition={{ delay: 1.2 }} className="flex items-center gap-2 rounded-full bg-sun px-5 py-2 text-[36px] font-extrabold text-space" aria-label={`bästa rad ${summary.bestStreak}`}>
              <span>⚡</span>
              <span>{summary.bestStreak}</span>
            </motion.div>
          )}
        </div>
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
          {summary.newlyCompleted.length > 0 && !part && (
            <motion.div initial={{ scale: 0 }} animate={{ scale: [0, 1.4, 1] }} transition={{ delay: 1 }} className="big-emoji text-[120px]">
              🏆
            </motion.div>
          )}
          {part && (
            <motion.div initial={{ scale: 0, rotate: -20 }} animate={{ scale: [0, 1.4, 1.1], rotate: [-20, 10, 0] }} transition={{ delay: 2.6, duration: 0.9 }} className="flex flex-col items-center gap-1 rounded-3xl bg-white px-8 py-4 text-space shadow-xl">
              <span className="big-emoji text-[110px]">{part.partEmoji}</span>
              <span className="text-[30px] font-extrabold">{part.partName}</span>
            </motion.div>
          )}
        </div>
        <BigButton icon={finale ? '🚀' : '🗺️'} speakId={finale ? undefined : phraseId('btn_home')} onPress={() => go(finale ? 'finale' : 'map')} label={finale ? 'Flyg hem' : 'Till kartan'} />
      </div>
    </div>
  )
}
