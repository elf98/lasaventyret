import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { levels, stickers as allStickers, zones } from '../content'
import { applyResult, masteryKey, newItem } from '../engine/mastery'
import type { MasteryItem, SessionRecord, TaskResult } from '../engine/types'
import { completedLevels, completedZones, isSidePath, pairConfusions, unlockedLevels } from '../engine/unlock'

export interface StickerPlacement {
  /** Index i stickers-listan. */
  index: number
  /** Läge på raketen i procent av raketytan. */
  x: number
  y: number
}

export interface ProgressData {
  version: number
  onboarded: boolean
  mascotType: string | null
  mascotNameKey: string | null
  mascotName: string
  stars: number
  stickers: string[]
  outfits: string[]
  lastChestDate: string | null
  mastery: Record<string, MasteryItem>
  sessions: SessionRecord[]
  /** Nivåer som markerats klara (sparas så att en nivå aldrig låser sig igen). */
  completed: string[]
  /** Förväxlade bokstavspar, nyckel "rätt>valt" (m>n). Visar vuxna vilka par som behöver övas och tänder tvillingplaneterna. */
  confusions: Record<string, number>
  /** Hur många gånger varje spel mötts: full instruktion bara de första gångerna. */
  gamesSeen: Record<string, number>
  /** Parets förväxlingar när tvillingplaneten senast spelades: nya förväxlingar utöver detta tänder den igen. */
  contrastBaseline: Record<string, number>
  /** Raketdelar som hittats (en per klart område). */
  rocketParts: string[]
  /** Klistermärken som satts på raketen. */
  rocketStickers: StickerPlacement[]
  /** Planeter vars berättelsereplik redan hörts. */
  linesHeard: string[]
  /** Ramberättelsen har berättats. */
  storyTold: boolean
}

interface ProgressActions {
  setMascot: (type: string, nameKey: string, nameText: string) => void
  recordResult: (r: TaskResult, sessionId: string, now?: number) => void
  recordConfusion: (correct: string, picked: string) => void
  seeGame: (game: string) => void
  addStars: (n: number) => void
  addSticker: (emoji: string) => void
  addOutfit: (id: string) => void
  addSession: (rec: SessionRecord) => void
  markCompleted: (ids: string[]) => void
  unmarkCompleted: (id: string) => void
  openChest: (date: string) => void
  /** Sätter tvillingplanetens baslinje till dagens förväxlingar: den slocknar tills paret förväxlas igen. */
  settleContrast: (levelId: string) => void
  /** Ger raketdelar för områden som är klara men inte belönade. Returnerar de nya delarna. */
  claimRocketParts: () => string[]
  placeSticker: (p: StickerPlacement) => void
  removeStickerPlacement: (index: number) => void
  hearLine: (levelId: string) => void
  tellStory: () => void
  importData: (data: ProgressData) => void
  exportData: () => ProgressData
  reset: () => void
}

export type ProgressStore = ProgressData & ProgressActions

const initial: ProgressData = {
  version: 4,
  onboarded: false,
  mascotType: null,
  mascotNameKey: null,
  mascotName: '',
  stars: 0,
  stickers: [],
  outfits: [],
  lastChestDate: null,
  mastery: {},
  sessions: [],
  completed: [],
  confusions: {},
  gamesSeen: {},
  contrastBaseline: {},
  rocketParts: [],
  rocketStickers: [],
  linesHeard: [],
  storyTold: false,
}

const dataKeys = Object.keys(initial) as (keyof ProgressData)[]

/** Klistermärken som tagits bort ur innehållet (t.ex. emoji utan glyf på iPaden) blir tomma rutor i boken. */
function dropMissingStickers(data: ProgressData): ProgressData {
  const known = new Set(allStickers)
  const kept = (data.stickers ?? []).filter((s) => known.has(s))
  if (kept.length === (data.stickers ?? []).length) return data
  // Placeringarna pekar på index i listan: när något försvinner räknas de om, och de som pekar på borttagna tas bort.
  const oldIndex = (data.stickers ?? []).map((s, i) => (known.has(s) ? i : -1)).filter((i) => i >= 0)
  const placements = (data.rocketStickers ?? []).map((p) => ({ ...p, index: oldIndex.indexOf(p.index) })).filter((p) => p.index >= 0)
  return { ...data, stickers: kept, rocketStickers: placements }
}

/** Version 1 gav 1–2 stjärnor per uppgift (12–16 per pass); version 2 ger 1–3 per pass. Skala ner gamla totaler. */
function rescaleStars(data: ProgressData): ProgressData {
  if ((data.version ?? 1) >= 2) return data
  return {
    ...data,
    version: 2,
    stars: Math.round((data.stars ?? 0) / 5),
    sessions: (data.sessions ?? []).map((s) => ({ ...s, stars: Math.min(3, Math.max(1, Math.round(s.stars / 5))) })),
  }
}

