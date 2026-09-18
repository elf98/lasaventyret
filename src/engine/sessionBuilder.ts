import type { GameId, Level, Sentence, SightWord, Story, Word } from '../content'
import { interleave, spreadOut, wordOptions } from './builderUtils'
import { buildContrast, buildPhonology, buildSentences, buildSightwords, buildStories } from './kindBuilders'
import { isDue, masteryKey, weakness } from './mastery'
import { shuffle, weightedPick, type Rng } from './random'
import type { MasteryItem, Task } from './types'

export type Difficulty = 'easy' | 'normal' | 'hard'

export interface BuildInput {
  level: Level
  /** Alla nivåer i ordning; tidigare planeters bokstäver räknas som kända. */
  levels: Level[]
  mastery: Record<string, MasteryItem>
  words: Word[]
  sightwords: SightWord[]
  sentences: Sentence[]
  stories: Story[]
  rhymes: string[][]
  now: number
  count: number
  /** Andel repetition, 0.2–0.3 enligt spec. */
  reviewShare: number
  /** Spel som faktiskt är implementerade just nu. */
  availableGames: GameId[]
  difficulty: Difficulty
  rng?: Rng
}

/** Svårighetsgrad: grundandel ord, max stavelser utan bild, ordspelens ordning. */
export const DIFFICULTY: Record<Difficulty, { wordShare: number; maxSyllables: number; wordGames: GameId[] }> = {
  easy: { wordShare: 0.25, maxSyllables: 2, wordGames: ['sound-train', 'build-word', 'read-word', 'which-word'] },
  normal: { wordShare: 0.45, maxSyllables: 1, wordGames: ['build-word', 'read-word', 'sound-train', 'which-word'] },
  hard: { wordShare: 0.6, maxSyllables: 0, wordGames: ['read-word', 'build-word', 'which-word', 'sound-train'] },
}

const MAX_OPTIONS = 4
const LETTER_GAMES: GameId[] = ['catch-sound']
const WORD_GAMES: GameId[] = ['sound-train', 'build-word', 'which-word', 'read-word']
/** Spel som fungerar utan bild (vardagsord som "har", "inte"). Läs och välj kräver bild. */
const NO_PICTURE_GAMES: GameId[] = ['sound-train', 'build-word', 'which-word']

export function buildSession(input: BuildInput): Task[] {
  const rng = input.rng ?? Math.random
  return withWordReview(input, buildForLevel(input, rng), rng)
}

/**
 * Repetition över planetgränser: ett förfallet ord eller en förfallen ordbild från en TIDIGARE planet
 * tar en plats i passet. Utan detta möts ett ord aldrig igen när planeten är avklarad, och det som
 * inte repeteras glöms. Bokstäver repeteras redan inuti bokstavsplaneterna.
 */
function withWordReview(input: BuildInput, tasks: Task[], rng: Rng): Task[] {
  if (tasks.length < 4) return tasks
  const here = new Set(tasks.map((t) => t.targetId))
  const byId = new Map(input.words.map((w) => [w.id, w]))
  const sightIds = new Set(input.sightwords.map((s) => s.id))
  const due = Object.values(input.mastery)
    .filter((m) => (m.kind === 'word' || m.kind === 'sightword') && m.attempts > 0 && isDue(m, input.now) && !here.has(m.id))
    .sort((a, b) => weakness(b) - weakness(a) || a.dueAt - b.dueAt)
  const can = (g: GameId) => input.availableGames.includes(g)
  for (const m of due) {
    let task: Task | null = null
    if (m.kind === 'sightword' && sightIds.has(m.id) && can('which-word')) {
      const others = shuffle(input.sightwords.filter((s) => s.id !== m.id), rng).slice(0, 2)
      if (others.length === 2) task = { id: `rev-${m.id}`, game: 'which-word', targetId: m.id, kind: 'sightword', options: shuffle([m.id, ...others.map((o) => o.id)], rng), isReview: true }
    } else if (m.kind === 'word') {
      const w = byId.get(m.id)
      const game: GameId | null = w && w.emoji !== '' && can('read-word') ? 'read-word' : can('which-word') ? 'which-word' : null
      if (w && game) task = { id: `rev-${m.id}`, game, targetId: m.id, kind: 'word', options: wordOptions(game, w, input.words, input.words, [], rng), isReview: true }
    }
    if (!task || task.options.length < 2) continue
    // Aldrig först i passet: barnet ska börja med det planeten handlar om.
    const at = 1 + Math.floor(rng() * (tasks.length - 1))
    return tasks.map((t, i) => (i === at ? (task as Task) : t))
  }
  return tasks
}

