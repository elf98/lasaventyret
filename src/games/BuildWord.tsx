import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { audio } from '../audio/AudioManager'
import { sfx } from '../audio/sfx'
import BigButton from '../components/BigButton'
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

/**
 * Bygg ordet: bild + tomma rutor. Dra (eller tryck på) brickorna så att
 * ljuden hamnar i ordning. När ordet är klart ljudas det ihop, ruta för ruta.
 */
export default function BuildWord({ task, scaffold, celebrating, brief, onWrong, onSolved }: Props) {
  const word = wordById.get(task.targetId)
  const sounds = word?.sounds ?? []
  const tiles = task.options
  const [placed, setPlaced] = useState<number[]>([]) // brick-index per ruta
  const [wobble, setWobble] = useState<number | null>(null)
  const [blend, setBlend] = useState<number>(-1)
  const [done, setDone] = useState(false)
  const busy = useRef(false)
  const slotRow = useRef<HTMLDivElement>(null)
  const next = placed.length
  // Egen dragning med pointer capture: fungerar lika på iPad-finger och mus,
  // och kräver ingen animationsloop (framer-motions drag hänger i dolda flikar).
  const drag = useRef<{ idx: number; x0: number; y0: number; moved: boolean } | null>(null)
  const [dragPos, setDragPos] = useState<{ idx: number; dx: number; dy: number } | null>(null)

  useEffect(() => {
    audio.preload([...sounds.map(letterSoundId), wordId(task.targetId)])
    // Ord utan bild (har, kan, inte): utan ledtråd är uppgiften omöjlig, så ordet sägs först.
    const intro = [phraseId(brief ? 'build_first' : 'build_intro'), letterSoundId(sounds[0])]
    void audio.speak(word && word.emoji === '' ? [phraseId('build_word_is'), wordId(task.targetId), ...intro] : intro)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.targetId])

  useEffect(() => {
    if (scaffold && !done) void audio.speak([phraseId('build_next'), letterSoundId(sounds[next]), phraseId('tap_it')])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scaffold])

  // Lever komponenten fortfarande? Ljudningen kan avbrytas av annat tal (t.ex. "Lugn!"-pausen) utan att
  // uppgiften ska gå förlorad; bara om spelet lämnats (kartan) ska onSolved utebli.
  const alive = useRef(true)
  useEffect(() => () => {
    alive.current = false
  }, [])

  const finish = async () => {
    setDone(true)
    await audio.speakEach([phraseId('build_blend'), ...sounds.map(letterSoundId), wordId(task.targetId)], (i) => {
      setBlend(i - 1 >= 0 && i - 1 < sounds.length ? i - 1 : -1)
      if (i === sounds.length + 1) sfx.tada()
    })
    setBlend(-1)
    if (alive.current) onSolved()
  }

  const attempt = async (tileIdx: number) => {
    if (done || placed.includes(tileIdx)) return
    const letter = tiles[tileIdx]
    if (letter === sounds[next]) {
      sfx.pop()
      const p = [...placed, tileIdx]
      setPlaced(p)
      busy.current = true
      await audio.speak(letterSoundId(letter))
      busy.current = false
      if (p.length === sounds.length) void finish()
      return
    }
    if (busy.current) return
    busy.current = true
    sfx.soft()
    setWobble(tileIdx)
    onWrong()
    await audio.speak([phraseId('almost'), letterSoundId(letter), phraseId('build_next'), letterSoundId(sounds[next])])
    setWobble(null)
    busy.current = false
  }

  const insideSlots = (x: number, y: number) => {
    const row = slotRow.current?.getBoundingClientRect()
    return !!row && x > row.left - 60 && x < row.right + 60 && y > row.top - 80 && y < row.bottom + 80
  }

  const onPointerDown = (i: number, e: React.PointerEvent<HTMLDivElement>) => {
    if (done || placed.includes(i)) return
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* syntetiska events saknar aktiv pekare; dragning fungerar ändå inom brickan */
    }
    drag.current = { idx: i, x0: e.clientX, y0: e.clientY, moved: false }
    setDragPos({ idx: i, dx: 0, dy: 0 })
  }

  const onPointerMove = (i: number, e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.idx !== i) return
    const dx = e.clientX - d.x0
    const dy = e.clientY - d.y0
    if (Math.abs(dx) + Math.abs(dy) > 8) d.moved = true
    setDragPos({ idx: i, dx, dy })
  }

  const onPointerUp = (i: number, e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    drag.current = null
    setDragPos(null)
    if (!d || d.idx !== i) return
    // Kort tryck = lägg i nästa ruta. Dragning = måste släppas över rutorna.
    if (!d.moved || insideSlots(e.clientX, e.clientY)) void attempt(i)
  }

  const replay = () => void audio.speak(done ? wordId(task.targetId) : letterSoundId(sounds[next]))

  if (!word) return null
  const size = sounds.length > 5 ? 84 : 104
  const hintTile = scaffold && !done ? tiles.findIndex((t, i) => t === sounds[next] && !placed.includes(i)) : -1

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-8">
      <div className="flex items-center gap-6">
        {word.emoji ? (
          <span className="big-emoji text-[130px]">{word.emoji}</span>
        ) : (
          <motion.button type="button" aria-label="Hör ordet" onPointerDown={() => void audio.speak(wordId(task.targetId))} whileTap={{ scale: 0.92 }} className="flex h-32 w-32 items-center justify-center rounded-full bg-white/20">
            <span className="big-emoji text-[80px]">🔊</span>
          </motion.button>
        )}
      </div>

      <div ref={slotRow} className="flex items-center gap-3">
        {sounds.map((s, i) => {
          const filled = i < placed.length
          return (
            <motion.div
              key={i}
              animate={blend === i ? { scale: 1.2, y: -12 } : { scale: 1, y: 0 }}
              className={`flex items-center justify-center rounded-3xl border-4 border-dashed ${i === next && !done ? 'border-sun bg-sun/10' : 'border-white/40'} ${blend === i ? 'glow' : ''}`}
              style={{ width: size + 12, height: size + 12 }}
            >
              {filled ? <LetterCard letterId={s} size={size} /> : <span className="text-[40px] text-white/30">·</span>}
            </motion.div>
          )
        })}
      </div>

      <div className="flex items-center gap-5">
        {tiles.map((t, i) => {
          const isPlaced = placed.includes(i)
          const dragging = dragPos?.idx === i
          return (
            <div
              key={i}
              role="button"
              aria-label={`bricka ${t}`}
              onPointerDown={(e) => onPointerDown(i, e)}
              onPointerMove={(e) => onPointerMove(i, e)}
              onPointerUp={(e) => onPointerUp(i, e)}
              onPointerCancel={() => {
                drag.current = null
                setDragPos(null)
              }}
              className="relative cursor-grab touch-none select-none"
              style={{
                pointerEvents: isPlaced ? 'none' : 'auto',
                transform: dragging ? `translate(${dragPos.dx}px, ${dragPos.dy}px) scale(1.12)` : 'translate(0px, 0px)',
                transition: dragging ? 'none' : 'transform 0.25s ease-out',
                zIndex: dragging ? 20 : 1,
              }}
            >
              <motion.div
                animate={isPlaced ? { opacity: 0, scale: 0.5 } : wobble === i ? { rotate: [0, -12, 12, -8, 8, 0] } : hintTile === i ? { scale: [1, 1.12, 1] } : { opacity: 1, scale: 1, rotate: 0 }}
                transition={{ duration: 0.5, repeat: hintTile === i ? Infinity : 0 }}
                className={hintTile === i ? 'glow rounded-3xl' : ''}
              >
                <LetterCard letterId={t} size={size} />
              </motion.div>
              {hintTile === i && (
                <motion.span animate={{ y: [0, -16, 0] }} transition={{ duration: 0.7, repeat: Infinity }} className="big-emoji pointer-events-none absolute -right-8 -bottom-10 text-[64px]">👆</motion.span>
              )}
            </div>
          )
        })}
      </div>

      <div className="absolute bottom-4 left-4 z-10">
        <Mascot size={110} mood={done || celebrating ? 'celebrate' : 'think'} pokeable={false} />
      </div>
      <div className="absolute bottom-5 left-1/2 z-10 -translate-x-1/2">
        <BigButton size="md" icon="🔊" color="bg-sun" onPress={replay} label="Lyssna igen" disabled={done} />
      </div>
    </div>
  )
}
