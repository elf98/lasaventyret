import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { audio } from '../audio/AudioManager'
import { sfx } from '../audio/sfx'
import BigButton from '../components/BigButton'
import { starBurst } from '../components/confetti'
import Mascot from '../components/Mascot'
import { useCaseClass } from '../components/textCase'
import { letterById, wordById } from '../content'
import { letterSoundId, phraseId, wordId } from '../content/audioIds'
import type { Task } from '../engine/types'
import { useSettings } from '../store/settings'

interface Props {
  task: Task
  scaffold: boolean
  eliminated?: string[]
  celebrating: boolean
  brief?: boolean
  onWrong: () => void
  onSolved: () => void
}

type Phase = 'slide' | 'pick' | 'done'

/**
 * Ljudbandet: ordets bokstäver sitter ihop som ett band. Barnet sätter fingret på första bokstaven
 * och drar åt höger i EN obruten rörelse; varje bokstav ljuder när fingret når den, och barnet ljudar
 * med. När fingret passerat sista bokstaven sägs ordet. Rörelsen är själva övningen: fingret som
 * glider är det som gör att ljuden hänger ihop i stället för att bli tre öar. Släpper barnet innan
 * slutet börjar bandet om, utan att det räknas som fel. Ordet sägs INTE efter draget: barnet ska ha
 * smält ihop det själv och visa det i bildvalet, ordet kommer först som bekräftelse. På Svår ljuder
 * bokstäverna inte alls under draget, bara fingret och barnets egen röst.
 */
