import type { GameId } from '../content'
import { shuffle, type Rng } from './random'
import type { Difficulty } from './sessionBuilder'
import type { Task } from './types'

/** Spel där alternativen är hela svar som kan bli fler eller färre. Brickor, vagnar, memory och sagofrågor rörs inte. */
const TRIMMABLE: GameId[] = ['catch-sound', 'read-word', 'which-word', 'sound-train', 'rhyme-hunt', 'first-sound', 'last-sound', 'silly-sentences', 'sound-sort']

/** Så många alternativ som visas som grund: tre på lätt, fyra annars. Fånga ljudet har alltid fyra farkoster. */
function baseCount(game: GameId, difficulty: Difficulty): number {
  if (game === 'catch-sound') return difficulty === 'hard' ? 5 : 4
  return difficulty === 'easy' ? 3 : 4
}

/**
 * Antal alternativ just nu: grunden för nivån, ett till efter tre rätt i rad (utmaningen ska växa med
 * barnet, inte bara hjälpen efter fel), ett färre när de två senaste uppgifterna krävde flera försök.
 */
export function optionCount(game: GameId, difficulty: Difficulty, streak: number, struggling: boolean): number {
  const n = baseCount(game, difficulty) + (streak >= 3 ? 1 : 0) - (struggling ? 1 : 0)
  return Math.max(2, Math.min(5, n))
}

/**
 * Uppgiften som den visas: rätt svar plus de n−1 svåraste distraktorerna, blandade. Byggarna lägger
 * rätt svar först och distraktorerna svårast först, så här måste ALLT som ritas passera.
 */
export function shownTask(task: Task, n: number, rng: Rng = Math.random): Task {
  if (!TRIMMABLE.includes(task.game)) return task
  // Ljudsortering med två bokstäver (m eller n) har inget att trimma; bara den omvända (bilder) har.
  if (task.game === 'sound-sort' && task.letter === undefined) return task
  if (task.options.length === 0) return task
  const answer = task.answer ?? task.targetId
  const distractors = task.options.filter((o) => o !== answer)
  const keep = Math.max(1, Math.min(n - 1, distractors.length))
  return { ...task, options: shuffle([answer, ...distractors.slice(0, keep)], rng) }
}
