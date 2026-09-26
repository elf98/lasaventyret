import { letterById, levels, type GameId, type Sentence, type Word } from '../content'
import { shuffle, type Rng } from './random'
import type { Task } from './types'

/** Hur många distraktorer en uppgift bär med sig. Skärmen visar 2–4 av dem beroende på nivå och rad. */
export const DISTRACTOR_POOL = 4

/**
 * Hur lätt ordet är att ljuda ihop. Hållbara ljud (s, m, l, vokaler) går att dra ut i ett andetag så att
 * ordet stiger fram ("sssooolll"); stoppljud (p, t, k, b, d, g) kan inte dras ut och får lätt en vokal
 * på köpet som bryter sammansmältningen. Lägre = lättare: alla ljud hållbara och få ljud först,
 * hållbart första ljud sedan, stoppljud i början sist. Används för Ordgåtan, Ljudbandet och ordvalet.
 */
export function blendTier(w: Word): number {
  const cont = (s: string) => letterById.get(s)?.continuous !== false
  const all = w.sounds.every(cont)
  const onset = cont(w.sounds[0])
  return (all ? 0 : onset ? 1 : 2) * 10 + Math.min(9, w.sounds.length)
}

/** Bokstavspar som har en egen tvillingplanet (m/n, b/d ...): de svåraste distraktorerna för varandra. */
const CONTRAST_PAIRS: string[][] = levels.filter((l) => l.kind === 'contrast').map((l) => l.letters)

export function contrastPartner(letter: string): string | undefined {
  const pair = CONTRAST_PAIRS.find((p) => p.includes(letter))
  return pair?.find((x) => x !== letter)
}

/**
 * Svarsalternativ per ordspel. Rätt svar FÖRST, sedan distraktorerna svårast först: skärmen väljer
 * hur många som visas (fler efter tre rätt i rad, färre efter fel) och blandar dem. Byggarnas ordning
 * får därför aldrig ritas rakt av.
 */
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
    // Har ordet ett minimalt par (tak/tack) ska partnern alltid vara med: det är hela övningen.
    const partner = w.pair ? allWords.find((o) => o.id === w.pair) : undefined
    const picks = [
      ...(partner ? [partner] : []),
      ...shuffle(knownWords.filter((o) => o.id !== w.id && o.text !== w.text && o.id !== w.pair), rng).sort((a, b) => score(b) - score(a)),
    ]
      .filter((o, i, arr) => arr.findIndex((x) => x.text === o.text) === i)
      .slice(0, DISTRACTOR_POOL)
    return [w.id, ...picks.map((o) => o.id)]
  }
  if (game === 'read-word') {
    // Bilder som alternativ. De första distraktorerna ska likna målordet i skrift (samma början
    // eller längd), annars går uppgiften att lösa på första bokstaven.
    const cands = allWords.filter((o) => o.emoji !== '' && o.id !== w.id && o.emoji !== w.emoji)
    const near = shuffle(cands.filter((o) => o.text[0] === w.text[0] || o.text.length === w.text.length), rng)
    const far = shuffle(cands.filter((o) => !near.includes(o)), rng)
    const picks: Word[] = []
    for (const o of [...near, ...far]) {
      if (picks.length >= DISTRACTOR_POOL) break
      if (!picks.some((p) => p.emoji === o.emoji)) picks.push(o)
    }
    return [w.id, ...picks.map((o) => o.id)]
  }
  // sound-train: bildval efter ljudningen (tomt för stavelser utan bild).
  // sound-riddle/sound-band: bilder där de svåraste delar första ljud eller längd med ordet (mus/mun/mor),
  // så att hela ordet måste smältas ihop och inte bara första ljudet höras.
  if (w.emoji === '') return []
  if (game === 'sound-riddle' || game === 'sound-band') {
    const cands = allWords.filter((o) => o.emoji !== '' && o.id !== w.id && o.emoji !== w.emoji)
    const near = shuffle(cands.filter((o) => o.sounds[0] === w.sounds[0] || o.sounds.length === w.sounds.length), rng)
    const far = shuffle(cands.filter((o) => !near.includes(o)), rng)
    const picks: Word[] = []
    for (const o of [...near, ...far]) {
      if (picks.length >= DISTRACTOR_POOL) break
      if (!picks.some((p) => p.emoji === o.emoji)) picks.push(o)
    }
    return [w.id, ...picks.map((o) => o.id)]
  }
  const others = shuffle(allWords.filter((o) => o.emoji !== '' && o.id !== w.id && o.emoji !== w.emoji), rng)
  const distinct: Word[] = []
  for (const o of others) if (!distinct.some((d) => d.emoji === o.emoji) && distinct.length < DISTRACTOR_POOL) distinct.push(o)
  return [w.id, ...distinct.map((d) => d.id)]
}

/**
 * Bokstavsalternativ för Fånga ljudet: tvillingbokstaven först (m för n), sedan planetens egna,
 * sedan övriga kända. Rätt svar först, se wordOptions.
 */
export function letterOptions(target: string, planetLetters: string[], known: string[], rng: Rng): string[] {
  const others = shuffle(known.filter((id) => id !== target), rng)
  const partner = contrastPartner(target)
  const ordered = [
    ...others.filter((id) => id === partner),
    ...others.filter((id) => id !== partner && planetLetters.includes(id)),
    ...others.filter((id) => id !== partner && !planetLetters.includes(id)),
  ]
  return [target, ...ordered.slice(0, DISTRACTOR_POOL)]
}

/**
 * En fjärde bild till en tokig mening: har meningen två bilddelar (🐄🎩) och distraktorerna byter
 * ut varsin (🐷🎩, 🐄👑), så är bilden med båda utbytta (🐷👑) en tredje distraktor. Svårast först:
 * de som delar en del med rätt bild, sist den som inte delar någon.
 */
export function sentenceOptions(s: Sentence): string[] {
  const parts = [...new Intl.Segmenter('sv', { granularity: 'grapheme' }).segment(s.picture)].map((x) => x.segment)
  const extra: string[] = []
  if (parts.length === 2 && s.distractors.length === 2) {
    const [a, b] = parts
    const seg = (t: string) => [...new Intl.Segmenter('sv', { granularity: 'grapheme' }).segment(t)].map((x) => x.segment)
    const d1 = seg(s.distractors[0])
    const d2 = seg(s.distractors[1])
    if (d1.length === 2 && d2.length === 2) {
      const swapA = d1[0] !== a && d1[1] === b ? d1[0] : d2[0] !== a && d2[1] === b ? d2[0] : null
      const swapB = d1[1] !== b && d1[0] === a ? d1[1] : d2[1] !== b && d2[0] === a ? d2[1] : null
      if (swapA && swapB) extra.push(swapA + swapB)
    }
  }
  return [s.picture, ...s.distractors, ...extra.filter((e) => e !== s.picture && !s.distractors.includes(e))]
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
