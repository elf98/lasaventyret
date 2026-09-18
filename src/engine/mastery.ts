import type { ItemKind, MasteryItem } from './types'

const DAY = 86_400_000

/**
 * Nyckel i mastery-tabellen. Bokstäver lagras som sitt id ("s"), andra
 * slag får prefix ("w:sol") så att ordet "ö" inte krockar med bokstaven ö.
 */
const PREFIX: Record<ItemKind, string> = { letter: '', word: 'w:', sightword: 'sw:', sentence: 'se:', story: 'st:', contrast: 'c:', phoneme: 'ph:' }

export function masteryKey(kind: ItemKind, id: string): string {
  return PREFIX[kind] + id
}
/** Repetitionsintervall i dagar per steg i raden av rätt svar. */
const INTERVALS = [0, 1, 3, 7, 14, 30]
const MAX_INTERVAL = 30

export function newItem(id: string, kind: ItemKind, now: number): MasteryItem {
  return {
    id,
    kind,
    streak: 0,
    sessionsCorrect: [],
    attempts: 0,
    errors: 0,
    lastSeenAt: 0,
    dueAt: now,
    intervalDays: 0,
    mastered: false,
  }
}

/** Rätt i rad som krävs per slag. Bokstäver och ljudade ord tre; ordbilder, meningar och berättelser två. */
export const STREAK_NEEDED: Record<ItemKind, number> = { letter: 3, word: 3, sightword: 2, sentence: 2, story: 2, contrast: 2, phoneme: 2 }

/**
 * Behärskat = tillräckligt många rätt i rad (STREAK_NEEDED), och de rätta svaren är spridda
 * över minst två olika pass. Ett fel nollställer raden.
 */
export function meetsMastery(item: MasteryItem): boolean {
  return item.streak >= STREAK_NEEDED[item.kind] && new Set(item.sessionsCorrect).size >= 2
}

export function applyResult(item: MasteryItem, clean: boolean, sessionId: string, now: number): MasteryItem {
  const next: MasteryItem = { ...item, attempts: item.attempts + 1, lastSeenAt: now }
  if (clean) {
    next.streak = item.streak + 1
    next.sessionsCorrect = [...item.sessionsCorrect, sessionId].slice(-6)
    next.mastered = item.mastered || meetsMastery(next)
    if (next.mastered) {
      next.intervalDays = Math.min(MAX_INTERVAL, Math.max(3, item.intervalDays * 2))
    } else {
      next.intervalDays = INTERVALS[Math.min(next.streak, INTERVALS.length - 1)]
    }
  } else {
    // Ett fel backar ETT steg, inte till noll: ett slarvfel ska inte radera flera dagars arbete.
    // Behärskning tappas först när raden är helt borta (tre fel i rad på en bokstav).
    next.streak = Math.max(0, item.streak - 1)
    next.sessionsCorrect = item.sessionsCorrect.slice(0, -1)
    next.errors = item.errors + 1
    next.mastered = item.mastered && next.streak > 0
    next.intervalDays = 0
  }
  next.dueAt = now + next.intervalDays * DAY
  return next
}

export function isDue(item: MasteryItem, now: number): boolean {
  return item.dueAt <= now
}

/** Högre = svagare. Används för att prioritera repetition och urval. */
export function weakness(item: MasteryItem | undefined): number {
  if (!item || item.attempts === 0) return 3
  const errorRate = item.errors / item.attempts
  let w = 1 + errorRate * 4
  if (item.streak === 0) w += 1.5
  if (!item.mastered) w += 1
  return w
}
