import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { audio } from '../audio/AudioManager'
import { sfx } from '../audio/sfx'
import BigButton from '../components/BigButton'
import Starfield from '../components/Starfield'
import { mascots, names } from '../content'
import { mascotIntroId, nameHelloId, nameId, phraseId } from '../content/audioIds'
import { useApp } from '../store/app'
import { useProgress } from '../store/progress'

/** Välj maskot, välj namn. Allt läses upp, inget behöver läsas. */
export default function Onboarding() {
  const go = useApp((s) => s.go)
  const setMascot = useProgress((s) => s.setMascot)
  const [step, setStep] = useState<'mascot' | 'name'>('mascot')
  const [mascot, setMascotSel] = useState<string | null>(null)
  const [name, setName] = useState<string | null>(null)

  useEffect(() => {
    void audio.speak([phraseId('welcome'), phraseId('choose_mascot')])
    return () => audio.stop()
  }, [])

  const pickMascot = (id: string) => {
    sfx.pop()
    setMascotSel(id)
    void audio.speak(mascotIntroId(id))
  }

  const pickName = (id: string) => {
    sfx.pop()
    setName(id)
    void audio.speak(nameId(id))
  }

  const confirmMascot = () => {
    setStep('name')
    void audio.speak(phraseId('choose_name'))
  }

  const confirmName = async () => {
    if (!mascot || !name) return
    const n = names.find((x) => x.id === name)!
    setMascot(mascot, name, n.text)
    sfx.tada()
    await audio.speak(nameHelloId(name))
    go('map')
  }

  const chosenEmoji = mascots.find((m) => m.id === mascot)?.emoji ?? ''

  return (
    <div className="screen flex flex-col items-center justify-center gap-8">
      <Starfield />
      {step === 'mascot' && (
        <div className="relative z-10 flex items-center gap-10">
          {mascots.map((m, i) => (
            <motion.button
              key={m.id}
              type="button"
              aria-label={m.intro}
              onClick={() => pickMascot(m.id)}
              whileTap={{ scale: 0.9 }}
              animate={{ y: [0, -14, 0] }}
              transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.3 }}
              className={`big-emoji flex h-56 w-56 items-center justify-center rounded-[40px] text-[130px] transition-colors ${mascot === m.id ? 'bg-sun/30 ring-8 ring-sun' : 'bg-white/10'}`}
            >
              {m.emoji}
            </motion.button>
          ))}
        </div>
      )}
      {step === 'name' && (
        <div className="relative z-10 flex flex-col items-center gap-6">
          <div className="big-emoji text-[110px]">{chosenEmoji}</div>
          <div className="grid grid-cols-3 gap-5">
            {names.map((n) => (
              <motion.button
                key={n.id}
                type="button"
                onClick={() => pickName(n.id)}
                whileTap={{ scale: 0.92 }}
                className={`h-24 min-w-56 rounded-full px-8 text-[40px] font-extrabold transition-colors ${name === n.id ? 'bg-sun text-space' : 'bg-white/15 text-white'}`}
              >
                {n.text}
              </motion.button>
            ))}
          </div>
        </div>
      )}
      <div className="relative z-10 h-28">
        {step === 'mascot' && mascot && <BigButton icon="✅" speakId={phraseId('btn_continue')} onPress={confirmMascot} label="Fortsätt" />}
        {step === 'name' && name && <BigButton icon="✅" speakId={phraseId('btn_continue')} onPress={() => void confirmName()} label="Fortsätt" />}
      </div>
    </div>
  )
}
