import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { audio } from '../audio/AudioManager'
import { sfx } from '../audio/sfx'
import { starBurst } from '../components/confetti'
import Mascot from '../components/Mascot'
import { useCaseClass } from '../components/textCase'
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
 * Läs och välj: ordet står skrivet, tre bilder under. Ordet läses INTE upp – barnet måste avkoda
 * själv, vilket är den enda uppgiften i appen som kräver riktig läsning utan ledtråd i örat.
 * Efter två fel kommer hjälpen stegvis: ordet ljudas bokstav för bokstav, sedan sägs det.
 */
export default function ReadWord({ task, scaffold, eliminated = [], celebrating, brief, onWrong, onSolved }: Props) {
  const word = wordById.get(task.targetId)
  const caseClass = useCaseClass()
  const [solved, setSolved] = useState(false)
  const [wobble, setWobble] = useState<string | null>(null)
  const [blend, setBlend] = useState(-1)
  const busy = useRef(false)

  useEffect(() => {
    audio.preload([wordId(task.targetId), ...(word?.sounds ?? []).map(letterSoundId)])
    void audio.speak(phraseId(brief ? 'cue_read_word' : 'read_word_intro'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.targetId])

  // Scaffolding: ljuda ordet bokstav för bokstav med markering, sedan hela ordet.
  useEffect(() => {
    if (!scaffold || solved || !word) return
    const sounds = word.decodable && !word.noBlend ? word.sounds : []
    void audio.speakEach([...sounds.map(letterSoundId), wordId(task.targetId)], (i) => setBlend(i < sounds.length ? i : -1)).then(() => setBlend(-1))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scaffold])

  const tap = async (id: string, e: React.PointerEvent) => {
    if (solved) return
    if (eliminated.includes(id)) return
    if (id === task.targetId) {
      setSolved(true)
      sfx.tada()
      starBurst(e.clientX / window.innerWidth, e.clientY / window.innerHeight)
      void audio.speak(wordId(task.targetId))
      onSolved()
      return
    }
    if (busy.current) return
    busy.current = true
    sfx.soft()
    setWobble(id)
    onWrong()
    // Säg vad barnet valde, men inte målordet: det ska fortfarande läsas.
    await audio.speak([phraseId('that_is'), wordId(id), phraseId('read_word_again')])
    setWobble(null)
    busy.current = false
  }

  if (!word) return null
  const letters = word.text.split('')

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-10">
      <div className="flex items-center gap-1 rounded-[32px] bg-white px-10 py-6 shadow-[0_10px_0_rgba(0,0,0,0.25)]">
        {letters.map((c, i) => (
          <span key={i} className={`text-[76px] leading-none font-extrabold ${caseClass(word.text)} transition-colors ${blend === i ? 'text-go' : 'text-space'}`}>
            {c}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-8">
        {task.options.map((id) => (
          <motion.button
            key={id}
            type="button"
            aria-label={wordById.get(id)?.text ?? id}
            onPointerDown={(e) => void tap(id, e)}
            whileTap={{ scale: 0.92 }}
            animate={wobble === id ? { rotate: [0, -10, 10, -6, 6, 0] } : solved && id === task.targetId ? { scale: [1, 1.25, 1.15] } : { rotate: 0, scale: 1 }}
            transition={{ duration: 0.5 }}
            className={`flex h-44 w-44 items-center justify-center rounded-[36px] bg-white/90 shadow-[0_8px_0_rgba(0,0,0,0.25)] ${solved && id !== task.targetId ? 'opacity-30' : ''} ${eliminated.includes(id) ? 'pointer-events-none opacity-20' : ''}`}
          >
            <span className="big-emoji text-[100px]">{wordById.get(id)?.emoji}</span>
          </motion.button>
        ))}
      </div>
      <div className="absolute bottom-4 left-4 z-10">
        <Mascot size={110} mood={solved || celebrating ? 'celebrate' : 'think'} pokeable={false} />
      </div>
    </div>
  )
}
