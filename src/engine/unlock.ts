import { rhymes, sentences, sightwords, stories, words, type Level } from '../content'
import { masteryKey } from './mastery'
import type { MasteryItem } from './types'

export interface LevelProgress {
  total: number
  mastered: number
  ratio: number
  complete: boolean
}

/** Andel av nivåns innehåll som ska behärskas för att nivån ska räknas som klar. */
const COMPLETE_SHARE: Record<Level['kind'], number> = {
  letters: 0.8,
  sightwords: 0.8,
  cluster: 0.5,
  sentences: 0.5,
  stories: 0.6,
  phonology: 0.5,
}

/** Mastery-nycklar för det som tränas på nivån. */
export function levelItems(level: Level): string[] {
  switch (level.kind) {
    case 'letters':
      return level.letters
    case 'sightwords':
      return sightwords.map((w) => masteryKey('sightword', w.id))
    case 'cluster':
      return words.filter((w) => !w.decodable && !w.noBlend).map((w) => masteryKey('word', w.id))
    case 'sentences':
      return sentences.map((s) => masteryKey('sentence', s.id))
    case 'stories':
      return stories.map((s) => masteryKey('story', s.id))
    case 'phonology':
      return Array.from(new Set(rhymes.flat())).map((id) => masteryKey('word', id))
  }
}

export function levelProgress(level: Level, mastery: Record<string, MasteryItem>): LevelProgress {
  const items = levelItems(level)
  const total = items.length
  const mastered = items.filter((key) => mastery[key]?.mastered).length
  const ratio = total === 0 ? 0 : mastered / total
  const complete = total > 0 && mastered >= Math.ceil(COMPLETE_SHARE[level.kind] * total)
  return { total, mastered, ratio, complete }
}

/** Nivåer som är klara nu (behärskning), oberoende av vad som sparats tidigare. */
export function completedLevels(levels: Level[], mastery: Record<string, MasteryItem>): string[] {
  return levels.filter((l) => levelProgress(l, mastery).complete).map((l) => l.id)
}

/** En nivå är upplåst när alla nivåer den kräver är klara. */
export function unlockedLevels(levels: Level[], completed: string[]): string[] {
  return levels.filter((l) => l.requires.every((r) => completed.includes(r))).map((l) => l.id)
}

export function diff(before: string[], after: string[]): string[] {
  return after.filter((id) => !before.includes(id))
}
