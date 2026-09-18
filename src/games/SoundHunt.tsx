import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { audio } from '../audio/AudioManager'
import { sfx } from '../audio/sfx'
import { starBurst } from '../components/confetti'
import LetterCard from '../components/LetterCard'
import Mascot from '../components/Mascot'
import { wordById } from '../content'
import { letterSoundId, phraseId, wordId } from '../content/audioIds'
import type { Task } from '../engine/types'

interface Props {
  task: Task
  scaffold: boolean
  /** Alternativ som strukits som hjälp efter två fel: nedtonade och otryckbara. */
  eliminated?: string[]
  celebrating: boolean
  brief?: boolean
  onWrong: () => void
  onSolved: () => void
}

/**
 * Ljudjakt (Startrampen): bilden syns och ordet hörs, barnet väljer bokstaven för ordets FÖRSTA
 * eller SISTA ljud. Ren hörövning – att kunna plocka ut ett enskilt ljud ur ett ord är det som
 * bäst förutsäger hur läsinlärningen går, och det tränas inte av att läsa hela ord.
 */
export default function SoundHunt({ task, scaffold, eliminated = [], celebrating, brief, onWrong, onSolved }: Props) {
  const first = task.game === 'first-sound'
  const word = wordById.get(task.targetId)
  const answer = task.answer ?? task.options[0]
  const [solved, setSolved] = useState(false)
  const [wobble, setWobble] = useState<string | null>(null)
  const busy = useRef(false)

  useEffect(() => {
    audio.preload([wordId(task.targetId), ...task.options.map(letterSoundId)])
    void audio.speak([phraseId(brief ? (first ? 'cue_first_sound' : 'cue_last_sound') : first ? 'first_sound_intro' : 'last_sound_intro'), wordId(task.targetId)])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.targetId])

  useEffect(() => {
    if (!scaffold || solved) return
    // Hjälpen visar ljudet i sitt sammanhang: ordet, ljudet, ordet igen.
    void audio.speak([wordId(task.targetId), letterSoundId(answer), wordId(task.targetId), phraseId('tap_it')])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scaffold])

  const replay = () => void audio.speak(wordId(task.targetId))

  const tap = async (id: string, e: React.PointerEvent) => {
    if (solved) return
    if (eliminated.includes(id)) return
    if (id === answer) {
      setSolved(true)
      sfx.tada()
      starBurst(e.clientX / window.innerWidth, e.clientY / window.innerHeight)
      void audio.speak([letterSoundId(answer), wordId(task.targetId)])
      onSolved()
      return
    }
    if (busy.current) return
    busy.current = true
    sfx.soft()
    setWobble(id)
    onWrong()
    await audio.speak([phraseId('not_in_word'), letterSoundId(id), phraseId('listen_again'), wordId(task.targetId)])
    setWobble(null)
    busy.current = false
  }

  if (!word) return null

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-10">
      <motion.button type="button" aria-label={word.text} onPointerDown={replay} whileTap={{ scale: 0.94 }} className="flex h-52 w-52 items-center justify-center rounded-[40px] bg-white/90 shadow-[0_10px_0_rgba(0,0,0,0.25)]">
        <span className="big-emoji text-[130px]">{word.emoji}</span>
      </motion.button>
      <div className="flex items-center gap-4">
        <span className="big-emoji text-[56px]">{first ? '👉' : '🏁'}</span>
        {task.options.map((id) => (
          <motion.button
            key={id}
            type="button"
            aria-label={id}
            onPointerDown={(e) => void tap(id, e)}
            whileTap={{ scale: 0.92 }}
            animate={wobble === id ? { rotate: [0, -10, 10, -6, 6, 0] } : solved && id === answer ? { scale: [1, 1.3, 1.2] } : scaffold && id === answer && !solved ? { scale: [1, 1.08, 1] } : { rotate: 0, scale: 1 }}
            transition={{ duration: 0.5, repeat: scaffold && id === answer && !solved ? Infinity : 0 }}
            className={`relative ${solved && id !== answer ? 'opacity-30' : ''} ${scaffold && id === answer && !solved ? 'glow' : ''} ${eliminated.includes(id) ? 'pointer-events-none opacity-20' : ''}`}
          >
            <LetterCard letterId={id} size={150} />
          </motion.button>
        ))}
      </div>
      <div className="absolute bottom-4 left-4 z-10">
        <Mascot size={110} mood={solved || celebrating ? 'celebrate' : 'think'} pokeable={false} />
      </div>
    </div>
  )
}
