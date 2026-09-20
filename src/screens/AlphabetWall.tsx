import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { audio } from '../audio/AudioManager'
import { sfx } from '../audio/sfx'
import BigButton from '../components/BigButton'
import LetterCard from '../components/LetterCard'
import Mascot from '../components/Mascot'
import Starfield from '../components/Starfield'
import { letters, wordById } from '../content'
import { letterSoundId, phraseId, wordId } from '../content/audioIds'
import { useApp } from '../store/app'
import { useProgress } from '../store/progress'

/**
 * Alfabetsväggen: alla bokstäver i alfabetisk ordning. Behärskade lyser, påbörjade skymtar, otränade
 * är släckta. Barnet ser vad det faktiskt lärt sig, inte en abstrakt mätare. Tryck ger ljudet och
 * exempelordet.
 */
export default function AlphabetWall() {
  const go = useApp((s) => s.go)
  const mastery = useProgress((s) => s.mastery)
  const [active, setActive] = useState<string | null>(null)
  const sorted = [...letters].sort((a, b) => a.id.localeCompare(b.id, 'sv'))
  const known = sorted.filter((l) => mastery[l.id]?.mastered).length

  useEffect(() => {
    void audio.speak(phraseId('alphabet_intro'))
    return () => audio.stop()
  }, [])

  const tap = async (id: string) => {
    sfx.pop()
    setActive(id)
    const example = letters.find((l) => l.id === id)?.example
    await audio.speak([letterSoundId(id), ...(example ? [wordId(example)] : [])])
  }

  const example = active ? wordById.get(letters.find((l) => l.id === active)?.example ?? '') : undefined

  return (
    <div className="screen flex flex-col items-center justify-center gap-6">
      <Starfield count={40} />
      <div className="absolute top-4 left-4 z-10">
        <BigButton size="md" icon="🗺️" color="bg-black/40" speakId={phraseId('btn_home')} onPress={() => go('map')} label="Till kartan" />
      </div>
      <div className="absolute top-6 right-6 z-10 rounded-full bg-black/40 px-5 py-2 text-[24px] font-extrabold text-white/80" aria-label={`${known} av ${sorted.length} bokstäver behärskade`}>
        {known} / {sorted.length}
      </div>
      <div className="relative z-10 flex max-w-[94vw] flex-wrap justify-center gap-2.5">
        {sorted.map((l) => {
          const m = mastery[l.id]
          const state = m?.mastered ? 'done' : m && m.attempts > 0 ? 'going' : 'new'
          return (
            <motion.button
              key={l.id}
              type="button"
              aria-label={l.id}
              onPointerDown={() => void tap(l.id)}
              whileTap={{ scale: 0.9 }}
              animate={active === l.id ? { scale: [1, 1.2, 1.1] } : { scale: 1 }}
              className={`rounded-3xl ${state === 'done' ? 'glow' : ''} ${state === 'going' ? 'opacity-60' : ''} ${state === 'new' ? 'opacity-25 grayscale' : ''}`}
            >
              <LetterCard letterId={l.id} size={82} />
            </motion.button>
          )
        })}
      </div>
      <div className="relative z-10 flex h-28 items-center gap-5">
        {example && active && (
          <motion.div key={active} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex items-center gap-5 rounded-[32px] bg-white/95 px-8 py-3 text-space shadow-2xl">
            <span className="big-emoji text-[64px]">{example.emoji}</span>
            <span className="text-[48px] font-extrabold uppercase">
              {example.text.split('').map((c, i) => (
                <span key={i} className={c.toLowerCase() === active ? 'text-go' : ''}>
                  {c}
                </span>
              ))}
            </span>
          </motion.div>
        )}
      </div>
      <div className="absolute bottom-4 left-4 z-10">
        <Mascot size={120} mood={known > 0 ? 'happy' : 'think'} />
      </div>
    </div>
  )
}
