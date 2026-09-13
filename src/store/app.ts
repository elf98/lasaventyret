import { create } from 'zustand'

export type Screen = 'boot' | 'onboarding' | 'map' | 'session' | 'reward' | 'parent' | 'pause' | 'stickers'

export interface SessionSummary {
  levelId: string
  stars: number
  correct: number
  tasks: number
  sticker: string | null
  newlyCompleted: string[]
  newlyUnlocked: string[]
  newOutfit: string | null
}

interface AppState {
  screen: Screen
  levelId: string | null
  summary: SessionSummary | null
  /** När appen öppnades eller senaste paus avslutades. */
  playStartedAt: number
  /** Planet som ska få upplåsningsanimation nästa gång kartan visas. */
  pendingUnlock: string | null
  go: (screen: Screen) => void
  startSession: (levelId: string) => void
  finishSession: (summary: SessionSummary) => void
  resetPlayTimer: () => void
  clearPendingUnlock: () => void
}

export const useApp = create<AppState>()((set) => ({
  screen: 'boot',
  levelId: null,
  summary: null,
  playStartedAt: Date.now(),
  pendingUnlock: null,
  go: (screen) => set({ screen }),
  startSession: (levelId) => set({ levelId, screen: 'session' }),
  finishSession: (summary) =>
    set({ summary, screen: 'reward', pendingUnlock: summary.newlyUnlocked[0] ?? null }),
  resetPlayTimer: () => set({ playStartedAt: Date.now() }),
  clearPendingUnlock: () => set({ pendingUnlock: null }),
}))
