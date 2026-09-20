import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { audio } from '../audio/AudioManager'
import { sfx } from '../audio/sfx'
import BigButton from '../components/BigButton'
import { starBurst } from '../components/confetti'
import Mascot from '../components/Mascot'
import { useCaseClass } from '../components/textCase'
import { sightwordById, wordById } from '../content'
import { letterSoundId, phraseId, sightWordId, wordId } from '../content/audioIds'
import type { Task } from '../engine/types'

interface Props {
  task: Task
  scaffold: boolean
  /** Alternativ som strukits som hjälp efter två fel: nedtonade och otryckbara. */
  eliminated?: string[]
  celebrating: boolean
  brief?: boolean
  /** Vad barnet valde: används för att se vilka par som förväxlas. */
  onWrong: (picked?: string) => void
  onSolved: () => void
}

/**
 * Vilket ord? i två varianter:
 * - hör ett ord, tryck på rätt skrivet ord (ordbilder eller ljudenliga ord med lika långa distraktorer);
 * - läs-först (variant 'read'): bilden syns, orden står skrivna och INGET sägs förrän barnet valt.
 *   Alla alternativ måste läsas för att hitta det som passar bilden: ren avkodning, som Läs och välj
 *   fast åt andra hållet.
 */
export default function WhichWord({ task, scaffold, eliminated = [], celebrating, brief, onWrong, onSolved }: Props) {
  const isSight = task.kind === 'sightword'
  const readFirst = task.variant === 'read'
  const target = wordById.get(task.targetId)
  const label = (id: string) => (isSight ? sightwordById.get(id)?.text : wordById.get(id)?.text) ?? id
  const caseClass = useCaseClass()
  const aud = (id: string) => (isSight ? sightWordId(id) : wordId(id))
  const [ready, setReady] = useState(false)
  const [solved, setSolved] = useState(false)
  const [wobble, setWobble] = useState<string | null>(null)
  const [blend, setBlend] = useState(-1)
  const busy = useRef(false)

  useEffect(() => {
    audio.preload(task.options.map(aud))
    setReady(true)
    // Hör-varianten: ingen instruktion, bara ordet. Läs-först: kort cue, ordet sägs inte.
    if (readFirst) void audio.speak(phraseId(brief ? 'cue_read_which' : 'read_which_intro'))
    else void audio.speak(aud(task.targetId))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.targetId])

  // Scaffolding pekar inte ut rätt ord (då blir det ingen läsning): hör-varianten säger ordet igen
  // och ger första ljudet; läs-först ljudar målordet bokstav för bokstav med markering.
  useEffect(() => {
    if (!scaffold || solved) return
    if (readFirst && target) {
      const sounds = target.decodable && !target.noBlend ? target.sounds : []
      void audio.speakEach([...sounds.map(letterSoundId), wordId(task.targetId)], (i) => setBlend(i < sounds.length ? i : -1)).then(() => setBlend(-1))
      return
    }
    const first = label(task.targetId).charAt(0).toLowerCase()
    void audio.speak([phraseId('listen_again'), aud(task.targetId), phraseId('hint_starts_with'), letterSoundId(first)])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scaffold])

  const tap = async (id: string, e: React.PointerEvent) => {
    if (eliminated.includes(id)) return
    if (!ready || solved) return
    if (id === task.targetId) {
      setSolved(true)
      sfx.tada()
      starBurst(e.clientX / window.innerWidth, e.clientY / window.innerHeight)
      // Läs-först: belöningen är att höra ordet man just läst, invänta det före berömmet.
      if (readFirst) await audio.speak(aud(task.targetId))
      onSolved()
      return
    }
    if (busy.current) return
    busy.current = true
    sfx.soft()
    setWobble(id)
    onWrong(id)
    // Läs-först: säg vad barnet valde men inte målordet, det ska fortfarande läsas.
    if (readFirst) await audio.speak([phraseId('that_is'), aud(id), phraseId('read_word_again')])
    else await audio.speak([phraseId('listen_again'), aud(task.targetId)])
    setWobble(null)
    busy.current = false
  }

  const many = task.options.length > 3
  const letters = (id: string) => label(id).split('')

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-8">
      {readFirst && target && (
        <div className="flex h-44 w-44 items-center justify-center rounded-[40px] bg-white/90 shadow-[0_10px_0_rgba(0,0,0,0.25)]">
          <span className="big-emoji text-[110px]">{target.emoji}</span>
        </div>
      )}
      <div className={`flex max-w-[94vw] flex-wrap items-center justify-center ${many ? 'gap-5' : 'gap-8'}`}>
        {task.options.map((id) => {
          const isTarget = id === task.targetId
          const dim = solved && !isTarget
          return (
            <motion.button
              key={id}
              type="button"
              aria-label={label(id)}
              onPointerDown={(e) => void tap(id, e)}
              whileTap={{ scale: 0.92 }}
              animate={wobble === id ? { rotate: [0, -8, 8, -5, 5, 0] } : solved && isTarget ? { scale: [1, 1.25, 1.15] } : { rotate: 0, scale: 1 }}
              transition={{ duration: 0.5 }}
              className={`relative flex items-center justify-center rounded-[32px] bg-white font-extrabold text-space shadow-[0_8px_0_rgba(0,0,0,0.25)] ${many ? 'min-w-44 px-7 py-6 text-[52px]' : 'min-w-52 px-10 py-8 text-[64px]'} ${caseClass(label(id))} ${dim ? 'opacity-30' : ''} ${eliminated.includes(id) ? 'pointer-events-none opacity-20' : ''}`}
            >
              {isTarget && blend >= 0 ? letters(id).map((c, i) => <span key={i} className={blend === i ? 'text-go' : ''}>{c}</span>) : label(id)}
            </motion.button>
          )
        })}
      </div>
      <div className="absolute bottom-4 left-4 z-10">
        <Mascot size={110} mood={solved || celebrating ? 'celebrate' : 'think'} pokeable={false} />
      </div>
      {!readFirst && (
        <div className="absolute bottom-5 left-1/2 z-10 -translate-x-1/2">
          <BigButton size="md" icon="🔊" color="bg-sun" onPress={() => void audio.speak(aud(task.targetId))} label="Lyssna igen" disabled={solved} />
        </div>
      )}
    </div>
  )
}
