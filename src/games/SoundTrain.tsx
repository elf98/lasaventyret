import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { audio } from '../audio/AudioManager'
import { sfx } from '../audio/sfx'
import BigButton from '../components/BigButton'
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
  /** Kort instruktion (spelet har redan förklarats en gång i passet). */
  brief?: boolean
  onWrong: () => void
  onSolved: () => void
}

type Phase = 'tap' | 'drive' | 'pick' | 'done'

/**
 * Ljudtåget: ordets ljud kommer som vagnar. Tryck på dem i ordning
 * (varje vagn säger sitt ljud), sedan åker tåget och hela ordet hörs.
 * Ord med bild avslutas med "vilken bild?", stavelser bara med ordet.
 */
export default function SoundTrain({ task, scaffold, celebrating, brief, onWrong, onSolved }: Props) {
  const word = wordById.get(task.targetId)
  const sounds = word?.sounds ?? []
  const [next, setNext] = useState(0)
  const [phase, setPhase] = useState<Phase>('tap')
  const [wobble, setWobble] = useState<number | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const busy = useRef(false)

  useEffect(() => {
    audio.preload([...sounds.map(letterSoundId), wordId(task.targetId)])
    void audio.speak(phraseId(brief ? 'cue_train' : 'train_intro'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.targetId])

  useEffect(() => {
    if (scaffold && phase === 'tap') void audio.speak([phraseId('tap_it'), letterSoundId(sounds[next])])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scaffold])

  const drive = async () => {
    setPhase('drive')
    sfx.whoosh()
    if (word && word.emoji !== '' && task.options.length > 1) {
      // Barnet ska själv ljuda ihop: ordet sägs INTE före bildvalet, bara som bekräftelse efteråt.
      setPhase('pick')
      void audio.speak(phraseId('which_picture'))
    } else {
      // Stavelse utan bild: inget att välja mellan, ordet är facit.
      setPhase('done')
      await audio.speak(wordId(task.targetId))
      onSolved()
    }
  }

  const tapWagon = async (i: number, e: React.PointerEvent) => {
    if (phase !== 'tap') return
    // Ett tryck i taget: nästa vagn räknas först när förra vagnens ljud är klart.
    if (busy.current) return
    if (i === next) {
      sfx.pop()
      starBurst(e.clientX / window.innerWidth, e.clientY / window.innerHeight)
      const n = next + 1
      setNext(n)
      busy.current = true
      await audio.speak(letterSoundId(sounds[i]))
      busy.current = false
      if (n >= sounds.length) void drive()
      return
    }
    busy.current = true
    sfx.soft()
    setWobble(i)
    onWrong()
    await audio.speak([phraseId(next === 0 ? 'train_start' : 'train_next'), letterSoundId(sounds[next])])
    setWobble(null)
    busy.current = false
  }

  const pickPicture = async (id: string) => {
    if (phase !== 'pick') return
    if (id === task.targetId) {
      setPicked(id)
      setPhase('done')
      sfx.tada()
      // Bekräftelse först nu: du läste det, och ordet var ...
      void audio.speak(wordId(task.targetId))
      onSolved()
      return
    }
    if (busy.current) return
    busy.current = true
    sfx.soft()
    setWobble(-1)
    onWrong()
    await audio.speak([phraseId('not_that_picture'), wordId(task.targetId)])
    setWobble(null)
    busy.current = false
  }

  const replay = () => {
    if (phase === 'tap') void audio.speak(letterSoundId(sounds[next]))
    else void audio.speak(wordId(task.targetId))
  }

  if (!word) return null
  const cardSize = sounds.length > 5 ? 96 : 120

  return (
    <div className="absolute inset-0">
      {(phase === 'tap' || phase === 'drive') && (
        <motion.div
          className="absolute top-1/2 left-1/2 flex -translate-y-1/2 items-end gap-2"
          initial={{ x: '-50%' }}
          animate={phase === 'drive' ? { x: '-140vw' } : { x: '-50%' }}
          transition={{ duration: phase === 'drive' ? 2.6 : 0, ease: 'easeIn' }}
        >
          <span className="big-emoji" style={{ fontSize: cardSize * 0.9 }}>🚂</span>
          {sounds.map((s, i) => {
            const done = i < next
            const isNext = i === next
            return (
              <motion.button
                key={i}
                type="button"
                aria-label={`vagn ${i + 1} ${s}`}
                onPointerDown={(e) => void tapWagon(i, e)}
                whileTap={{ scale: 0.92 }}
                animate={wobble === i ? { rotate: [0, -10, 10, -6, 6, 0] } : isNext && scaffold ? { scale: [1, 1.1, 1] } : done ? { y: -10, scale: 1.05 } : { rotate: 0 }}
                transition={{ duration: 0.5, repeat: isNext && scaffold ? Infinity : 0 }}
                className={`relative flex flex-col items-center ${isNext && scaffold ? 'glow rounded-3xl' : ''}`}
              >
                <LetterCard letterId={s} size={cardSize} className={done ? 'ring-8 ring-go' : ''} />
                <span className="flex gap-3" style={{ marginTop: -6 }}>
                  <span className="rounded-full border-4 border-gray-300 bg-gray-800" style={{ width: cardSize * 0.26, height: cardSize * 0.26 }} />
                  <span className="rounded-full border-4 border-gray-300 bg-gray-800" style={{ width: cardSize * 0.26, height: cardSize * 0.26 }} />
                </span>
                {isNext && scaffold && (
                  <motion.span animate={{ y: [0, -16, 0] }} transition={{ duration: 0.7, repeat: Infinity }} className="big-emoji absolute -right-8 -bottom-10 text-[64px]">👆</motion.span>
                )}
              </motion.button>
            )
          })}
        </motion.div>
      )}

      {(phase === 'pick' || phase === 'done') && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6">
          <div className="flex items-center gap-2">
            {sounds.map((s, i) => (
              <LetterCard key={i} letterId={s} size={80} />
            ))}
          </div>
          {phase === 'pick' || task.options.length > 1 ? (
            <div className="flex items-center gap-8">
              {task.options.map((id) => {
                const w = wordById.get(id)
                if (!w) return null
                const isTarget = id === task.targetId
                const chosen = picked === id
                return (
                  <motion.button
                    key={id}
                    type="button"
                    aria-label={w.text}
                    onClick={() => void pickPicture(id)}
                    whileTap={{ scale: 0.9 }}
                    animate={chosen ? { scale: [1, 1.3, 1.2] } : wobble === -1 && !isTarget ? { rotate: [0, -8, 8, 0] } : {}}
                    className={`flex h-44 w-44 items-center justify-center rounded-[36px] ${chosen ? 'bg-sun' : 'bg-white/15'} ${phase === 'done' && !isTarget ? 'opacity-30' : ''}`}
                  >
                    <span className="big-emoji text-[110px]">{w.emoji}</span>
                  </motion.button>
                )
              })}
            </div>
          ) : (
            <span className="text-[56px] font-extrabold tracking-wide">{word.text}</span>
          )}
        </div>
      )}

      <div className="absolute bottom-4 left-4 z-10">
        <Mascot size={110} mood={phase === 'done' || celebrating ? 'celebrate' : 'think'} pokeable={false} />
      </div>
      <div className="absolute bottom-5 left-1/2 z-10 -translate-x-1/2">
        <BigButton size="md" icon="🔊" color="bg-sun" onPress={replay} label="Lyssna igen" disabled={phase === 'done' || phase === 'drive'} />
      </div>
    </div>
  )
}
