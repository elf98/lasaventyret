import { motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { audio } from '../audio/AudioManager'
import { sfx } from '../audio/sfx'
import Mascot from '../components/Mascot'
import { sightwordById } from '../content'
import { phraseId, sightWordId } from '../content/audioIds'
import { shuffle } from '../engine/random'
import type { Task } from '../engine/types'

interface Props {
  task: Task
  scaffold: boolean
  celebrating: boolean
  brief?: boolean
  onWrong: () => void
  onSolved: () => void
}

interface Card {
  key: number
  id: string
}

/**
 * Ordbilds-memory: sex kort, tre par. Varje vänt kort läses upp.
 * Felvändningar räknas mjukt: först när de blir många ges scaffolding (alla kort uppvända).
 */
export default function SightMemory({ task, scaffold, celebrating, brief, onWrong, onSolved }: Props) {
  const cards = useMemo<Card[]>(() => shuffle([...task.options, ...task.options].map((id, key) => ({ key, id }))), [task.options])
  const [flipped, setFlipped] = useState<number[]>([])
  const [matched, setMatched] = useState<string[]>([])
  const [solved, setSolved] = useState(false)
  const lock = useRef(false)
  const misses = useRef(0)

  useEffect(() => {
    audio.preload(task.options.map(sightWordId))
    void audio.speak(phraseId(brief ? 'cue_memory' : 'memory_intro'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.targetId])

  const flip = async (card: Card) => {
    if (lock.current || solved || flipped.includes(card.key) || matched.includes(card.id)) return
    sfx.pop()
    const now = [...flipped, card.key]
    setFlipped(now)
    if (now.length < 2) {
      void audio.speak(sightWordId(card.id))
      return
    }
    lock.current = true
    await audio.speak(sightWordId(card.id))
    const [a, b] = now.map((k) => cards.find((c) => c.key === k)!)
    if (a.id === b.id) {
      const m = [...matched, a.id]
      setMatched(m)
      setFlipped([])
      sfx.star()
      if (m.length === task.options.length) {
        setSolved(true)
        sfx.tada()
        await audio.speak(phraseId('memory_all'))
        onSolved()
      } else {
        await audio.speak(phraseId('memory_match'))
      }
    } else {
      misses.current++
      if (misses.current > task.options.length) onWrong()
      await new Promise((r) => setTimeout(r, 700))
      sfx.soft()
      setFlipped([])
    }
    lock.current = false
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="grid grid-cols-3 gap-5">
        {cards.map((card) => {
          const up = scaffold || solved || flipped.includes(card.key) || matched.includes(card.id)
          const done = matched.includes(card.id)
          return (
            <motion.button
              key={card.key}
              type="button"
              aria-label={up ? sightwordById.get(card.id)?.text ?? card.id : `kort ${card.key + 1}`}
              onClick={() => void flip(card)}
              whileTap={{ scale: 0.94 }}
              animate={done ? { scale: 1.04, y: -6 } : { scale: 1, y: 0 }}
              className={`flex h-32 w-48 items-center justify-center rounded-3xl text-[48px] font-extrabold shadow-[0_8px_0_rgba(0,0,0,0.25)] transition-colors ${up ? (done ? 'bg-go text-white' : 'bg-white text-space') : 'bg-consonant text-white'}`}
            >
              {up ? sightwordById.get(card.id)?.text ?? card.id : '❔'}
            </motion.button>
          )
        })}
      </div>
      <div className="absolute bottom-4 left-4 z-10">
        <Mascot size={110} mood={solved || celebrating ? 'celebrate' : 'think'} pokeable={false} />
      </div>
    </div>
  )
}
