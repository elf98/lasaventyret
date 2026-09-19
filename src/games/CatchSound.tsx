import { motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { audio } from '../audio/AudioManager'
import { sfx } from '../audio/sfx'
import BigButton from '../components/BigButton'
import { starBurst } from '../components/confetti'
import LetterCard from '../components/LetterCard'
import Mascot from '../components/Mascot'
import { letterById, wordById } from '../content'
import { letterSoundId, phraseId } from '../content/audioIds'
import type { Task } from '../engine/types'
import { useSettings } from '../store/settings'

interface Props {
  task: Task
  /** Efter två fel: stanna allt, visa bara rätt bokstav och peka på den. */
  scaffold: boolean
  /** Alternativ som strukits som hjälp efter två fel: nedtonade och otryckbara. */
  eliminated?: string[]
  /** Värden (SessionScreen) berömmer; vi visar bara resultatet under tiden. */
  celebrating: boolean
  /** Kort instruktion (spelet har redan förklarats en gång i passet). */
  brief?: boolean
  /** Vad barnet valde: används för att se vilka par som förväxlas. */
  onWrong: (picked?: string) => void
  onSolved: () => void
}

const VEHICLES = ['🚀', '🛸', '🚗', '🏎️', '🚁', '🛰️']
const LANES = [20, 40, 60, 78]

/**
 * Fånga ljudet: bokstäver flyger förbi i farkoster, tryck på den som säger [ljud].
 * Fel svar ger en mjuk hint och nytt försök. Aldrig något straffande.
 */
export default function CatchSound({ task, scaffold, eliminated = [], celebrating, brief, onWrong, onSolved }: Props) {
  // Rörliga mål mäter också reaktionstid; på lätt nivå ska ljudet få vara det svåra.
  const slow = useSettings((st) => st.difficulty) === 'easy'
  const [ready, setReady] = useState(false)
  const [solved, setSolved] = useState(false)
  const [wobble, setWobble] = useState<string | null>(null)
  const busy = useRef(false)
  const target = letterById.get(task.targetId)
  const example = target ? wordById.get(target.example) : undefined

  const flyers = useMemo(
    () =>
      task.options.map((id, i) => ({
        id,
        lane: LANES[i % LANES.length],
        dir: i % 2 === 0 ? 'right' : 'left',
        dur: (slow ? 19 : 11) + Math.random() * 4,
        delay: -Math.random() * 9,
        vehicle: VEHICLES[(i + Math.floor(Math.random() * VEHICLES.length)) % VEHICLES.length],
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [task.options],
  )

  useEffect(() => {
    let alive = true
    audio.preload([...task.options.map(letterSoundId), phraseId('almost'), phraseId('we_look_for')])
    // Tryck tillåts så fort själva ljudet börjar spelas, inte först när det tystnat.
    void audio.speak(phraseId(brief ? 'cue_catch' : 'catch_intro')).then(() => {
      if (!alive) return
      setReady(true)
      void audio.speak(letterSoundId(task.targetId))
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.targetId, task.options])

  useEffect(() => {
    if (!scaffold || solved) return
    void audio.speak([phraseId('scaffold'), letterSoundId(task.targetId), phraseId('tap_it')])
  }, [scaffold, solved, task.targetId])

  const replay = () => void audio.speak(letterSoundId(task.targetId))

  const tap = async (id: string, e: React.PointerEvent) => {
    if (eliminated.includes(id) || solved) return
    // Under introt föll trycket bort tyst och räknades ändå som frenetiskt tryckande. Nu hoppar
    // trycket i stället över introt och spelar ljudet barnet ska leta efter.
    if (!ready) {
      setReady(true)
      void audio.speak(letterSoundId(task.targetId))
      return
    }
    if (id === task.targetId) {
      busy.current = false
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
    onWrong(id)
    await audio.speak([phraseId('almost'), letterSoundId(id), phraseId('we_look_for'), letterSoundId(task.targetId)])
    setWobble(null)
    busy.current = false
  }

  const showStatic = scaffold && !solved
  const paused = solved || showStatic || celebrating

  return (
    <div className="absolute inset-0">
      {!showStatic &&
        flyers.map((f) => (
          <div
            key={f.id}
            className={`flyer ${f.dir} ${paused ? 'paused' : ''}`}
            style={{ top: `${f.lane}%`, animationDuration: `${f.dur}s`, animationDelay: `${f.delay}s`, transform: 'translateY(-50%)' }}
          >
            <motion.button
              type="button"
              aria-label={f.id}
              onPointerDown={(e) => void tap(f.id, e)}
              whileTap={{ scale: 0.9 }}
              animate={wobble === f.id ? { rotate: [0, -12, 12, -8, 8, 0] } : solved && f.id === task.targetId ? { scale: [1, 1.5, 1.3] } : { rotate: 0 }}
              transition={{ duration: 0.5 }}
              className={`flex flex-col items-center gap-1 ${solved && f.id !== task.targetId ? 'opacity-30' : ''} ${eliminated.includes(f.id) ? 'pointer-events-none opacity-20' : ''}`}
            >
              <LetterCard letterId={f.id} size={110} />
              <span className="big-emoji text-[48px]" style={{ transform: f.dir === 'left' ? 'scaleX(-1)' : undefined }}>
                {f.vehicle}
              </span>
            </motion.button>
          </div>
        ))}

      {showStatic && (
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.button
            type="button"
            aria-label={task.targetId}
            onPointerDown={(e) => void tap(task.targetId, e)}
            animate={{ scale: [1, 1.12, 1] }}
            transition={{ duration: 1.2, repeat: Infinity }}
            className="glow relative rounded-3xl"
          >
            <LetterCard letterId={task.targetId} size={220} />
            <motion.span animate={{ y: [0, -22, 0] }} transition={{ duration: 0.8, repeat: Infinity }} className="big-emoji absolute -right-12 -bottom-12 text-[90px]">
              👆
            </motion.span>
          </motion.button>
        </div>
      )}

      {solved && example && (
        <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-10">
          <LetterCard letterId={task.targetId} size={200} />
          <div className="flex flex-col items-center">
            <span className="big-emoji text-[160px]">{example.emoji}</span>
            <span className="text-[48px] font-extrabold tracking-wide">{example.text}</span>
          </div>
        </motion.div>
      )}

      <div className="absolute bottom-4 left-4 z-10">
        <Mascot size={110} mood={solved ? 'celebrate' : 'think'} pokeable={false} />
      </div>
      <div className="absolute bottom-5 left-1/2 z-10 -translate-x-1/2">
        <BigButton size="md" icon="🔊" color="bg-sun" onPress={replay} label="Lyssna igen" disabled={solved} />
      </div>
    </div>
  )
}
