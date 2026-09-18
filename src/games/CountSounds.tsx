import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { audio } from '../audio/AudioManager'
import { sfx } from '../audio/sfx'
import { starBurst } from '../components/confetti'
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
 * Räkna ljuden (Startrampen): ordet hörs, barnet väljer hur många ljud det har. Att dela upp ett ord
 * i sina ljud är samma förmåga som ljudning bygger på, fast utan bokstäver. Vid rätt svar ljudas ordet
 * fram medan prickarna tänds en och en, så att kopplingen mellan antal och ljud syns.
 */
export default function CountSounds({ task, scaffold, eliminated = [], celebrating, brief, onWrong, onSolved }: Props) {
  const word = wordById.get(task.targetId)
  const answer = Number(task.answer ?? task.options[0])
  const [solved, setSolved] = useState(false)
  const [wobble, setWobble] = useState<string | null>(null)
  const [lit, setLit] = useState(-1)
  const busy = useRef(false)

  useEffect(() => {
    audio.preload([wordId(task.targetId), ...(word?.sounds ?? []).map(letterSoundId)])
    void audio.speak([phraseId(brief ? 'cue_count' : 'count_intro'), wordId(task.targetId)])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.targetId])

  const sound = async () => {
    if (!word) return
    await audio.speakEach([...word.sounds.map(letterSoundId), wordId(task.targetId)], (i) => setLit(i < word.sounds.length ? i : -1))
    setLit(-1)
  }

  useEffect(() => {
    if (scaffold && !solved) void sound()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scaffold])

  const replay = () => void audio.speak(wordId(task.targetId))

  const tap = async (id: string, e: React.PointerEvent) => {
    if (solved || busy.current) return
    if (eliminated.includes(id)) return
    if (Number(id) === answer) {
      setSolved(true)
      sfx.tada()
      starBurst(e.clientX / window.innerWidth, e.clientY / window.innerHeight)
      await sound()
      onSolved()
      return
    }
    busy.current = true
    sfx.soft()
    setWobble(id)
    onWrong()
    await audio.speak([phraseId('listen_again'), wordId(task.targetId)])
    setWobble(null)
    busy.current = false
  }

  if (!word) return null

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-8">
      <motion.button type="button" aria-label={word.text} onPointerDown={replay} whileTap={{ scale: 0.94 }} className="flex h-44 w-44 items-center justify-center rounded-[40px] bg-white/90 shadow-[0_10px_0_rgba(0,0,0,0.25)]">
        <span className="big-emoji text-[110px]">{word.emoji}</span>
      </motion.button>
      {/* Prickarna får INTE synas före svaret – då går antalet att räkna i stället för att höras. */}
      <div className="flex h-10 items-center gap-4" aria-hidden="true">
        {(solved || lit >= 0) &&
          word.sounds.map((_, i) => (
            <motion.span key={i} animate={{ scale: lit === i ? 1.5 : 1 }} className={`h-7 w-7 rounded-full ${solved || lit >= i ? 'bg-sun' : 'bg-white/30'}`} />
          ))}
      </div>
      <div className="flex items-center gap-10">
        {task.options.map((id) => (
          <motion.button
            key={id}
            type="button"
            aria-label={`${id} ljud`}
            onPointerDown={(e) => void tap(id, e)}
            whileTap={{ scale: 0.92 }}
            animate={wobble === id ? { rotate: [0, -10, 10, -6, 6, 0] } : solved && Number(id) === answer ? { scale: [1, 1.3, 1.2] } : { rotate: 0, scale: 1 }}
            transition={{ duration: 0.5 }}
            className={`flex h-36 w-36 flex-col items-center justify-center gap-2 rounded-[32px] bg-white text-space shadow-[0_8px_0_rgba(0,0,0,0.25)] ${solved && Number(id) !== answer ? 'opacity-30' : ''} ${eliminated.includes(id) ? 'pointer-events-none opacity-20' : ''}`}
          >
            <span className="text-[56px] leading-none font-extrabold tabular-nums">{id}</span>
            <span className="flex gap-1">
              {Array.from({ length: Number(id) }).map((_, i) => (
                <span key={i} className="h-3 w-3 rounded-full bg-space/60" />
              ))}
            </span>
          </motion.button>
        ))}
      </div>
      <div className="absolute bottom-4 left-4 z-10">
        <Mascot size={110} mood={solved || celebrating ? 'celebrate' : 'think'} pokeable={false} />
      </div>
    </div>
  )
}
