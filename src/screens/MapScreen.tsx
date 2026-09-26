import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { audio } from '../audio/AudioManager'
import { sfx } from '../audio/sfx'
import BigButton from '../components/BigButton'
import { burstConfetti } from '../components/confetti'
import FullscreenButton from '../components/FullscreenButton'
import HoldButton from '../components/HoldButton'
import Mascot from '../components/Mascot'
import PlanetInfo from '../components/PlanetInfo'
import StarCounter from '../components/StarCounter'
import StarRating from '../components/StarRating'
import Starfield from '../components/Starfield'
import { levels, stickers, zones, type Level } from '../content'
import { levelGoalId, levelLineId, levelNameId, phraseId, zoneDoneId } from '../content/audioIds'
import { pick } from '../engine/random'
import { isBonus, isMain, isSidePath, levelProgress, sidePathLit } from '../engine/unlock'
import { useApp } from '../store/app'
import { selectCompleted, selectUnlocked, useProgress } from '../store/progress'
import { useSettings } from '../store/settings'
import ParentGate from './ParentGate'

/** Kartans bredd i vw; planeternas x anges i vw i levels.json. */
const MAP_WIDTH = 278

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Områdenas gränser i vw: mitt emellan sista planeten i ett område och första i nästa. */
function zoneBands(): { id: number; left: number; width: number }[] {
  const main = levels.filter(isMain)
  return zones.map((z, i) => {
    const first = main.find((l) => l.zone === z.id)
    const prevLast = [...main].reverse().find((l) => l.zone === z.id - 1)
    const left = i === 0 || !first || !prevLast ? 0 : (prevLast.x + first.x) / 2
    const next = zones[i + 1]
    const nextFirst = next ? main.find((l) => l.zone === next.id) : undefined
    const thisLast = [...main].reverse().find((l) => l.zone === z.id)
    const right = nextFirst && thisLast ? (thisLast.x + nextFirst.x) / 2 : MAP_WIDTH
    return { id: z.id, left, width: right - left }
  })
}
const BANDS = zoneBands()

