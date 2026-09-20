import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { audio } from '../audio/AudioManager'
import { sfx } from '../audio/sfx'
import BigButton from '../components/BigButton'
import { starBurst } from '../components/confetti'
import Mascot from '../components/Mascot'
import { wordById } from '../content'
import { phraseId, wordId } from '../content/audioIds'
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

/** Rimjakt: hör och se ett ord, tryck på bilden som rimmar. */
export default function RhymeHunt({ task, scaffold, eliminated = [], celebrating, brief, onWrong, onSolved }: Props) {
  const target = wordById.get(task.targetId)
  const answer = task.answer ?? ''
  const [solved, setSolved] = useState(false)
  const [wobble, setWobble] = useState<string | null>(null)
  const busy = useRef(false)

  useEffect(() => {
    audio.preload(task.options.map(wordId))
    void audio.speak([phraseId(brief ? 'cue_rhyme' : 'rhyme_intro'), wordId(task.targetId)])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.targetId])

  useEffect(() => {
    if (scaffold && !solved) void audio.speak([wordId(task.targetId), wordId(answer), phraseId('rhyme_yes'), phraseId('tap_it')])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scaffold])

  const tap = async (id: string, e: React.PointerEvent) => {
    if (eliminated.includes(id)) return
    if (solved) return
    if (id === answer) {
      setSolved(true)
      sfx.tada()
      starBurst(e.clientX / window.innerWidth, e.clientY / window.innerHeight)
      await audio.speak([wordId(task.targetId), wordId(id), phraseId('rhyme_yes')])
      onSolved()
      return
    }
    if (busy.current) return
    busy.current = true
    sfx.soft()
    setWobble(id)
    onWrong()
    await audio.speak([phraseId('rhyme_no'), wordId(task.targetId), wordId(id)])
    setWobble(null)
    busy.current = false
  }

  if (!target) return null

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-8">
      <div className="flex flex-col items-center">
        <span className="big-emoji text-[120px]">{target.emoji}</span>
        <span className="text-[40px] font-extrabold">{target.text}</span>
      </div>
      <div className={`flex items-center ${task.options.length > 3 ? 'gap-5' : 'gap-8'}`}>
        {task.options.map((id) => {
          const w = wordById.get(id)
          if (!w) return null
          const isAnswer = id === answer
          const small = task.options.length > 3
          return (
            <motion.button
              key={id}
              type="button"
              aria-label={w.text}
              onPointerDown={(e) => void tap(id, e)}
              whileTap={{ scale: 0.92 }}
              animate={wobble === id ? { rotate: [0, -8, 8, -5, 5, 0] } : solved && isAnswer ? { scale: [1, 1.25, 1.15] } : scaffold && isAnswer && !solved ? { scale: [1, 1.08, 1] } : { rotate: 0, scale: 1 }}
              transition={{ duration: 0.5, repeat: scaffold && isAnswer && !solved ? Infinity : 0 }}
              className={`relative flex flex-col items-center justify-center rounded-[36px] ${small ? 'h-40 w-40' : 'h-48 w-48'} ${solved && isAnswer ? 'bg-sun' : 'bg-white/15'} ${(scaffold || solved) && !isAnswer ? 'opacity-30' : ''} ${scaffold && isAnswer && !solved ? 'glow' : ''} ${eliminated.includes(id) ? 'pointer-events-none opacity-20' : ''}`}
            >
              <span className={`big-emoji ${small ? 'text-[80px]' : 'text-[100px]'}`}>{w.emoji}</span>
              <span className="text-[26px] font-bold">{w.text}</span>
            </motion.button>
          )
        })}
      </div>
      <div className="absolute bottom-4 left-4 z-10">
        <Mascot size={110} mood={solved || celebrating ? 'celebrate' : 'think'} pokeable={false} />
      </div>
      <div className="absolute bottom-5 left-1/2 z-10 -translate-x-1/2">
        <BigButton size="md" icon="🔊" color="bg-sun" onPress={() => void audio.speak(wordId(task.targetId))} label="Lyssna igen" disabled={solved} />
      </div>
    </div>
  )
}