/**
 * Version 4: tvillingplaneterna blev sidovägar som tänds av förväxlingar. En planet som redan spelats
 * får dagens förväxlingar som baslinje, annars hade den lyst direkt trots att barnet just övat den.
 * Områden som redan är klara får sina raketdelar vid första kartvisningen (claimRocketParts).
 */
function upgradeV4(data: ProgressData): ProgressData {
  if ((data.version ?? 1) >= 4) return data
  const played = new Set((data.sessions ?? []).map((s) => s.levelId))
  const baseline: Record<string, number> = { ...(data.contrastBaseline ?? {}) }
  for (const l of levels.filter(isSidePath)) if (played.has(l.id) && baseline[l.id] === undefined) baseline[l.id] = pairConfusions(l.letters, data.confusions ?? {})
  const heard = new Set([...(data.linesHeard ?? []), ...played])
  return { ...data, version: 4, contrastBaseline: baseline, rocketParts: data.rocketParts ?? [], rocketStickers: data.rocketStickers ?? [], linesHeard: [...heard], storyTold: data.storyTold ?? false }
}

const upgrade = (data: ProgressData) => upgradeV4(dropMissingStickers(rescaleStars(data)))

export const useProgress = create<ProgressStore>()(
  persist(
    (set, get) => ({
      ...initial,
      setMascot: (type, nameKey, nameText) =>
        set({ mascotType: type, mascotNameKey: nameKey, mascotName: nameText, onboarded: true }),
      recordResult: (r, sessionId, now = Date.now()) =>
        set((s) => {
          const key = masteryKey(r.kind, r.targetId)
          const cur = s.mastery[key] ?? newItem(r.targetId, r.kind, now)
          return { mastery: { ...s.mastery, [key]: applyResult(cur, r.clean, sessionId, now) } }
        }),
      recordConfusion: (correct, picked) =>
        set((s) => ({ confusions: { ...s.confusions, [`${correct}>${picked}`]: (s.confusions[`${correct}>${picked}`] ?? 0) + 1 } })),
      seeGame: (game) => set((s) => ({ gamesSeen: { ...s.gamesSeen, [game]: (s.gamesSeen[game] ?? 0) + 1 } })),
      addStars: (n) => set((s) => ({ stars: s.stars + n })),
      addSticker: (emoji) => set((s) => ({ stickers: [...s.stickers, emoji] })),
      addOutfit: (id) => set((s) => (s.outfits.includes(id) ? {} : { outfits: [...s.outfits, id] })),
      addSession: (rec) => set((s) => ({ sessions: [...s.sessions, rec].slice(-200) })),
      markCompleted: (ids) =>
        set((s) => ({ completed: Array.from(new Set([...s.completed, ...ids])) })),
      unmarkCompleted: (id) => set((s) => ({ completed: s.completed.filter((x) => x !== id) })),
      openChest: (date) => set({ lastChestDate: date }),
      settleContrast: (levelId) =>
        set((s) => {
          const l = levels.find((x) => x.id === levelId)
          if (!l || !isSidePath(l)) return {}
          return { contrastBaseline: { ...s.contrastBaseline, [levelId]: pairConfusions(l.letters, s.confusions) } }
        }),
      claimRocketParts: () => {
        const s = get()
        const done = completedZones(levels, selectCompleted(s))
        const parts = zones.filter((z) => done.includes(z.id) && !s.rocketParts.includes(z.part)).map((z) => z.part)
        if (parts.length) set({ rocketParts: [...s.rocketParts, ...parts] })
        return parts
      },
      placeSticker: (p) => set((s) => ({ rocketStickers: [...s.rocketStickers.filter((x) => x.index !== p.index), p] })),
      removeStickerPlacement: (index) => set((s) => ({ rocketStickers: s.rocketStickers.filter((x) => x.index !== index) })),
      hearLine: (levelId) => set((s) => (s.linesHeard.includes(levelId) ? {} : { linesHeard: [...s.linesHeard, levelId] })),
      tellStory: () => set({ storyTold: true }),
      importData: (data) => {
        const clean: Partial<ProgressData> = {}
        for (const k of dataKeys) if (k in data) (clean as Record<string, unknown>)[k] = data[k]
        set({ ...initial, ...upgrade(clean as ProgressData) })
      },
      exportData: () => {
        const s = get()
        const out = {} as ProgressData
        for (const k of dataKeys) (out as unknown as Record<string, unknown>)[k] = s[k]
        return out
      },
      reset: () => set({ ...initial }),
    }),
    {
      name: 'lasaventyret-progress-v1',
      partialize: (s) => Object.fromEntries(dataKeys.map((k) => [k, s[k]])),
      version: 4,
      migrate: (state, from) => ({ ...initial, ...upgrade({ ...(state as ProgressData), version: Math.max(1, from) }) }),
    },
  ),
)

/** Klara nivåer = sparade + de som uppfyller behärskning just nu. */
export function selectCompleted(s: ProgressData): string[] {
  return Array.from(new Set([...s.completed, ...completedLevels(levels, s.mastery)]))
}

export function selectUnlocked(s: ProgressData): string[] {
  return unlockedLevels(levels, selectCompleted(s), s.mastery)
}
