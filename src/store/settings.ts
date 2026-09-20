import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { config } from '../content'

export type LetterCase = 'auto' | 'upper' | 'lower' | 'mixed'

interface SettingsState {
  volume: number
  sessionMinutes: number
  tasksPerSession: number
  /** Testläge: alla planeter öppna oavsett behärskning. */
  unlockAll: boolean
  /** Svårighetsgrad: styr ordandel, stavelser och spelval. */
  difficulty: 'easy' | 'normal' | 'hard'
  /**
   * Skrivstil på ord barnet läser. 'auto' följer resan: VERSALER först, blandat när Ordfabriken är
   * klar, gemener när Rymdstationen är klar. Nästan all text utanför appen är gemener, och en
   * inställning som måste kommas ihåg glöms.
   */
  letterCase: LetterCase
  setVolume: (v: number) => void
  setSessionMinutes: (m: number) => void
  setTasksPerSession: (n: number) => void
  setUnlockAll: (v: boolean) => void
  setDifficulty: (d: 'easy' | 'normal' | 'hard') => void
  setLetterCase: (c: LetterCase) => void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      volume: 1,
      sessionMinutes: config.sessionMinutes,
      tasksPerSession: config.tasksPerSession,
      unlockAll: false,
      difficulty: 'normal',
      letterCase: 'auto',
      setVolume: (volume) => set({ volume }),
      setSessionMinutes: (sessionMinutes) => set({ sessionMinutes }),
      setTasksPerSession: (tasksPerSession) => set({ tasksPerSession }),
      setUnlockAll: (unlockAll) => set({ unlockAll }),
      setDifficulty: (difficulty) => set({ difficulty }),
      setLetterCase: (letterCase) => set({ letterCase }),
    }),
    {
      name: 'lasaventyret-settings-v1',
      version: 1,
      // 'upper' var standard och aldrig ett aktivt val: de sparfilerna får det automatiska läget.
      migrate: (state, from) => {
        const s = state as Partial<SettingsState>
        return from < 1 && (s.letterCase === 'upper' || !s.letterCase) ? { ...s, letterCase: 'auto' } : s
      },
    },
  ),
)
