import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { audio } from '../audio/AudioManager'
import { sfx } from '../audio/sfx'
import BigButton from '../components/BigButton'
import { burstConfetti } from '../components/confetti'
import HoldButton from '../components/HoldButton'
import Mascot from '../components/Mascot'
import StarCounter from '../components/StarCounter'
import Starfield from '../components/Starfield'
import { levels, stickers, type Level } from '../content'
import { levelNameId, phraseId } from '../content/audioIds'
import { pick } from '../engine/random'
import { useApp } from '../store/app'
import { selectCompleted, selectUnlocked, useProgress } from '../store/progress'
import { useSettings } from '../store/settings'
import ParentGate from './ParentGate'

/** Kartans bredd i vw; planeternas x anges i vw i levels.json. */
const MAP_WIDTH = 175

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const isBonus = (l: Level) => l.requires.length === 0 && l.kind === 'phonology'

/** Rymdkartan: planeter = nivåer, scrollas i sidled. Maskoten sitter vid aktuell planet. */
export default function MapScreen() {
  const go = useApp((s) => s.go)
  const startSession = useApp((s) => s.startSession)
  const pendingUnlock = useApp((s) => s.pendingUnlock)
  const clearPendingUnlock = useApp((s) => s.clearPendingUnlock)
  const playStartedAt = useApp((s) => s.playStartedAt)
  const sessionMinutes = useSettings((s) => s.sessionMinutes)
  const unlockAll = useSettings((s) => s.unlockAll)
  const progress = useProgress()
  const completed = selectCompleted(progress)
  const unlocked = unlockAll ? levels.map((l) => l.id) : selectUnlocked(progress)
  const [gate, setGate] = useState(false)
  const [flying, setFlying] = useState<Level | null>(null)
  const [prize, setPrize] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  // Egen panorering: iOS scrollar inte alltid en overflow-container i sidled,
  // så fingret/musen flyttar kartan själv och pilknapparna finns som reserv.
  const pan = useRef<{ x0: number; left0: number; moved: boolean } | null>(null)
  const suppressTap = useRef(false)
  const [scrollX, setScrollX] = useState(0)
  const [mounted, setMounted] = useState(false)
  const chestAvailable = progress.lastChestDate !== today()
  const current = levels.find((l) => !isBonus(l) && unlocked.includes(l.id) && !completed.includes(l.id)) ?? levels[levels.length - 1]

  useEffect(() => {
    if (Date.now() - playStartedAt > sessionMinutes * 60_000) {
      go('pause')
      return
    }
    const el = scroller.current
    if (el) {
      el.scrollLeft = Math.max(0, (current.x / 100) * window.innerWidth - window.innerWidth / 2)
      setScrollX(el.scrollLeft)
    }
    setMounted(true)
    const intro: string[] = []
    if (progress.sessions.length === 0 && !pendingUnlock) intro.push(phraseId('map_intro'))
    if (chestAvailable && progress.sessions.length > 0) intro.push(phraseId('chest_here'))
    if (pendingUnlock) {
      sfx.unlock()
      const t = setTimeout(clearPendingUnlock, 2600)
      return () => clearTimeout(t)
    }
    if (intro.length) void audio.speak(intro)
    return () => audio.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const scrollBy = (dx: number) => {
    const el = scroller.current
    if (!el) return
    el.scrollTo({ left: Math.max(0, Math.min(el.scrollWidth - el.clientWidth, el.scrollLeft + dx)), behavior: 'smooth' })
    setTimeout(() => setScrollX(el.scrollLeft), 500)
  }

  const onPanStart = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = scroller.current
    if (!el) return
    pan.current = { x0: e.clientX, left0: el.scrollLeft, moved: false }
    suppressTap.current = false
  }
  const onPanMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = scroller.current
    const p = pan.current
    if (!el || !p) return
    const dx = e.clientX - p.x0
    if (Math.abs(dx) > 10) {
      p.moved = true
      suppressTap.current = true
    }
    if (p.moved) el.scrollLeft = p.left0 - dx
  }
  const onPanEnd = () => {
    pan.current = null
    setScrollX(scroller.current?.scrollLeft ?? 0)
  }

  const tapPlanet = async (level: Level) => {
    if (flying || suppressTap.current) return
    if (!unlocked.includes(level.id)) {
      sfx.soft()
      void audio.speak(phraseId('level_locked'))
      return
    }
    sfx.whoosh()
    setFlying(level)
    const ok = await audio.speak([phraseId('lets_go_to'), levelNameId(level.id)])
    if (ok) startSession(level.id)
  }

  const openChest = async () => {
    if (prize) return
    if (!chestAvailable) {
      sfx.soft()
      void audio.speak(phraseId('chest_tomorrow'))
      return
    }
    const sticker = pick(stickers)
    progress.addSticker(sticker)
    progress.addStars(3)
    progress.openChest(today())
    setPrize(sticker)
    sfx.tada()
    burstConfetti()
    await audio.speak(phraseId('chest_open'))
    setTimeout(() => setPrize(null), 1200)
  }

  const mascotAt = flying ?? current

  return (
    <div className="screen">
      <Starfield />
      <div
        ref={scroller}
        className="no-scrollbar absolute inset-0 touch-none overflow-hidden select-none"
        onPointerDown={onPanStart}
        onPointerMove={onPanMove}
        onPointerUp={onPanEnd}
        onPointerCancel={onPanEnd}
        onPointerLeave={onPanEnd}
        onWheel={(e) => {
          if (scroller.current) scroller.current.scrollLeft += e.deltaY + e.deltaX
          setScrollX(scroller.current?.scrollLeft ?? 0)
        }}
      >
        <div className="relative h-full" style={{ width: `${MAP_WIDTH}vw` }}>
          <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${MAP_WIDTH} 100`} preserveAspectRatio="none">
            <polyline points={levels.filter((l) => !isBonus(l)).map((l) => `${l.x},${l.y}`).join(' ')} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.4" strokeDasharray="1.2 1.2" />
          </svg>

          {levels.map((l) => {
            const isDone = completed.includes(l.id)
            const isOpen = unlocked.includes(l.id)
            const isCurrent = l.id === current.id && !isDone
            const justUnlocked = pendingUnlock === l.id
            return (
              <motion.button
                key={l.id}
                type="button"
                aria-label={l.name}
                onClick={() => void tapPlanet(l)}
                whileTap={{ scale: 0.9 }}
                initial={justUnlocked ? { scale: 0.4 } : false}
                animate={justUnlocked ? { scale: [0.4, 1.35, 1] } : isCurrent ? { y: [0, -8, 0] } : { scale: 1 }}
                transition={justUnlocked ? { duration: 1.2, delay: 0.4 } : { duration: 2, repeat: Infinity }}
                className="absolute flex h-32 w-32 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
                style={{ left: `${l.x}vw`, top: `${l.y}%` }}
              >
                <span className={`big-emoji text-[88px] ${isOpen ? '' : 'opacity-40 grayscale'} ${isCurrent ? 'glow' : ''}`}>{l.emoji}</span>
                {!isOpen && <span className="big-emoji absolute right-0 bottom-0 text-[40px]">🔒</span>}
                {justUnlocked && (
                  <motion.span initial={{ scale: 1, opacity: 1 }} animate={{ scale: 0, rotate: 180, opacity: 0 }} transition={{ duration: 0.8, delay: 0.3 }} className="big-emoji absolute right-0 bottom-0 text-[40px]">
                    🔒
                  </motion.span>
                )}
                {isDone && <span className="big-emoji absolute -top-1 right-0 text-[40px]">⭐</span>}
                {isBonus(l) && isOpen && !isDone && <span className="big-emoji absolute -top-1 right-0 text-[36px]">🎈</span>}
              </motion.button>
            )
          })}

          <motion.div
            className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
            initial={false}
            animate={{ left: `${mascotAt.x - (flying ? 0 : 7)}vw`, top: `${mascotAt.y + (flying ? -14 : 16)}%`, scale: flying ? 0.7 : 1 }}
            transition={{ duration: 1.4, ease: 'easeInOut' }}
          >
            <Mascot size={130} mood={flying ? 'celebrate' : 'idle'} pokeable={!flying} />
          </motion.div>
        </div>
      </div>

      {scrollX > 10 && (
        <div className="absolute top-1/2 left-3 z-20 -translate-y-1/2">
          <BigButton size="md" icon="◀️" color="bg-black/40" onPress={() => scrollBy(-window.innerWidth * 0.6)} label="Åt vänster" />
        </div>
      )}
      {mounted && scroller.current && scrollX < scroller.current.scrollWidth - scroller.current.clientWidth - 10 && (
        <div className="absolute top-1/2 right-3 z-20 -translate-y-1/2">
          <BigButton size="md" icon="▶️" color="bg-black/40" onPress={() => scrollBy(window.innerWidth * 0.6)} label="Åt höger" />
        </div>
      )}

      <div className="pointer-events-none absolute top-3 right-4 left-4 z-20 flex items-center justify-between">
        <div className="pointer-events-auto"><StarCounter value={progress.stars} /></div>
        <motion.button
          type="button"
          aria-label="Skattkista"
          onClick={() => void openChest()}
          whileTap={{ scale: 0.9 }}
          animate={chestAvailable ? { rotate: [0, -8, 8, 0], scale: [1, 1.1, 1] } : {}}
          transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 1.5 }}
          className={`big-emoji pointer-events-auto text-[64px] ${chestAvailable ? '' : 'opacity-50 grayscale'}`}
        >
          {prize ? '🎉' : '🎁'}
        </motion.button>
        <div className="pointer-events-auto flex items-center gap-4">
          <BigButton size="md" icon="📒" color="bg-black/40" speakId={phraseId('btn_stickers')} onPress={() => go('stickers')} label="Klistermärken" />
          <HoldButton onHold={() => setGate(true)} />
        </div>
      </div>

      <AnimatePresence>
        {prize && (
          <motion.div initial={{ scale: 0, y: 0 }} animate={{ scale: [0, 1.6, 1.3], y: [0, -40, -60] }} exit={{ scale: 0, opacity: 0 }} transition={{ duration: 0.9 }} className="big-emoji pointer-events-none absolute top-1/2 left-1/2 z-20 -translate-x-1/2 -translate-y-1/2 text-[150px]">
            {prize}
          </motion.div>
        )}
      </AnimatePresence>

      {gate && <ParentGate onClose={() => setGate(false)} onSuccess={() => go('parent')} />}
    </div>
  )
}
