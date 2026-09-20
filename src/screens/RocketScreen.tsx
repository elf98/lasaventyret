import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { audio } from '../audio/AudioManager'
import { sfx } from '../audio/sfx'
import BigButton from '../components/BigButton'
import Mascot from '../components/Mascot'
import Rocket from '../components/Rocket'
import Starfield from '../components/Starfield'
import { zones } from '../content'
import { phraseId } from '../content/audioIds'
import { useApp } from '../store/app'
import { useProgress } from '../store/progress'

/**
 * Raketen: här sitter delarna som hittats, och klistermärkena får användas till något. Tryck på ett
 * klistermärke i brickan, sedan på raketen: det fastnar där. Tryck på ett fastsatt så lossnar det.
 * Tryck-tryck i stället för dragning: robustare på iPaden och lika begripligt för en sexåring.
 */
export default function RocketScreen() {
  const go = useApp((s) => s.go)
  const stickers = useProgress((s) => s.stickers)
  const placed = useProgress((s) => s.rocketStickers)
  const parts = useProgress((s) => s.rocketParts)
  const placeSticker = useProgress((s) => s.placeSticker)
  const remove = useProgress((s) => s.removeStickerPlacement)
  const [selected, setSelected] = useState<number | null>(null)
  const board = useRef<HTMLDivElement>(null)
  const placedIndex = new Set(placed.map((p) => p.index))
  const tray = stickers.map((s, i) => ({ s, i })).filter(({ i }) => !placedIndex.has(i))

  useEffect(() => {
    void audio.speak(phraseId(stickers.length ? 'rocket_intro' : 'rocket_empty'))
    return () => audio.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tapBoard = (e: React.PointerEvent<HTMLDivElement>) => {
    if (selected === null || !board.current) return
    const r = board.current.getBoundingClientRect()
    const x = Math.max(4, Math.min(96, ((e.clientX - r.left) / r.width) * 100))
    const y = Math.max(4, Math.min(96, ((e.clientY - r.top) / r.height) * 100))
    placeSticker({ index: selected, x, y })
    setSelected(null)
    sfx.pop()
  }

  return (
    <div className="screen flex items-center justify-center gap-10">
      <Starfield count={40} />
      <div className="absolute top-4 left-4 z-10">
        <BigButton size="md" icon="🗺️" color="bg-black/40" speakId={phraseId('btn_home')} onPress={() => go('map')} label="Till kartan" />
      </div>
      <div className="absolute top-6 right-6 z-10 flex items-center gap-3">
        {zones.map((z) => (
          <span key={z.id} className={`big-emoji text-[40px] ${parts.includes(z.part) ? '' : 'opacity-25 grayscale'}`} aria-label={`${z.partName}${parts.includes(z.part) ? '' : ' saknas'}`}>
            {z.partEmoji}
          </span>
        ))}
      </div>

      {/* Brickan med klistermärken som inte sitter på raketen. */}
      <div className="relative z-10 flex h-[78vh] w-[30vw] max-w-[380px] flex-wrap content-start justify-center gap-3 overflow-y-auto rounded-3xl bg-white/10 p-4 no-scrollbar">
        {tray.length === 0 && <span className="big-emoji mt-10 text-[90px] opacity-30">📒</span>}
        {tray.map(({ s, i }) => (
          <motion.button
            key={i}
            type="button"
            aria-label={`klistermärke ${s}`}
            onPointerDown={() => {
              sfx.pop()
              setSelected(selected === i ? null : i)
            }}
            whileTap={{ scale: 0.9 }}
            animate={selected === i ? { scale: [1, 1.2, 1.1], rotate: [0, -8, 8, 0] } : { scale: 1, rotate: 0 }}
            className={`flex h-20 w-20 items-center justify-center rounded-2xl text-[56px] leading-none ${selected === i ? 'bg-sun ring-4 ring-white' : 'bg-white/70'}`}
          >
            {s}
          </motion.button>
        ))}
      </div>

      {/* Raketen: tryck sätter fast det valda klistermärket där fingret är. */}
      <div ref={board} onPointerDown={tapBoard} className={`relative z-10 ${selected !== null ? 'cursor-crosshair' : ''}`} role="presentation">
        <Rocket parts={parts} size={Math.min(560, window.innerHeight * 0.8)} className={selected !== null ? 'glow rounded-full' : ''} />
        {placed.map((p) => (
          <motion.button
            key={p.index}
            type="button"
            aria-label={`klistermärke ${stickers[p.index]} på raketen`}
            onPointerDown={(e) => {
              e.stopPropagation()
              sfx.soft()
              remove(p.index)
            }}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -translate-x-1/2 -translate-y-1/2 text-[52px] leading-none"
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
          >
            {stickers[p.index]}
          </motion.button>
        ))}
      </div>

      <div className="absolute bottom-4 left-4 z-10">
        <Mascot size={120} mood={selected !== null ? 'think' : 'happy'} />
      </div>
    </div>
  )
}
