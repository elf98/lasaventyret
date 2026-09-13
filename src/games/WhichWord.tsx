import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { audio } from '../audio/AudioManager'
import { sfx } from '../audio/sfx'
import BigButton from '../components/BigButton'
import { starBurst } from '../components/confetti'
import Mascot from '../components/Mascot'
import { sightwordById, wordById } from '../content'
import { phraseId, sightWordId, wordId } from '../content/audioIds'
import type { Task } from '../engine/types'

interface Props {
  task: Task
  scaffold: boolean
  celebrating: boolean
  brief?: boolean
  onWrong: () => void
  onSolved: () => void
}

/**
 * Vilket ord?: hör ett ord, tryck på rätt skrivet ord av tre.
 * Ordbilder (och, är, jag ...) eller ljudenliga ord med lika långa distraktorer.
 */
export default function WhichWord({ task, scaffold, celebrating, brief, onWrong, onSolved }: Props) {
  const isSight = task.kind === 'sightword'
  const label = (id: string) => (isSight ? sightwordById.get(id)?.text : wordById.get(id)?.text) ?? id
  const aud = (id: string) => (isSight ? sightWordId(id) : wordId(id))
  const [ready, setReady] = useState(false)
  const [solved, setSolved] = useState(false)
  const [wobble, setWobble] = useState<string | null>(null)
  const busy = useRef(false)

  useEffect(() => {
    let alive = true
    audio.preload(task.options.map(aud))
    void audio.speak([phraseId(brief ? 'cue_which' : 'which_word_intro'), aud(task.targetId)]).then(() => alive && setReady(true))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.targetId])

  useEffect(() => {
    if (scaffold && !solved) void audio.speak([phraseId('tap_it'), aud(task.targetId)])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scaffold])

  const tap = async (id: string, e: React.PointerEvent) => {
    if (!ready || solved) return
    if (id === task.targetId) {
      setSolved(true)
      sfx.tada()
      starBurst(e.clientX / window.innerWidth, e.clientY / window.innerHeight)
      onSolved()
      return
    }
    if (busy.current) return
    busy.current = true
    sfx.soft()
    setWobble(id)
    onWrong()
    await audio.speak([phraseId('listen_again'), aud(task.targetId)])
    setWobble(null)
    busy.current = false
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="flex items-center gap-8">
        {task.options.map((id) => {
          const isTarget = id === task.targetId
          const dim = (scaffold || solved) && !isTarget
          return (
            <motion.button
              key={id}
              type="button"
              aria-label={label(id)}
              onPointerDown={(e) => void tap(id, e)}
              whileTap={{ scale: 0.92 }}
              animate={wobble === id ? { rotate: [0, -8, 8, -5, 5, 0] } : solved && isTarget ? { scale: [1, 1.25, 1.15] } : scaffold && isTarget ? { scale: [1, 1.08, 1] } : { rotate: 0, scale: 1 }}
              transition={{ duration: 0.5, repeat: scaffold && isTarget && !solved ? Infinity : 0 }}
              className={`relative flex min-w-52 items-center justify-center rounded-[32px] bg-white px-10 py-8 text-[64px] font-extrabold text-space shadow-[0_8px_0_rgba(0,0,0,0.25)] ${dim ? 'opacity-30' : ''} ${scaffold && isTarget && !solved ? 'glow' : ''}`}
            >
              {label(id)}
              {scaffold && isTarget && !solved && (
                <motion.span animate={{ y: [0, -16, 0] }} transition={{ duration: 0.7, repeat: Infinity }} className="big-emoji absolute -right-10 -bottom-12 text-[72px]">👆</motion.span>
              )}
            </motion.button>
          )
        })}
      </div>
      <div className="absolute bottom-4 left-4 z-10">
        <Mascot size={110} mood={solved || celebrating ? 'celebrate' : 'think'} pokeable={false} />
      </div>
      <div className="absolute bottom-5 left-1/2 z-10 -translate-x-1/2">
        <BigButton size="md" icon="🔊" color="bg-sun" onPress={() => void audio.speak(aud(task.targetId))} label="Lyssna igen" disabled={solved} />
      </div>
    </div>
  )
}
