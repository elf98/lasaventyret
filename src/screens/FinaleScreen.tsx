import { motion } from 'framer-motion'
import { useEffect } from 'react'
import { audio } from '../audio/AudioManager'
import { sfx } from '../audio/sfx'
import BigButton from '../components/BigButton'
import { burstConfetti } from '../components/confetti'
import Mascot from '../components/Mascot'
import Rocket from '../components/Rocket'
import Starfield from '../components/Starfield'
import { phraseId } from '../content/audioIds'
import { useApp } from '../store/app'
import { useProgress } from '../store/progress'

/** Slutet: raketen är hel och flyger hem. Fyrverkeri, maskoten tackar, och kartan finns kvar att spela. */
export default function FinaleScreen() {
  const go = useApp((s) => s.go)
  const parts = useProgress((s) => s.rocketParts)

  useEffect(() => {
    sfx.jingle()
    const bursts = [0, 800, 1700, 2800, 4000].map((ms) => setTimeout(burstConfetti, ms))
    void audio.speak(phraseId('story_home'))
    return () => {
      bursts.forEach(clearTimeout)
      audio.stop()
    }
  }, [])

  return (
    <div className="screen flex items-center justify-center gap-16">
      <Starfield />
      <motion.div initial={{ y: 260, scale: 0.7 }} animate={{ y: [260, -20, 0], scale: [0.7, 1.05, 1] }} transition={{ duration: 2.2, ease: 'easeOut' }} className="relative z-10">
        <Rocket parts={parts.length ? parts : ['motor', 'stick', 'lamp']} size={Math.min(520, window.innerHeight * 0.78)} />
      </motion.div>
      <div className="relative z-10 flex flex-col items-center gap-8">
        <Mascot size={220} mood="celebrate" />
        <BigButton icon="🗺️" speakId={phraseId('btn_home')} onPress={() => go('map')} label="Till kartan" />
      </div>
    </div>
  )
}
