import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { audio } from '../audio/AudioManager'
import { sfx } from '../audio/sfx'
import { starBurst } from '../components/confetti'
import Mascot from '../components/Mascot'
import { useCaseClass } from '../components/textCase'
import { letterById, wordById } from '../content'
import { letterLongSoundId, letterSoundId, phraseId, wordId } from '../content/audioIds'
import { longVowelIndex } from '../content/sounds'
import type { Task } from '../engine/types'

interface Props {
  task: Task
  scaffold: boolean
  eliminated?: string[]
  celebrating: boolean
  brief?: boolean
  onWrong: (picked?: string) => void
  onSolved: () => void
}

/**
 * Långt eller kort? (Dubbelplaneten). Ordet hörs, barnet avgör om vokalen är lång (glas) eller kort
 * (glass). Ordet visas inte skrivet förrän efteråt: först ska örat höra skillnaden, sedan får
 * stavningen förklara den (en konsonant efter lång vokal, två efter kort). Knapparna följer skolans
 * tecken: streck under lång vokal, prick under kort.
 *
 * Med två knappar är andra trycket gratis, så efter ett fel låses de medan båda ljuden spelas upp
 * mot varandra, och sedan ordet igen.
 */
export default function VowelLength({ task, scaffold, celebrating, brief, onWrong, onSolved }: Props) {
  const word = wordById.get(task.targetId)
  const answer = task.answer ?? 'short'
  const long = word ? longVowelIndex(word) : -1
  const at = long >= 0 ? long : (word?.sounds.findIndex((s) => letterById.get(s)?.type === 'vowel') ?? -1)
  const vowel = word?.sounds[at] ?? 'a'
  const soundOf = (id: string) => (id === 'long' ? letterLongSoundId(vowel) : letterSoundId(vowel))
  const [solved, setSolved] = useState(false)
  const [wobble, setWobble] = useState<string | null>(null)
  /** Knappen vars ljud just nu spelas under jämförelsen. */
  const [focus, setFocus] = useState<string | null>(null)
  const [locked, setLocked] = useState(false)
  const busy = useRef(false)
  const caseClass = useCaseClass()

  useEffect(() => {
    audio.preload([wordId(task.targetId), soundOf('long'), soundOf('short'), phraseId('sort_listen_close')])
    void audio.speak([phraseId(brief ? 'cue_length' : 'length_intro'), wordId(task.targetId)])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.targetId])

  useEffect(() => {
    if (!scaffold || solved) return
    void audio.speak([soundOf(answer), wordId(task.targetId), phraseId('tap_it')])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scaffold])

  const replay = () => {
    if (!busy.current && !solved) void audio.speak(wordId(task.targetId))
  }

  const tap = async (id: string, e: React.PointerEvent) => {
    if (solved || locked || busy.current) return
    if (id === answer) {
      busy.current = true
      setSolved(true)
      sfx.tada()
      starBurst(e.clientX / window.innerWidth, e.clientY / window.innerHeight)
      // Vänta in bekräftelsen: nästa tal (berömmet) avbryter allt som pågår.
      await audio.speak([soundOf(answer), wordId(task.targetId)])
      onSolved()
      return
    }
    busy.current = true
    setLocked(true)
    sfx.soft()
    setWobble(id)
    onWrong(id)
    // Båda ljuden mot varandra, knappen lyser medan dess ljud hörs, och sedan ordet igen.
    await audio.speakEach([phraseId('sort_listen_close'), soundOf('long'), soundOf('short'), wordId(task.targetId)], (i) => setFocus(i === 1 ? 'long' : i === 2 ? 'short' : null), 350)
    setFocus(null)
    setWobble(null)
    setLocked(false)
    busy.current = false
  }

  const lit = (id: string) => (scaffold && id === answer && !solved) || focus === id
  const button = (id: 'long' | 'short') => (
    <motion.button
      key={id}
      type="button"
      aria-label={id === 'long' ? 'lång vokal' : 'kort vokal'}
      onPointerDown={(e) => void tap(id, e)}
      whileTap={{ scale: locked ? 1 : 0.92 }}
      animate={wobble === id ? { rotate: [0, -10, 10, -6, 6, 0] } : solved && id === answer ? { scale: [1, 1.25, 1.15] } : lit(id) ? { scale: [1, 1.08, 1] } : { rotate: 0, scale: 1 }}
      transition={{ duration: 0.5, repeat: lit(id) ? Infinity : 0 }}
      className={`relative flex h-52 flex-col items-center justify-center gap-3 rounded-[36px] bg-white/90 px-8 text-space shadow-[0_8px_0_rgba(0,0,0,0.25)] ${id === 'long' ? 'w-80' : 'w-52'} ${solved && id !== answer ? 'opacity-30' : ''} ${lit(id) ? 'glow' : ''} ${locked && focus !== id ? 'opacity-40' : ''}`}
    >
      <span className="text-[84px] leading-none font-extrabold">{id === 'long' ? vowel.repeat(3) : vowel}</span>
      {id === 'long' ? <span className="h-3 w-56 rounded-full bg-space" /> : <span className="h-5 w-5 rounded-full bg-space" />}
      {scaffold && id === answer && !solved && (
        <motion.span animate={{ y: [0, -16, 0] }} transition={{ duration: 0.7, repeat: Infinity }} className="big-emoji absolute -right-10 -bottom-12 text-[72px]">
          👆
        </motion.span>
      )}
    </motion.button>
  )

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-10">
      {solved && word ? (
        // Facit: ordet skrivet med strecket eller pricken under vokalen, så att stavningen får förklara ljudet.
        <div className={`flex items-end gap-1 text-[110px] leading-none font-extrabold ${caseClass}`}>
          {word.sounds.map((s, i) => (
            <span key={i} className="flex flex-col items-center gap-2">
              <span className={i === at ? 'text-sun' : ''}>{s}</span>
              {i === at ? answer === 'long' ? <span className="h-2.5 w-full rounded-full bg-sun" /> : <span className="h-4 w-4 rounded-full bg-sun" /> : <span className="h-4" />}
            </span>
          ))}
        </div>
      ) : (
        <motion.button type="button" aria-label="Lyssna igen" onPointerDown={replay} whileTap={{ scale: 0.94 }} className="flex h-52 w-52 items-center justify-center rounded-[40px] bg-white/90 shadow-[0_10px_0_rgba(0,0,0,0.25)]">
          <span className="big-emoji text-[130px]">{word?.emoji || '🔊'}</span>
        </motion.button>
      )}
      <div className="flex items-center gap-16">{(['long', 'short'] as const).map(button)}</div>
      <div className="absolute bottom-4 left-4 z-10">
        <Mascot size={110} mood={solved || celebrating ? 'celebrate' : 'think'} pokeable={false} />
      </div>
    </div>
  )
}
