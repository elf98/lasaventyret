import type { GameId, Level, Sentence, SightWord, Story, Word } from '../content'
import { interleave, spreadOut, wordOptions } from './builderUtils'
import { buildPhonology, buildSentences, buildSightwords, buildStories } from './kindBuilders'
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
  easy: { wordShare: 0.25, maxSyllables: 2, wordGames: ['sound-train', 'build-word', 'which-word'] },
  normal: { wordShare: 0.45, maxSyllables: 1, wordGames: ['build-word', 'sound-train', 'which-word'] },
  hard: { wordShare: 0.6, maxSyllables: 0, wordGames: ['build-word', 'which-word', 'sound-train'] },
}

const MAX_OPTIONS = 4
const LETTER_GAMES: GameId[] = ['catch-sound']
const WORD_GAMES: GameId[] = ['sound-train', 'build-word', 'which-word']

export function buildSession(input: BuildInput): Task[] {
  const rng = input.rng ?? Math.random
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
    default:
      return buildLetters(input, games, rng)
  }
}

/** Bokstavsplaneter och Verkstan: bokstavsuppgifter + ord med kända bokstäver + repetition. */
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
  if (level.kind === 'cluster') wordPool = input.words.filter((w) => !w.decodable && known(w))
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
  const syllableAvail = Math.min(diff.maxSyllables, wordPool.filter((w) => w.emoji === '').length)
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

  const rank = (list: Word[]) =>
    shuffle(list, rng).sort((a, b) => {
      const ma = mastery[masteryKey('word', a.id)]
      const mb = mastery[masteryKey('word', b.id)]
      return weakness(mb) - weakness(ma) || (ma?.lastSeenAt ?? 0) - (mb?.lastSeenAt ?? 0)
    })
  const rankedPictures = rank(wordPool.filter((w) => w.emoji !== ''))
  const rankedSyllables = rank(wordPool.filter((w) => w.emoji === '')).slice(0, diff.maxSyllables)
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
  const wordTasks: Task[] = wordTargets.map((w, i) => {
    const game: GameId = w.emoji === '' && wordGames.includes('sound-train') ? 'sound-train' : wordGames[pictureCount++ % wordGames.length]
    return { id: `w${i}-${w.id}`, game, targetId: w.id, kind: 'word', options: wordOptions(game, w, input.words, knownWords, distractorPool, rng), isReview: false }
  })

  return interleave(letterTasks, wordTasks)
}
