import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { audio } from '../audio/AudioManager'
import { sfx } from '../audio/sfx'
import BigButton from '../components/BigButton'
import { starBurst } from '../components/confetti'
import Mascot from '../components/Mascot'
import { useCaseClass } from '../components/textCase'
import { sentenceById, tokenize } from '../content'
import { phraseId, sentenceId, tokenId } from '../content/audioIds'
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
 * Tokiga meningar: barnet läser meningen själv och trycker på bilden som passar.
 * Högtalaren läser ord för ord (hjälp, inget fel). Två fel = vi läser tillsammans.
 */
export default function SillySentences({ task, scaffold, eliminated = [], celebrating, brief, onWrong, onSolved }: Props) {
  const caseClass = useCaseClass()
  const sentence = sentenceById.get(task.targetId)
  const displayWords = sentence?.text.split(' ') ?? []
  const tokens = sentence ? tokenize(sentence.text) : []
  const [highlight, setHighlight] = useState(-1)
  const [solved, setSolved] = useState(false)
  const [wobble, setWobble] = useState<string | null>(null)
  const busy = useRef(false)

  useEffect(() => {
    audio.preload([...tokens.map(tokenId), sentenceId(task.targetId)])
    void audio.speak(phraseId(brief ? 'cue_read' : 'read_intro'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.targetId])

  const readWordByWord = async (intro?: string) => {
    if (busy.current) return
    busy.current = true
    const list = [...(intro ? [phraseId(intro)] : []), ...tokens.map(tokenId), sentenceId(task.targetId)]
    const offset = intro ? 1 : 0
    await audio.speakEach(list, (i) => setHighlight(i >= offset && i - offset < tokens.length ? i - offset : -1))
    setHighlight(-1)
    busy.current = false
  }

  useEffect(() => {
    if (scaffold && !solved) void readWordByWord('read_slowly')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scaffold])

  const tap = async (picture: string, e: React.PointerEvent) => {
    if (eliminated.includes(picture)) return
    if (solved) return
    if (picture === task.answer) {
      setSolved(true)
      sfx.tada()
      starBurst(e.clientX / window.innerWidth, e.clientY / window.innerHeight)
      busy.current = false
      await audio.speak(sentenceId(task.targetId))
      onSolved()
      return
    }
    if (busy.current) return
    busy.current = true
    sfx.soft()
    setWobble(picture)
    onWrong()
    await audio.speak(phraseId('read_again'))
    setWobble(null)
    busy.current = false
  }

  if (!sentence) return null

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-10">
      <div className="flex flex-wrap justify-center gap-x-5 rounded-[32px] bg-white px-12 py-8 text-space shadow-[0_8px_0_rgba(0,0,0,0.25)]">
        {displayWords.map((w, i) => (
          <span key={i} className={`rounded-2xl px-2 text-[56px] font-extrabold ${caseClass(w)} transition-colors ${highlight === i ? 'bg-sun' : ''}`}>
            {w}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-8">
        {task.options.map((pic) => {
          const isAnswer = pic === task.answer
          return (
            <motion.button
              key={pic}
              type="button"
              aria-label={`bild ${pic}`}
              onPointerDown={(e) => void tap(pic, e)}
              whileTap={{ scale: 0.92 }}
              animate={wobble === pic ? { rotate: [0, -8, 8, -5, 5, 0] } : solved && isAnswer ? { scale: [1, 1.2, 1.1] } : scaffold && isAnswer && !solved ? { scale: [1, 1.06, 1] } : { rotate: 0, scale: 1 }}
              transition={{ duration: 0.5, repeat: scaffold && isAnswer && !solved ? Infinity : 0 }}
              className={`flex h-40 min-w-52 items-center justify-center rounded-[36px] px-6 ${solved && isAnswer ? 'bg-sun' : 'bg-white/15'} ${solved && !isAnswer ? 'opacity-30' : ''} ${scaffold && isAnswer && !solved ? 'glow' : ''} ${eliminated.includes(pic) ? 'pointer-events-none opacity-20' : ''}`}
            >
              <span className="big-emoji text-[84px] tracking-wider">{pic}</span>
            </motion.button>
          )
        })}
      </div>
      <div className="absolute bottom-4 left-4 z-10">
        <Mascot size={110} mood={solved || celebrating ? 'celebrate' : 'think'} pokeable={false} />
      </div>
      <div className="absolute bottom-5 left-1/2 z-10 -translate-x-1/2">
        <BigButton size="md" icon="🔊" color="bg-sun" onPress={() => void readWordByWord()} label="Läs upp" disabled={solved} />
      </div>
    </div>
  )
}
