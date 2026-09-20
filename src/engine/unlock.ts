import { rhymes, sentences, sightwords, stories, words, type Level } from '../content'
import { contrastWords } from './kindBuilders'
import { masteryKey, STREAK_NEEDED } from './mastery'
import type { ItemKind, MasteryItem } from './types'

export interface LevelProgress {
  total: number
  mastered: number
  ratio: number
  /** Finkornig andel 0–1: varje rätt svar på väg mot behärskning räknas (för mätaren på kartan). */
  partial: number
  complete: boolean
}

/** Vilket slag av mastery-post nivåns innehåll är. */
const ITEM_KIND: Record<Level['kind'], ItemKind> = { letters: 'letter', sightwords: 'sightword', cluster: 'word', words: 'word', contrast: 'contrast', sentences: 'sentence', stories: 'story', phonology: 'phoneme' }

/** Andel av nivåns innehåll som ska behärskas för att nivån ska räknas som klar. */
export const COMPLETE_SHARE: Record<Level['kind'], number> = {
  letters: 0.8,
  sightwords: 0.75,
  cluster: 0.35,
  words: 0.6,
  contrast: 0.4,
  sentences: 0.5,
  stories: 0.5,
  phonology: 0.4,
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
    case 'words':
      return (level.words ?? []).map((id) => masteryKey('word', id))
    case 'contrast':
      return contrastWords(level, words).map((w) => masteryKey('contrast', w.id))
    case 'sentences':
      return (level.sentences ? sentences.filter((s) => level.sentences!.includes(s.id)) : sentences).map((s) => masteryKey('sentence', s.id))
    case 'stories':
      return stories.map((s) => masteryKey('story', s.id))
    case 'phonology':
      return (level.words ?? Array.from(new Set(rhymes.flat()))).map((id) => masteryKey('phoneme', id))
  }
}

export function levelProgress(level: Level, mastery: Record<string, MasteryItem>): LevelProgress {
  const items = levelItems(level)
  const total = items.length
  const mastered = items.filter((key) => mastery[key]?.mastered).length
  const ratio = total === 0 ? 0 : mastered / total
  const need = STREAK_NEEDED[ITEM_KIND[level.kind]]
  const needed = Math.ceil(COMPLETE_SHARE[level.kind] * total)
  // Bara de `needed` ord som kommit längst räknas. Att summera delpoäng från ALLA gav full mätare
  // medan noll var behärskade: barnet såg 100 % pass efter pass utan att planeten öppnade nästa.
  const credits = items
    .map((key) => {
      const m = mastery[key]
      return !m ? 0 : m.mastered ? 1 : Math.min(m.streak, need) / need
    })
    .sort((a, b) => b - a)
    .slice(0, needed)
  const partial = total === 0 ? 0 : Math.min(1, credits.reduce((a, b) => a + b, 0) / needed)
  const complete = total > 0 && mastered >= needed
  return { total, mastered, ratio, partial, complete }
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
