import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { audio } from '../audio/AudioManager'
import { sfx } from '../audio/sfx'
import BigButton from '../components/BigButton'
import { starBurst } from '../components/confetti'
import Mascot from '../components/Mascot'
import { useCaseClass } from '../components/textCase'
import { storyById, tokenize } from '../content'
import { phraseId, storyQuestionId, storySentenceId, storyTitleId, tokenId } from '../content/audioIds'
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

/** Miniberättelse: en mening i taget, pil för nästa, bildfråga på slutet. */
export default function StoryReader({ task, scaffold, celebrating, brief, onWrong, onSolved }: Props) {
  const caseClass = useCaseClass()
  const story = storyById.get(task.targetId)
  const [idx, setIdx] = useState(0)
  const [phase, setPhase] = useState<'read' | 'question' | 'done'>('read')
  const [highlight, setHighlight] = useState(-1)
  const [wobble, setWobble] = useState<number | null>(null)
  const busy = useRef(false)
  const answer = Number(task.answer ?? -1)

  useEffect(() => {
    void audio.speak([phraseId(brief ? 'cue_story' : 'story_intro'), storyTitleId(task.targetId)])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.targetId])

  useEffect(() => {
    if (scaffold && phase === 'question') void audio.speak([storyQuestionId(task.targetId), phraseId('tap_it')])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scaffold])

  const readAloud = async () => {
    if (!story || busy.current) return
    busy.current = true
    const tokens = tokenize(story.sentences[idx])
    await audio.speakEach([...tokens.map(tokenId), storySentenceId(task.targetId, idx)], (i) => setHighlight(i < tokens.length ? i : -1))
    setHighlight(-1)
    busy.current = false
  }

  const next = () => {
    if (!story) return
    audio.stop()
    busy.current = false
    setHighlight(-1)
    sfx.whoosh()
    if (idx + 1 < story.sentences.length) setIdx(idx + 1)
    else {
      setPhase('question')
      void audio.speak([phraseId('story_question'), storyQuestionId(task.targetId)])
    }
  }

  const pick = async (i: number, e: React.PointerEvent) => {
    if (phase !== 'question') return
    if (i === answer) {
      setPhase('done')
      sfx.tada()
      starBurst(e.clientX / window.innerWidth, e.clientY / window.innerHeight)
      onSolved()
      return
    }
    if (busy.current) return
    busy.current = true
    sfx.soft()
    setWobble(i)
    onWrong()
    await audio.speak([phraseId('listen_again'), storyQuestionId(task.targetId)])
    setWobble(null)
    busy.current = false
  }

  if (!story) return null
  const words = story.sentences[idx].split(' ')

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-8">
      <div className={`text-[34px] font-bold text-white/80 ${caseClass(story.title)}`}>{story.title}</div>
      {phase === 'read' ? (
        <>
          <div className="flex flex-wrap justify-center gap-x-5 rounded-[32px] bg-white px-12 py-8 text-space shadow-[0_8px_0_rgba(0,0,0,0.25)]">
            {words.map((w, i) => (
              <span key={i} className={`rounded-2xl px-2 text-[56px] font-extrabold ${caseClass(w)} ${highlight === i ? 'bg-sun' : ''}`}>
                {w}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-3">
            {story.sentences.map((_, i) => (
              <span key={i} className={`h-4 w-4 rounded-full ${i <= idx ? 'bg-sun' : 'bg-white/30'}`} />
            ))}
          </div>
          <div className="flex items-center gap-10">
            <BigButton size="md" icon="🔊" color="bg-sun" onPress={() => void readAloud()} label="Läs upp" />
            <BigButton size="lg" icon="➡️" speakId={phraseId('btn_next')} onPress={next} label="Nästa" />
          </div>
        </>
      ) : (
        <>
          <div className={`rounded-[32px] bg-white px-12 py-6 text-[44px] font-extrabold text-space ${caseClass(story.question)}`}>{story.question}</div>
          <div className="flex items-center gap-8">
            {task.options.map((pic, i) => {
              const isAnswer = i === answer
              return (
                <motion.button
                  key={i}
                  type="button"
                  aria-label={`svar ${pic}`}
                  onPointerDown={(e) => void pick(i, e)}
                  whileTap={{ scale: 0.92 }}
                  animate={wobble === i ? { rotate: [0, -8, 8, -5, 5, 0] } : phase === 'done' && isAnswer ? { scale: [1, 1.25, 1.15] } : scaffold && isAnswer ? { scale: [1, 1.08, 1] } : { rotate: 0, scale: 1 }}
                  transition={{ duration: 0.5, repeat: scaffold && isAnswer && phase !== 'done' ? Infinity : 0 }}
                  className={`flex h-44 w-44 items-center justify-center rounded-[36px] ${phase === 'done' && isAnswer ? 'bg-sun' : 'bg-white/15'} ${phase === 'done' && !isAnswer ? 'opacity-30' : ''} ${scaffold && isAnswer && phase !== 'done' ? 'glow' : ''}`}
                >
                  <span className="big-emoji text-[100px]">{pic}</span>
                </motion.button>
              )
            })}
          </div>
          <BigButton size="md" icon="🔊" color="bg-sun" onPress={() => void audio.speak(storyQuestionId(task.targetId))} label="Lyssna igen" disabled={phase === 'done'} />
        </>
      )}
      <div className="absolute bottom-4 left-4 z-10">
        <Mascot size={110} mood={phase === 'done' || celebrating ? 'celebrate' : 'think'} pokeable={false} />
      </div>
    </div>
  )
}
