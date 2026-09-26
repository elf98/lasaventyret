import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { audio } from '../audio/AudioManager'
import { sfx } from '../audio/sfx'
import BigButton from '../components/BigButton'
import { starBurst } from '../components/confetti'
import Mascot from '../components/Mascot'
import { wordById } from '../content'
import { letterSoundId, phraseId, wordId } from '../content/audioIds'
import { masteryKey } from '../engine/mastery'
import type { Task } from '../engine/types'
import { useProgress } from '../store/progress'
import { useSettings } from '../store/settings'

interface Props {
  task: Task
  scaffold: boolean
  /** Alternativ som strukits som hjälp efter två fel: nedtonade och otryckbara. */
  eliminated?: string[]
  celebrating: boolean
  brief?: boolean
  onWrong: (picked?: string) => void
  onSolved: () => void
}

/** Luft mellan ljuden i millisekunder: mer på Lätt, mindre när ordet redan smälts ihop en gång. */
const GAP: Record<string, number> = { easy: 650, normal: 500, hard: 350 }

/**
 * Ordgåtan: ordet hörs i bitar ("m … u … s") och barnet trycker på bilden. Ren sammanljudning utan
 * bokstäver: barnet måste hålla ljuden i minnet och smälta ihop dem själv. Inget skrivet visas.
 * Fel: ljuden igen med lite mer luft. Hjälp efter tre fel: ljuden med krympande luft, sedan ordet,
 * så att barnet hör ordet stiga fram. Rätt: ljuden snabbt och ordet, som bekräftelse.
 */
export default function SoundRiddle({ task, scaffold, eliminated = [], celebrating, brief, onWrong, onSolved }: Props) {
  const word = wordById.get(task.targetId)
  const difficulty = useSettings((s) => s.difficulty)
  const streak = useProgress((s) => s.mastery[masteryKey('blend', task.targetId)]?.streak ?? 0)
  const gap = Math.round(GAP[difficulty] * (streak > 0 ? 0.7 : 1))
  const sounds = (word?.sounds ?? []).map(letterSoundId)
  const [solved, setSolved] = useState(false)
  const [wobble, setWobble] = useState<string | null>(null)
  const [pulse, setPulse] = useState(-1)
  const busy = useRef(false)

  const say = async (ms: number): Promise<boolean> => {
    const ok = await audio.speakEach(sounds, (i) => setPulse(i), ms)
    setPulse(-1)
    return ok
  }

  useEffect(() => {
    audio.preload([...sounds, wordId(task.targetId), ...task.options.map(wordId)])
    void audio.speak(phraseId(brief ? 'cue_riddle' : 'riddle_intro')).then((ok) => {
      if (ok) void say(gap)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.targetId])

  useEffect(() => {
    if (!scaffold || solved) return
    // Krympande luft: 600, 300, 0 ms och till sist ordet.
    void (async () => {
      for (const ms of [600, 300, 60]) if (!(await say(ms))) return
      await audio.speak(wordId(task.targetId))
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scaffold])

  const tap = async (id: string, e: React.PointerEvent) => {
    if (solved || eliminated.includes(id)) return
    if (id === task.targetId) {
      setSolved(true)
      sfx.tada()
      starBurst(e.clientX / window.innerWidth, e.clientY / window.innerHeight)
      // Bekräftelsen är själva poängen: ljuden tätt ihop och sedan ordet. Inväntas före berömmet.
      await audio.speakEach([phraseId('riddle_yes'), ...sounds, wordId(task.targetId)], (i) => setPulse(i - 1), 60)
      setPulse(-1)
      onSolved()
      return
    }
    if (busy.current) return
    busy.current = true
    sfx.soft()
    setWobble(id)
    onWrong(id)
    const ok = await audio.speak(phraseId('riddle_again'))
    if (ok) await say(gap + 200)
    setWobble(null)
    busy.current = false
  }

  if (!word) return null
  const many = task.options.length > 4

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-10">
      {/* Prickar, en per ljud: pulserar när ljudet spelas. Inga bokstäver, det är örat som jobbar. */}
      <motion.button type="button" aria-label="Lyssna igen" onPointerDown={() => void say(gap)} whileTap={{ scale: 0.94 }} className="flex h-40 items-center gap-6 rounded-[40px] bg-white/90 px-12 shadow-[0_10px_0_rgba(0,0,0,0.25)]">
        {sounds.map((_, i) => (
          <motion.span key={i} animate={pulse === i ? { scale: [1, 1.6, 1.2] } : { scale: 1 }} transition={{ duration: 0.3 }} className={`h-12 w-12 rounded-full ${pulse === i ? 'bg-sun' : 'bg-space/60'}`} />
        ))}
        <span className="big-emoji ml-2 text-[56px]">🔊</span>
      </motion.button>
      <div className={`flex items-center ${many ? 'gap-5' : 'gap-8'}`}>
        {task.options.map((id) => {
          const w = wordById.get(id)
          if (!w) return null
          const isTarget = id === task.targetId
          return (
            <motion.button
              key={id}
              type="button"
              aria-label={w.text}
              onPointerDown={(e) => void tap(id, e)}
              whileTap={{ scale: 0.92 }}
              animate={wobble === id ? { rotate: [0, -10, 10, -6, 6, 0] } : solved && isTarget ? { scale: [1, 1.25, 1.15] } : { rotate: 0, scale: 1 }}
              transition={{ duration: 0.5 }}
              className={`flex items-center justify-center rounded-[36px] bg-white/90 shadow-[0_8px_0_rgba(0,0,0,0.25)] ${many ? 'h-40 w-40' : 'h-44 w-44'} ${solved && !isTarget ? 'opacity-30' : ''} ${eliminated.includes(id) ? 'pointer-events-none opacity-20' : ''}`}
            >
              <span className={`big-emoji ${many ? 'text-[88px]' : 'text-[100px]'}`}>{w.emoji}</span>
            </motion.button>
          )
        })}
      </div>
      <div className="absolute bottom-4 left-4 z-10">
        <Mascot size={110} mood={solved || celebrating ? 'celebrate' : 'think'} pokeable={false} />
      </div>
      <div className="absolute bottom-5 left-1/2 z-10 -translate-x-1/2">
        <BigButton size="md" icon="🔊" color="bg-sun" onPress={() => void say(gap)} label="Lyssna igen" disabled={solved} />
      </div>
    </div>
  )
}
