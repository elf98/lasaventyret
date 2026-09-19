import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { levels } from '../content'
import { applyResult, masteryKey, newItem } from '../engine/mastery'
import type { MasteryItem, SessionRecord, TaskResult } from '../engine/types'
import { completedLevels, unlockedLevels } from '../engine/unlock'

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
  /** Förväxlade bokstavspar, nyckel "rätt>valt" (m>n). Visar vuxna vilka par som behöver övas. */
  confusions: Record<string, number>
  /** Hur många gånger varje spel mötts: full instruktion bara de första gångerna. */
  gamesSeen: Record<string, number>
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
  importData: (data: ProgressData) => void
  exportData: () => ProgressData
  reset: () => void
}

export type ProgressStore = ProgressData & ProgressActions

const initial: ProgressData = {
  version: 2,
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
}

const dataKeys = Object.keys(initial) as (keyof ProgressData)[]

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
      importData: (data) => {
        const clean: Partial<ProgressData> = {}
        for (const k of dataKeys) if (k in data) (clean as Record<string, unknown>)[k] = data[k]
        set({ ...initial, ...rescaleStars(clean as ProgressData) })
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
      version: 2,
      migrate: (state, from) => ({ ...(from < 2 ? rescaleStars(state as ProgressData) : (state as ProgressData)) }),
    },
  ),
)

/** Klara nivåer = sparade + de som uppfyller behärskning just nu. */
export function selectCompleted(s: ProgressData): string[] {
  return Array.from(new Set([...s.completed, ...completedLevels(levels, s.mastery)]))
}

export function selectUnlocked(s: ProgressData): string[] {
  return unlockedLevels(levels, selectCompleted(s))
}
