import { rhymes, sentences, sightwords, stories, templates, words, type Level } from '../content'
import { contrastWords } from './kindBuilders'
import { masteryKey, STREAK_NEEDED } from './mastery'
import { templateKey } from './templates'
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
const ITEM_KIND: Record<Level['kind'], ItemKind> = { letters: 'letter', sightwords: 'sightword', cluster: 'word', words: 'word', contrast: 'contrast', sentences: 'sentence', stories: 'story', phonology: 'phoneme', templates: 'sentence' }

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
  templates: 0.5,
}

/** Tvillingplaneterna ligger vid sidan av huvudkedjan och öppnar bara när paret faktiskt förväxlas. */
export const isSidePath = (l: Level) => l.kind === 'contrast'
/** Startrampen: alltid öppen, inget krav. */
export const isBonus = (l: Level) => l.requires.length === 0 && l.kind === 'phonology'
/** Huvudkedjan: planeterna som ger raketdelar och som kartans lysande planet väljs bland. */
export const isMain = (l: Level) => !isSidePath(l) && !isBonus(l)

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
    case 'templates':
      return templates.templates.map((t) => masteryKey('sentence', templateKey(t.id)))
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

/** Så långt måste föregående planet ha kommit för att nästa ska öppna: halvvägs räcker. */
export const UNLOCK_AT = 0.5

/** Så många förväxlingar av ett par (m läst som n eller tvärtom) som tänder parets tvillingplanet. */
export const CONTRAST_TRIGGER = 3

/** Antal gånger paret blandats ihop, båda hållen. Nyckeln i loggen är "rätt>valt". */
export function pairConfusions(pair: string[], confusions: Record<string, number>): number {
  const [a, b] = pair
  return (confusions[`${a}>${b}`] ?? 0) + (confusions[`${b}>${a}`] ?? 0)
}

/**
 * En nivå är upplåst när varje nivå den kräver antingen är klar eller kommit halvvägs. Då finns
 * oftast två planeter att välja på, och ett pass behöver inte bli åtta uppgifter av samma sort.
 * Tvillingplaneterna kräver dessutom att paret förväxlats: diskriminationsträning är bortkastad
 * tid om förväxlingen inte finns. En gång öppnad förblir den öppen (förväxlingarna räknas aldrig ner).
 */
export function unlockedLevels(levels: Level[], completed: string[], mastery: Record<string, MasteryItem> = {}, confusions: Record<string, number> = {}): string[] {
  const byId = new Map(levels.map((l) => [l.id, l]))
  const open = (id: string) => {
    if (completed.includes(id)) return true
    const lvl = byId.get(id)
    return !!lvl && levelProgress(lvl, mastery).partial >= UNLOCK_AT
  }
  return levels
    .filter((l) => l.requires.every(open))
    .filter((l) => !isSidePath(l) || completed.includes(l.id) || pairConfusions(l.letters, confusions) >= CONTRAST_TRIGGER)
    .map((l) => l.id)
}

/**
 * Lyser tvillingplaneten? Ja när paret förväxlats CONTRAST_TRIGGER gånger sedan planeten senast
 * spelades (baseline = loggens värde när passet slutade). Nya förväxlingar tänder den igen.
 */
export function sidePathLit(level: Level, confusions: Record<string, number>, baseline: Record<string, number>): boolean {
  return pairConfusions(level.letters, confusions) - (baseline[level.id] ?? 0) >= CONTRAST_TRIGGER
}

/** Ett område är klart när alla dess planeter i huvudkedjan är klara. */
export function zoneComplete(zone: number, levels: Level[], completed: string[]): boolean {
  const main = levels.filter((l) => isMain(l) && l.zone === zone)
  return main.length > 0 && main.every((l) => completed.includes(l.id))
}

export function completedZones(levels: Level[], completed: string[]): number[] {
  return [...new Set(levels.map((l) => l.zone))].filter((z) => zoneComplete(z, levels, completed))
}

export function diff(before: string[], after: string[]): string[] {
  return after.filter((id) => !before.includes(id))
}
