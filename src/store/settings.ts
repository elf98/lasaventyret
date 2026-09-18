import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { config } from '../content'

interface SettingsState {
  volume: number
  sessionMinutes: number
  tasksPerSession: number
  /** Testläge: alla planeter öppna oavsett behärskning. */
  unlockAll: boolean
  /** Svårighetsgrad: styr ordandel, stavelser och spelval. */
  difficulty: 'easy' | 'normal' | 'hard'
  /** Skrivstil på ord barnet läser: VERSALER, gemener eller blandat. */
  letterCase: 'upper' | 'lower' | 'mixed'
  setVolume: (v: number) => void
  setSessionMinutes: (m: number) => void
  setTasksPerSession: (n: number) => void
  setUnlockAll: (v: boolean) => void
  setDifficulty: (d: 'easy' | 'normal' | 'hard') => void
  setLetterCase: (c: 'upper' | 'lower' | 'mixed') => void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      volume: 1,
      sessionMinutes: config.sessionMinutes,
      tasksPerSession: config.tasksPerSession,
      unlockAll: false,
      difficulty: 'normal',
      letterCase: 'upper',
      setVolume: (volume) => set({ volume }),
      setSessionMinutes: (sessionMinutes) => set({ sessionMinutes }),
      setTasksPerSession: (tasksPerSession) => set({ tasksPerSession }),
      setUnlockAll: (unlockAll) => set({ unlockAll }),
      setDifficulty: (difficulty) => set({ difficulty }),
      setLetterCase: (letterCase) => set({ letterCase }),
    }),
    { name: 'lasaventyret-settings-v1' },
  ),
)
