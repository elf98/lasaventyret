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
  setVolume: (v: number) => void
  setSessionMinutes: (m: number) => void
  setTasksPerSession: (n: number) => void
  setUnlockAll: (v: boolean) => void
  setDifficulty: (d: 'easy' | 'normal' | 'hard') => void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      volume: 1,
      sessionMinutes: config.sessionMinutes,
      tasksPerSession: config.tasksPerSession,
      unlockAll: false,
      difficulty: 'normal',
      setVolume: (volume) => set({ volume }),
      setSessionMinutes: (sessionMinutes) => set({ sessionMinutes }),
      setTasksPerSession: (tasksPerSession) => set({ tasksPerSession }),
      setUnlockAll: (unlockAll) => set({ unlockAll }),
      setDifficulty: (difficulty) => set({ difficulty }),
    }),
    { name: 'lasaventyret-settings-v1' },
  ),
)