/** Tvillingplaneter vars tändning redan berättats i den här körningen. */
const announcedLit = new Set<string>()

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
  const [info, setInfo] = useState<Level | null>(null)
  const [partFound, setPartFound] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  // Egen panorering: iOS scrollar inte alltid en overflow-container i sidled,
  // så fingret/musen flyttar kartan själv och pilknapparna finns som reserv.
  const pan = useRef<{ x0: number; left0: number; moved: boolean } | null>(null)
  const suppressTap = useRef(false)
  const [scrollX, setScrollX] = useState(0)
  const [mounted, setMounted] = useState(false)
  const chestAvailable = progress.lastChestDate !== today()
  const current = levels.find((l) => isMain(l) && unlocked.includes(l.id) && !completed.includes(l.id)) ?? [...levels].reverse().find(isMain) ?? levels[0]
  const lit = (l: Level) => isSidePath(l) && unlocked.includes(l.id) && sidePathLit(l, progress.confusions, progress.contrastBaseline)

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
    // Raketdelar för områden som redan var klara (t.ex. efter uppdateringen): belönas här i stället
    // för aldrig. Lampan är sista delen: då är resan slut och finalen visas.
    const parts = progress.claimRocketParts()
    if (parts.length) {
      const zone = zones.find((z) => z.part === parts[parts.length - 1])
      if (zone?.part === 'lamp') {
        go('finale')
        return
      }
      if (zone) {
        setPartFound(zone.part)
        sfx.tada()
        burstConfetti()
        void audio.speak([phraseId('zone_part'), zoneDoneId(zone.id)])
        return
      }
    }
    const intro: string[] = []
    if (progress.sessions.length === 0 && !pendingUnlock) intro.push(phraseId('map_intro'))
    if (!progress.storyTold) {
      intro.push(phraseId('story_frame'))
      progress.tellStory()
    }
    if (chestAvailable && progress.sessions.length > 0) intro.push(phraseId('chest_here'))
    const newlyLit = levels.filter((l) => lit(l) && !announcedLit.has(l.id))
    if (newlyLit.length) {
      newlyLit.forEach((l) => announcedLit.add(l.id))
      intro.push(phraseId('side_lit'))
    }
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

  // Kort tryck = åk till planeten. Långtryck (0,55 s) = planetrutan med mål, krav och läge.
  const pressTimer = useRef<number | null>(null)
  const longPressed = useRef(false)

  const showInfo = (level: Level) => {
    sfx.pop()
    setInfo(level)
    const bonus = isBonus(level) ? [phraseId('level_bonus')] : []
    void audio.speak([levelNameId(level.id), ...(level.goal ? [levelGoalId(level.id)] : []), ...bonus])
  }

  const flyTo = async (level: Level) => {
    if (flying) return
    setInfo(null)
    sfx.whoosh()
    setFlying(level)
    // Första besöket: maskotens replik för berättelsen framåt (var delen kan finnas).
    const firstVisit = !progress.linesHeard.includes(level.id)
    const ok = await audio.speak([phraseId('lets_go_to'), levelNameId(level.id), ...(firstVisit ? [levelLineId(level.id)] : [])])
    if (firstVisit) progress.hearLine(level.id)
    if (ok) startSession(level.id)
  }

  const tapPlanet = (level: Level) => {
    if (flying || suppressTap.current) return
    if (!unlocked.includes(level.id)) {
      sfx.soft()
      void audio.speak(phraseId('level_locked'))
      return
    }
    void flyTo(level)
  }

  const pressStart = (level: Level) => {
    longPressed.current = false
    if (pressTimer.current) window.clearTimeout(pressTimer.current)
    pressTimer.current = window.setTimeout(() => {
      pressTimer.current = null
      if (suppressTap.current || flying) return
      longPressed.current = true
      showInfo(level)
    }, 550)
  }
  const pressEnd = (level: Level) => {
    if (pressTimer.current) {
      window.clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
    if (longPressed.current) {
      longPressed.current = false
      return
    }
    tapPlanet(level)
  }
  const pressCancel = () => {
    if (pressTimer.current) window.clearTimeout(pressTimer.current)
    pressTimer.current = null
  }

  /** Kistan varierar: oftast ett klistermärke, ibland en näve stjärnor, ibland båda. */
  const openChest = async () => {
    if (prize) return
    if (!chestAvailable) {
      sfx.soft()
      void audio.speak(phraseId('chest_tomorrow'))
      return
    }
    const roll = Math.random()
    const sticker = roll < 0.8 ? pick(stickers) : null
    const stars = roll >= 0.5 ? 3 + Math.floor(Math.random() * 4) : 3
    if (sticker) progress.addSticker(sticker)
    progress.addStars(stars)
    progress.openChest(today())
    setPrize(sticker && roll >= 0.5 ? `${sticker}⭐` : (sticker ?? '⭐'))
    sfx.tada()
    burstConfetti()
    await audio.speak(phraseId(!sticker ? 'chest_stars' : roll >= 0.5 ? 'chest_both' : 'chest_open'))
    setTimeout(() => setPrize(null), 1200)
  }

  const mascotAt = flying ?? current
  const byId = new Map(levels.map((l) => [l.id, l]))

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
          {/* Tre områden med egen färgton och namn; raketdelen tänds när området är klart. */}
          {BANDS.map((b) => {
            const z = zones.find((x) => x.id === b.id)!
            const earned = progress.rocketParts.includes(z.part)
            return (
              <div key={b.id} className="pointer-events-none absolute top-0 bottom-0" style={{ left: `${b.left}vw`, width: `${b.width}vw`, background: z.color, borderLeft: b.left > 0 ? '2px dashed rgba(255,255,255,0.12)' : undefined }}>
                <div className="absolute bottom-3 left-6 flex items-center gap-3 rounded-full bg-black/35 px-5 py-2 text-[22px] font-extrabold text-white/80">
                  <span className={`big-emoji text-[32px] ${earned ? '' : 'opacity-30 grayscale'}`}>{z.partEmoji}</span>
                  <span>{z.name}</span>
                </div>
              </div>
            )
          })}
          <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${MAP_WIDTH} 100`} preserveAspectRatio="none">
            <polyline points={levels.filter(isMain).map((l) => `${l.x},${l.y}`).join(' ')} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.4" strokeDasharray="1.2 1.2" />
            {levels.filter(isSidePath).map((l) => {
              const base = byId.get(l.requires[0])
              return base ? <line key={l.id} x1={base.x} y1={base.y} x2={l.x} y2={l.y} stroke={lit(l) ? 'rgba(255,204,51,0.6)' : 'rgba(255,255,255,0.2)'} strokeWidth="0.3" strokeDasharray="0.6 0.9" /> : null
            })}
          </svg>

          {levels.map((l) => {
            const isDone = completed.includes(l.id)
            // Bästa passbetyget (1–3) på planeten visas under den, i stället för en ensam stjärna vid klar.
            const best = progress.sessions.filter((s) => s.levelId === l.id).reduce((m, s) => Math.max(m, s.stars), 0)
            const isOpen = unlocked.includes(l.id)
            const isCurrent = l.id === current.id && !isDone
            const justUnlocked = pendingUnlock === l.id
            const side = isSidePath(l)
            const glowing = isCurrent || lit(l)
            // Hur långt planeten är på väg att bli klar: andel behärskat innehåll som en liten mätare.
            const lp = levelProgress(l, progress.mastery)
            const showBar = isOpen && !isDone && !isBonus(l) && !side && lp.total > 0
            return (
              <motion.button
                key={l.id}
                type="button"
                aria-label={l.name}
                onPointerDown={() => pressStart(l)}
                onPointerUp={() => pressEnd(l)}
                onPointerLeave={pressCancel}
                onPointerCancel={pressCancel}
                whileTap={{ scale: 0.9 }}
                initial={justUnlocked ? { scale: 0.4 } : false}
                animate={justUnlocked ? { scale: [0.4, 1.35, 1] } : glowing ? { y: [0, -8, 0] } : { scale: 1 }}
                transition={justUnlocked ? { duration: 1.2, delay: 0.4 } : { duration: 2, repeat: Infinity }}
                className={`absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center ${side ? 'h-24 w-24' : 'h-32 w-32'}`}
                style={{ left: `${l.x}vw`, top: `${l.y}%` }}
              >
                <span className={`big-emoji ${side ? 'text-[64px]' : 'text-[88px]'} ${isOpen ? '' : side ? 'opacity-30 grayscale' : 'opacity-40 grayscale'} ${glowing ? 'glow' : ''}`}>{l.emoji}</span>
                {!isOpen && !side && <span className="big-emoji absolute right-0 bottom-0 text-[40px]">🔒</span>}
                {justUnlocked && (
                  <motion.span initial={{ scale: 1, opacity: 1 }} animate={{ scale: 0, rotate: 180, opacity: 0 }} transition={{ duration: 0.8, delay: 0.3 }} className="big-emoji absolute right-0 bottom-0 text-[40px]">
                    🔒
                  </motion.span>
                )}
                {best > 0 && !side && <StarRating value={Math.min(3, best)} size={30} className="absolute -bottom-7 left-1/2 -translate-x-1/2" />}
                {showBar && (
                  <span className={`absolute left-1/2 h-3 w-24 -translate-x-1/2 overflow-hidden rounded-full bg-black/50 ring-2 ring-white/40 ${best > 0 ? '-bottom-12' : '-bottom-5'}`} role="progressbar" aria-valuenow={Math.round(lp.partial * 100)} aria-valuemax={100} aria-label={`${Math.round(lp.partial * 100)} procent klart`}>
                    <span className="block h-full rounded-full bg-sun transition-[width] duration-700" style={{ width: `${Math.round(lp.partial * 100)}%` }} />
                  </span>
                )}
                {isBonus(l) && isOpen && !isDone && <span className="big-emoji absolute -top-1 right-0 text-[36px]">🎈</span>}
                {side && isDone && !lit(l) && <span className="big-emoji absolute -right-1 -bottom-1 text-[28px]">✅</span>}
              </motion.button>
            )
          })}

          <motion.div
            className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
            initial={false}
            // Vilar snett ovanför planeten till vänster: under den ligger mätaren och stjärnorna, och
            // till höger hänger tvillingplaneterna.
            animate={{ left: `${mascotAt.x - (flying ? 0 : 8)}vw`, top: `${mascotAt.y - (flying ? 14 : 15)}%`, scale: flying ? 0.7 : 1 }}
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
        <div className="pointer-events-auto flex items-center gap-3"><FullscreenButton /><StarCounter value={progress.stars} /></div>
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
        <div className="pointer-events-auto flex items-center gap-3">
          <BigButton size="md" icon="🔤" color="bg-black/40" speakId={phraseId('btn_alphabet')} onPress={() => go('alphabet')} label="Bokstäverna" />
          <BigButton size="md" icon="🚀" color="bg-black/40" speakId={phraseId('btn_rocket')} onPress={() => go('rocket')} label="Raketen" />
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

      {partFound && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60" onPointerDown={() => setPartFound(null)} role="presentation">
          <motion.div initial={{ scale: 0.5 }} animate={{ scale: [0.5, 1.15, 1] }} transition={{ duration: 0.6 }} className="flex flex-col items-center gap-3 rounded-[40px] bg-white px-14 py-10 text-space shadow-2xl">
            <span className="big-emoji text-[140px]">{zones.find((z) => z.part === partFound)?.partEmoji}</span>
            <span className="text-[40px] font-extrabold">{zones.find((z) => z.part === partFound)?.partName}</span>
          </motion.div>
        </div>
      )}

      {info && (
        <PlanetInfo
          level={info}
          locked={!unlocked.includes(info.id)}
          onPlay={() => void flyTo(info)}
          onClose={() => {
            setInfo(null)
            audio.stop()
          }}
        />
      )}
      {gate && <ParentGate onClose={() => setGate(false)} onSuccess={() => go('parent')} />}
    </div>
  )
}
