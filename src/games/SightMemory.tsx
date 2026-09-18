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
  /** Alternativ som strukits som hjälp efter två fel: nedtonade och otryckbara. */
  eliminated?: string[]
  celebrating: boolean
  brief?: boolean
  onWrong: () => void
  onSolved: () => void
}

interface Card {
  key: number
  id: string
  /** Kortets skrivstil: paret är samma ord med STORA och små bokstäver. */
  upper: boolean
}

/**
 * Ordbilds-memory: åtta kort, fyra par. Ett par är SAMMA ord i versaler och gemener (OCH + och),
 * så korten måste läsas för att paras ihop – två identiska kort går annars att matcha på formen.
 * Korten är tysta när de vänds, barnet får läsa själv; ordet läses upp när ett par hittats
 * (och vid vändning i scaffolding-läget). Felvändningar räknas mjukt: många fel ger scaffolding.
 */
export default function SightMemory({ task, scaffold, celebrating, brief, onWrong, onSolved }: Props) {
  const cards = useMemo<Card[]>(() => shuffle(task.options.flatMap((id) => [true, false].map((upper) => ({ id, upper })))).map((c, key) => ({ ...c, key })), [task.options])
  const [flipped, setFlipped] = useState<number[]>([])
  const [matched, setMatched] = useState<string[]>([])
  const [solved, setSolved] = useState(false)
  const lock = useRef(false)
  const [locked, setLocked] = useState(false)
  const misses = useRef(0)
  /** Vänder tillbaka två felvända kort när barnet trycker igen (de ligger kvar tills dess). */
  const skipWait = useRef<(() => void) | null>(null)

  useEffect(() => {
    audio.preload(task.options.map(sightWordId))
    void audio.speak(phraseId(brief ? 'cue_memory' : 'memory_intro'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.targetId])

  const setLock = (v: boolean) => {
    lock.current = v
    setLocked(v)
  }

  const text = (card: Card) => {
    const t = sightwordById.get(card.id)?.text ?? card.id
    return card.upper ? t.toUpperCase() : t.toLowerCase()
  }

  const flip = async (card: Card) => {
    if (lock.current) {
      skipWait.current?.()
      return
    }
    if (solved || flipped.includes(card.key) || matched.includes(card.id)) return
    sfx.pop()
    const now = [...flipped, card.key]
    setFlipped(now)
    if (now.length < 2) {
      if (scaffold) void audio.speak(sightWordId(card.id))
      return
    }
    setLock(true)
    if (scaffold) await audio.speak(sightWordId(card.id))
    const [a, b] = now.map((k) => cards.find((c) => c.key === k)!)
    if (a.id === b.id) {
      const m = [...matched, a.id]
      setMatched(m)
      setFlipped([])
      sfx.star()
      await audio.speak(sightWordId(a.id))
      if (m.length === task.options.length) {
        setSolved(true)
        sfx.tada()
        await audio.speak(phraseId('memory_all'))
        onSolved()
      }
    } else {
      misses.current++
      if (misses.current > task.options.length) onWrong()
      // Korten är tysta och barnet håller på att lära sig läsa: de ligger kvar tills nästa tryck, ingen timer.
      await new Promise<void>((resolve) => {
        skipWait.current = resolve
      })
      skipWait.current = null
      sfx.soft()
      setFlipped([])
    }
    setLock(false)
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className={`grid gap-4 ${cards.length > 6 ? 'grid-cols-4' : 'grid-cols-3'}`}>
        {cards.map((card) => {
          const up = scaffold || solved || flipped.includes(card.key) || matched.includes(card.id)
          const done = matched.includes(card.id)
          return (
            <motion.button
              key={card.key}
              type="button"
              aria-label={up ? text(card) : `kort ${card.key + 1}`}
              onClick={() => void flip(card)}
              whileTap={locked ? undefined : { scale: 0.94 }}
              animate={done ? { scale: 1.04, y: -6 } : { scale: 1, y: 0 }}
              className={`flex h-28 w-44 items-center justify-center rounded-3xl text-[44px] font-extrabold shadow-[0_8px_0_rgba(0,0,0,0.25)] transition-colors ${up ? (done ? 'bg-go text-white' : 'bg-white text-space') : 'bg-consonant text-white'}`}
            >
              {up ? text(card) : '❔'}
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
