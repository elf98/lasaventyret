import type { GameId, Word } from '../content'
import { shuffle, type Rng } from './random'
import type { Task } from './types'

/** Svarsalternativ per ordspel. */
export function wordOptions(game: GameId, w: Word, allWords: Word[], knownWords: Word[], letterPool: string[], rng: Rng): string[] {
  if (game === 'build-word') {
    const extra = shuffle(letterPool.filter((id) => !w.sounds.includes(id)), rng).slice(0, w.sounds.length <= 3 ? 2 : 1)
    return shuffle([...w.sounds, ...extra], rng)
  }
  if (game === 'which-word') {
    // Alternativen ska likna målordet, annars räcker det att läsa första bokstaven för att gissa rätt:
    // samma längd och samma första/sista bokstav väger tyngst (mus/mun/mor). Aldrig samma text två gånger.
    const score = (o: Word) =>
      (o.text.length === w.text.length ? 3 : 0) + (o.text[0] === w.text[0] ? 3 : 0) + (o.text[o.text.length - 1] === w.text[w.text.length - 1] ? 2 : 0) + (o.sounds.length === w.sounds.length ? 1 : 0)
    const picks = shuffle(knownWords.filter((o) => o.id !== w.id && o.text !== w.text), rng)
      .sort((a, b) => score(b) - score(a))
      .filter((o, i, arr) => arr.findIndex((x) => x.text === o.text) === i)
      .slice(0, 2)
    return shuffle([w.id, ...picks.map((o) => o.id)], rng)
  }
  if (game === 'read-word') {
    // Bilder som alternativ. En distraktor ska likna målordet i skrift (samma början eller längd),
    // annars går uppgiften att lösa på första bokstaven.
    const cands = allWords.filter((o) => o.emoji !== '' && o.id !== w.id && o.emoji !== w.emoji)
    const near = shuffle(cands.filter((o) => o.text[0] === w.text[0] || o.text.length === w.text.length), rng)
    const far = shuffle(cands.filter((o) => !near.includes(o)), rng)
    const picks: Word[] = []
    for (const o of [...near, ...far]) {
      if (picks.length >= 2) break
      if (!picks.some((p) => p.emoji === o.emoji)) picks.push(o)
    }
    return shuffle([w.id, ...picks.map((o) => o.id)], rng)
  }
  // sound-train: bildval efter ljudningen (tomt för stavelser utan bild)
  if (w.emoji === '') return []
  const others = shuffle(allWords.filter((o) => o.emoji !== '' && o.id !== w.id && o.emoji !== w.emoji), rng)
  const distinct: Word[] = []
  for (const o of others) if (!distinct.some((d) => d.emoji === o.emoji) && distinct.length < 2) distinct.push(o)
  return shuffle([w.id, ...distinct.map((d) => d.id)], rng)
}

/** Sprider ut b jämnt bland a. */
export function interleave(a: Task[], b: Task[]): Task[] {
  const out: Task[] = []
  const total = a.length + b.length
  let ai = 0
  let bi = 0
  for (let i = 0; i < total; i++) {
    const wantB = bi < b.length && (ai >= a.length || (bi + 1) / (i + 1) <= b.length / total)
    out.push(wantB ? b[bi++] : a[ai++])
  }
  return out
}

/** Blandar och försöker undvika samma id två gånger i rad. */
export function spreadOut<T extends { id: string }>(items: T[], rng: Rng): T[] {
  let best = shuffle(items, rng)
  let bestClashes = clashes(best)
  for (let attempt = 0; attempt < 20 && bestClashes > 0; attempt++) {
    const cand = shuffle(items, rng)
    const c = clashes(cand)
    if (c < bestClashes) {
      best = cand
      bestClashes = c
    }
  }
  return best
}

function clashes(items: { id: string }[]): number {
  let n = 0
  for (let i = 1; i < items.length; i++) if (items[i].id === items[i - 1].id) n++
  return n
}