function buildForLevel(input: BuildInput, rng: Rng): Task[] {
  const games = input.level.games.filter((g) => input.availableGames.includes(g))
  if (games.length === 0) return []
  switch (input.level.kind) {
    case 'sightwords':
      return buildSightwords(input, games, rng)
    case 'sentences':
      return buildSentences(input, games, rng)
    case 'stories':
      return buildStories(input, games, rng)
    case 'phonology':
      return buildPhonology(input, games, rng)
    case 'contrast':
      return buildContrast(input, games, rng)
    default:
      return buildLetters(input, games, rng)
  }
}

/** Bokstavsplaneter, ordplaneter (kind words: given lista) och Verkstan: bokstavsuppgifter + ord + repetition. */
function buildLetters(input: BuildInput, games: GameId[], rng: Rng): Task[] {
  const { level, mastery, now } = input
  const diff = DIFFICULTY[input.difficulty]
  const letterGames = games.filter((g) => LETTER_GAMES.includes(g))
  const wordGames = diff.wordGames.filter((g) => games.includes(g) && WORD_GAMES.includes(g))

  const poolIds = level.letters
  const introduced = new Set<string>(poolIds)
  const levelIndex = input.levels.findIndex((l) => l.id === level.id)
  input.levels.slice(0, Math.max(0, levelIndex)).forEach((l) => l.letters.forEach((x) => introduced.add(x)))
  for (const m of Object.values(mastery)) if (m.kind === 'letter' && m.attempts > 0) introduced.add(m.id)

  const known = (w: Word) => !w.noBlend && w.sounds.every((s) => introduced.has(s))
  let wordPool: Word[]
  if (level.kind === 'words') wordPool = (level.words ?? []).map((id) => input.words.find((w) => w.id === id)).filter((w): w is Word => !!w && !w.noBlend)
  else if (level.kind === 'cluster') wordPool = input.words.filter((w) => !w.decodable && known(w))
  else {
    wordPool = input.words.filter((w) => w.decodable && known(w) && w.sounds.some((s) => poolIds.includes(s)))
    if (wordPool.length < 3) wordPool = input.words.filter((w) => w.decodable && known(w))
  }
  if (wordGames.length === 0) wordPool = []

  const masteredRatio = poolIds.length === 0 ? 1 : poolIds.filter((id) => mastery[id]?.mastered).length / poolIds.length
  const wordShare = wordPool.length === 0 ? 0 : letterGames.length === 0 || poolIds.length === 0 ? 1 : Math.min(0.7, diff.wordShare + 0.4 * masteredRatio)

  // Repetition: bokstäver från andra planeter, förfallna/svaga först, sedan minst nyligen sedda.
  const seen = [...introduced]
    .filter((id) => !poolIds.includes(id))
    .map((id) => mastery[id])
    .filter((m): m is MasteryItem => !!m && m.attempts > 0)
  const urgent = seen.filter((m) => isDue(m, now) || !m.mastered).sort((a, b) => weakness(b) - weakness(a) || a.dueAt - b.dueAt)
  const rest = seen.filter((m) => !urgent.includes(m)).sort((a, b) => a.lastSeenAt - b.lastSeenAt)
  const reviewCandidates = [...urgent, ...rest]
  const reviewCount = letterGames.length === 0 ? 0 : Math.min(Math.round(input.count * input.reviewShare), reviewCandidates.length)

  const newCount = Math.max(0, input.count - reviewCount)
  const pictureAvail = wordPool.filter((w) => w.emoji !== '').length
  // Taket för ord utan bild gäller stavelser (sa, la, se) på bokstavsplaneter. En kurerad ordlista
  // (kind 'words', t.ex. Vardagsplaneten) består med flit av bildlösa ord och styr sig själv.
  const curated = level.kind === 'words'
  const plain = wordPool.filter((w) => w.emoji === '')
  const syllableAvail = curated ? plain.length : Math.min(diff.maxSyllables, plain.length)
  const wantedWords = Math.min(Math.round(newCount * wordShare), pictureAvail + syllableAvail)
  // Planetens egna bokstäver får aldrig trängas ut av ord så länge någon av dem är obehärskad:
  // annars kan sista bokstaven bli utan uppgift pass efter pass och planeten blir aldrig klar.
  const unmastered = poolIds.filter((id) => !mastery[id]?.mastered)
  const letterCount = letterGames.length === 0 ? 0 : Math.max(newCount - wantedWords, Math.min(unmastered.length, newCount))
  const wordCount = letterGames.length === 0 ? wantedWords : newCount - letterCount

  // Obehärskade och svaga bokstäver först, resten i slumpad ordning.
  const isMastered = (id: string) => (mastery[id]?.mastered ? 1 : 0)
  const prioritized = shuffle(poolIds, rng).sort((a, b) => isMastered(a) - isMastered(b) || weakness(mastery[b]) - weakness(mastery[a]))
  const letterTargets: { id: string; review: boolean }[] = []
  prioritized.slice(0, letterCount).forEach((id) => letterTargets.push({ id, review: false }))
  while (letterTargets.length < letterCount) {
    letterTargets.push({ id: weightedPick(poolIds, poolIds.map((id) => weakness(mastery[id])), rng), review: false })
  }
  reviewCandidates.slice(0, reviewCount).forEach((m) => letterTargets.push({ id: m.id, review: true }))

  // Påbörjade ord (rätt men inte behärskade) först så att de blir klara, sedan nya, sist behärskade.
  const tier = (m: MasteryItem | undefined) => (!m || m.attempts === 0 ? 1 : m.mastered ? 2 : m.streak > 0 ? 0 : 1)
  const rank = (list: Word[]) =>
    shuffle(list, rng).sort((a, b) => {
      const ma = mastery[masteryKey('word', a.id)]
      const mb = mastery[masteryKey('word', b.id)]
      return tier(ma) - tier(mb) || weakness(mb) - weakness(ma) || (ma?.lastSeenAt ?? 0) - (mb?.lastSeenAt ?? 0)
    })
  const rankedPictures = rank(wordPool.filter((w) => w.emoji !== ''))
  const rankedSyllables = curated ? rank(plain) : rank(plain).slice(0, diff.maxSyllables)
  const wordTargets: Word[] = []
  let pi = 0
  let si = 0
  while (wordTargets.length < wordCount && (pi < rankedPictures.length || si < rankedSyllables.length)) {
    if (pi < rankedPictures.length) wordTargets.push(rankedPictures[pi++])
    if (wordTargets.length < wordCount && si < rankedSyllables.length) wordTargets.push(rankedSyllables[si++])
  }

  const distractorPool = [...introduced]
  const letterTasks: Task[] = spreadOut(letterTargets, rng).map((t, i) => {
    const others = shuffle(distractorPool.filter((id) => id !== t.id), rng)
    const preferred = others.filter((id) => poolIds.includes(id))
    const distractors = [...preferred, ...others.filter((id) => !poolIds.includes(id))].slice(0, MAX_OPTIONS - 1)
    return { id: `l${i}-${t.id}`, game: letterGames[0], targetId: t.id, kind: 'letter', options: shuffle([t.id, ...distractors], rng), isReview: t.review }
  })

  const knownWords = input.words.filter(known)
  let pictureCount = 0
  let plainCount = 0
  const plainGames = wordGames.filter((g) => NO_PICTURE_GAMES.includes(g))
  const wordTasks: Task[] = wordTargets.map((w, i) => {
    const game: GameId = w.emoji === '' ? (plainGames.length ? plainGames[plainCount++ % plainGames.length] : 'sound-train') : wordGames[pictureCount++ % wordGames.length]
    return { id: `w${i}-${w.id}`, game, targetId: w.id, kind: 'word', options: wordOptions(game, w, input.words, knownWords, distractorPool, rng), isReview: false }
  })

  return interleave(letterTasks, wordTasks)
}