export default function SoundBand({ task, scaffold, eliminated = [], celebrating, brief, onWrong, onSolved }: Props) {
  const word = wordById.get(task.targetId)
  const sounds = word?.sounds ?? []
  const caseClass = useCaseClass()
  const silent = useSettings((s) => s.difficulty) === 'hard'
  const [phase, setPhase] = useState<Phase>('slide')
  // Pekarhändelser kommer tätare än React hinner rita: läget hålls i refs och speglas till state.
  const [reached, setReachedState] = useState(-1)
  const reachedRef = useRef(-1)
  const setReached = (i: number) => {
    reachedRef.current = i
    setReachedState(i)
  }
  const [dragging, setDraggingState] = useState(false)
  const draggingRef = useRef(false)
  const setDragging = (v: boolean) => {
    draggingRef.current = v
    setDraggingState(v)
  }
  const [wobble, setWobble] = useState<string | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const band = useRef<HTMLDivElement>(null)
  const lifts = useRef(0)
  const busy = useRef(false)
  const alive = useRef(true)

  useEffect(() => {
    // Sätts här, inte bara vid skapandet: i dev kör React effekten två gånger och städningen
    // hade annars lämnat alive=false för gott, så att bandet aldrig gick vidare efter draget.
    alive.current = true
    audio.preload([...sounds.map(letterSoundId), wordId(task.targetId)])
    void audio.speak(phraseId(brief ? 'cue_band' : 'band_intro'))
    return () => {
      alive.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.targetId])

  useEffect(() => {
    if (!scaffold) return
    // Hjälp efter tre fel: ljuden med luft, sedan ordet, både under draget och i bildvalet.
    if (phase === 'slide') void audio.speakEach([phraseId('band_intro'), ...sounds.map(letterSoundId), wordId(task.targetId)], (i) => setReached(i - 1), 250).then(() => setReached(-1))
    if (phase === 'pick') void audio.speakEach([...sounds.map(letterSoundId), wordId(task.targetId)], undefined, 250)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scaffold])

  /** Bokstavsindex under fingret, eller −1 utanför bandet. */
  const indexAt = (x: number): number => {
    const el = band.current
    if (!el) return -1
    const r = el.getBoundingClientRect()
    if (x < r.left - 40) return -1
    if (x >= r.right) return sounds.length
    return Math.max(0, Math.min(sounds.length - 1, Math.floor(((x - r.left) / r.width) * sounds.length)))
  }

  const enter = (i: number, from: number) => {
    // Hoppar fingret över en bokstav spelas även den, snabbt, så att inget ljud saknas i ordet.
    const ids: string[] = []
    for (let k = from + 1; k <= Math.min(i, sounds.length - 1); k++) ids.push(letterSoundId(sounds[k]))
    if (ids.length && !silent) void audio.speakEach(ids, undefined, 0)
    setReached(Math.min(i, sounds.length - 1))
  }

  const finishSlide = async () => {
    setDragging(false)
    setReached(sounds.length - 1)
    sfx.whoosh()
    await new Promise((r) => setTimeout(r, 250))
    if (!alive.current) return
    if (word && word.emoji !== '' && task.options.length > 1) {
      // Ordet sägs inte här: barnet ska ha smält ihop det själv och visar det i bildvalet.
      setPhase('pick')
      void audio.speak(phraseId('which_picture'))
    } else {
      // Ord utan bild: inget att välja mellan, ordet är facit.
      await audio.speak(wordId(task.targetId))
      if (!alive.current) return
      setPhase('done')
      onSolved()
    }
  }

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (phase !== 'slide' || busy.current) return
    const i = indexAt(e.clientX)
    if (i !== 0) return
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* syntetiska events saknar pekare */
    }
    audio.stop()
    setDragging(true)
    enter(0, -1)
  }

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || phase !== 'slide' || busy.current) return
    const i = indexAt(e.clientX)
    const from = reachedRef.current
    if (i > from) {
      if (i >= sounds.length) {
        busy.current = true
        enter(sounds.length - 1, from)
        void finishSlide().then(() => (busy.current = false))
      } else enter(i, from)
    }
  }

  const onUp = () => {
    if (!draggingRef.current || phase !== 'slide' || busy.current) return
    setDragging(false)
    if (reachedRef.current >= sounds.length - 1) {
      busy.current = true
      void finishSlide().then(() => (busy.current = false))
      return
    }
    // Släppte för tidigt: börja om, inget fel. Efter två gånger påminner maskoten.
    lifts.current++
    setReached(-1)
    sfx.soft()
    if (lifts.current >= 2) void audio.speak(phraseId('band_lift'))
  }

  const pickPicture = async (id: string, e: React.PointerEvent) => {
    if (phase !== 'pick' || eliminated.includes(id)) return
    if (id === task.targetId) {
      setPicked(id)
      setPhase('done')
      sfx.tada()
      starBurst(e.clientX / window.innerWidth, e.clientY / window.innerHeight)
      await audio.speak(wordId(task.targetId))
      onSolved()
      return
    }
    if (busy.current) return
    busy.current = true
    sfx.soft()
    setWobble(id)
    onWrong()
    // Inte ordet: bara ljuden igen, tätt, så att barnet får smälta ihop dem en gång till.
    await audio.speakEach([phraseId('not_that_picture'), ...sounds.map(letterSoundId)], undefined, 150)
    setWobble(null)
    busy.current = false
  }

  if (!word) return null
  const cardSize = sounds.length > 5 ? 120 : sounds.length > 3 ? 150 : 180
  const many = task.options.length > 4

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-10">
      {phase === 'slide' && (
        <>
          {/* Bandet: bokstäverna kant i kant, pekarhändelser på hela raden. touch-none stoppar scroll/zoom. */}
          <div
            ref={band}
            className="flex touch-none items-center rounded-[28px] bg-white shadow-[0_10px_0_rgba(0,0,0,0.25)] select-none"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            role="presentation"
          >
            {sounds.map((s, i) => {
              const l = letterById.get(s)
              const lit = i <= reached
              return (
                <motion.div
                  key={i}
                  animate={lit ? { scale: 1.06, y: -6 } : { scale: 1, y: 0 }}
                  className={`flex items-center justify-center font-extrabold leading-none ${l?.type === 'vowel' ? 'text-vowel' : 'text-consonant'} ${lit ? 'bg-sun/40' : ''} ${i === 0 ? 'rounded-l-[28px]' : ''} ${i === sounds.length - 1 ? 'rounded-r-[28px]' : ''}`}
                  style={{ width: cardSize * 0.72, height: cardSize, fontSize: cardSize * 0.6 }}
                >
                  <span className={caseClass(word.text)}>{s}</span>
                </motion.div>
              )
            })}
          </div>
          <div className="flex items-center gap-3 text-[26px] font-bold text-white/70">
            <motion.span animate={dragging ? { x: 0 } : { x: [0, 30, 0] }} transition={{ duration: 1.4, repeat: Infinity }} className="big-emoji text-[56px]">
              👉
            </motion.span>
          </div>
        </>
      )}

      {(phase === 'pick' || phase === 'done') && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6">
          <div className={`rounded-[28px] bg-white px-8 py-3 text-[56px] font-extrabold text-space ${caseClass(word.text)}`}>{word.text}</div>
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
                  onPointerDown={(e) => void pickPicture(id, e)}
                  whileTap={{ scale: 0.9 }}
                  animate={picked === id ? { scale: [1, 1.3, 1.2] } : wobble === id ? { rotate: [0, -8, 8, 0] } : {}}
                  className={`flex items-center justify-center rounded-[36px] ${many ? 'h-40 w-40' : 'h-44 w-44'} ${picked === id ? 'bg-sun' : 'bg-white/15'} ${phase === 'done' && !isTarget ? 'opacity-30' : ''} ${eliminated.includes(id) ? 'pointer-events-none opacity-20' : ''}`}
                >
                  <span className={`big-emoji ${many ? 'text-[92px]' : 'text-[110px]'}`}>{w.emoji}</span>
                </motion.button>
              )
            })}
          </div>
        </div>
      )}

      <div className="absolute bottom-4 left-4 z-10">
        <Mascot size={110} mood={phase === 'done' || celebrating ? 'celebrate' : 'think'} pokeable={false} />
      </div>
      <div className="absolute bottom-5 left-1/2 z-10 -translate-x-1/2">
        <BigButton size="md" icon="🔊" color="bg-sun" onPress={() => void audio.speak(phase === 'slide' ? phraseId('cue_band') : wordId(task.targetId))} label="Lyssna igen" disabled={phase === 'done'} />
      </div>
    </div>
  )
}
