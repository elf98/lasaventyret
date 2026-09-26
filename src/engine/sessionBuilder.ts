import type { GameId, Level, Sentence, SightWord, Story, Word } from '../content'
import { blendTier, DISTRACTOR_POOL, interleave, letterOptions, spreadOut, wordOptions } from './builderUtils'
import { buildContrast, buildPhonology, buildSentences, buildSightwords, buildStories, buildTemplates, phonologyTasks, riddleTask } from './kindBuilders'
import { isDue, masteryKey, weakness } from './mastery'
import { shuffle, weightedPick, type Rng } from './random'
import type { MasteryItem, Task } from './types'
import { isBonus, levelProgress } from './unlock'

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

/** Ett ordspel i rotationen: Vilket ord? finns i två varianter (hör ordet / se bilden och läs orden). */
interface WordGame {
  game: GameId
  variant?: 'read'
}
const g = (game: GameId, variant?: 'read'): WordGame => ({ game, variant })

/**
 * Svårighetsgrad: grundandel ord, max stavelser utan bild, ordspelens ordning. `boosted` gäller från
 * åtta kända bokstäver (Marsverkstan): Läs och välj väger dubbelt och Vilket ord? kommer i läs-först-
 * varianten, så att ungefär hälften av passet blir avkodning av skriven text. Avkodning automatiseras
 * av mängd, och ett barn som gör en avkodning per pass gör tjugo på tre veckor.
 */
export const DIFFICULTY: Record<Difficulty, { wordShare: number; maxSyllables: number; wordGames: WordGame[]; boosted: WordGame[] }> = {
  easy: {
    wordShare: 0.25,
    maxSyllables: 2,
    wordGames: [g('sound-band'), g('sound-train'), g('build-word'), g('read-word'), g('which-word')],
    boosted: [g('sound-band'), g('read-word'), g('sound-train'), g('build-word'), g('read-word'), g('which-word', 'read')],
  },
  normal: {
    wordShare: 0.45,
    maxSyllables: 1,
    wordGames: [g('sound-band'), g('build-word'), g('read-word'), g('sound-train'), g('which-word')],
    boosted: [g('sound-band'), g('read-word'), g('build-word'), g('read-word'), g('which-word', 'read'), g('sound-train'), g('which-word')],
  },
  hard: {
    wordShare: 0.6,
    maxSyllables: 0,
    wordGames: [g('read-word'), g('sound-band'), g('build-word'), g('which-word'), g('sound-train')],
    boosted: [g('read-word'), g('which-word', 'read'), g('sound-band'), g('read-word'), g('build-word'), g('which-word'), g('sound-train')],
  },
}

/** Så många kända bokstäver innan avkodningen får väga dubbelt. */
export const DECODING_BOOST_AT = 8

const LETTER_GAMES: GameId[] = ['catch-sound']
const WORD_GAMES: GameId[] = ['sound-train', 'sound-band', 'build-word', 'which-word', 'read-word']
/** Spel som fungerar utan bild (vardagsord som "har", "inte"). Läs och välj och läs-först-varianten kräver bild. */
const NO_PICTURE_GAMES: GameId[] = ['sound-train', 'sound-band', 'build-word', 'which-word']
/** Så många ord i Ordgåtan som ska behärskas innan den slutar vävas in i varje pass. */
export const BLEND_GOAL = 8
const PHONOLOGY_GAMES: GameId[] = ['rhyme-hunt', 'first-sound', 'last-sound', 'count-sounds']

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
  // Alternativen i Vilket ord? är text barnet ska läsa: de får bara innehålla bokstäver hen mött.
  const seen = introducedLetters(input)
  const readable = input.words.filter((w) => !w.noBlend && w.sounds.every((s) => seen.has(s)))
  const due = Object.values(input.mastery)
    .filter((m) => (m.kind === 'word' || m.kind === 'sightword') && m.attempts > 0 && isDue(m, input.now) && !here.has(m.id))
    .sort((a, b) => weakness(b) - weakness(a) || a.dueAt - b.dueAt)
  const can = (g: GameId) => input.availableGames.includes(g)
  for (const m of due) {
    let task: Task | null = null
    if (m.kind === 'sightword' && sightIds.has(m.id) && can('which-word')) {
      const others = shuffle(input.sightwords.filter((s) => s.id !== m.id), rng).slice(0, DISTRACTOR_POOL)
      if (others.length >= 2) task = { id: `rev-${m.id}`, game: 'which-word', targetId: m.id, kind: 'sightword', options: [m.id, ...others.map((o) => o.id)], isReview: true }
    } else if (m.kind === 'word') {
      const w = byId.get(m.id)
      const game: GameId | null = w && w.emoji !== '' && can('read-word') ? 'read-word' : can('which-word') ? 'which-word' : null
      if (w && game) task = { id: `rev-${m.id}`, game, targetId: m.id, kind: 'word', options: wordOptions(game, w, input.words, readable, [], rng), isReview: true }
    }
    if (!task || task.options.length < 3) continue
    // Aldrig först i passet, aldrig i stället för en berättelse (den väger tre uppgifter) och aldrig
    // i stället för passets ljudlek.
    const swappable = tasks.map((t, i) => ({ t, i })).filter(({ t, i }) => i > 0 && t.game !== 'story' && t.kind !== 'phoneme')
    if (swappable.length === 0) return tasks
    const at = swappable[Math.floor(rng() * swappable.length)].i
    return tasks.map((t, i) => (i === at ? (task as Task) : t))
  }
  return tasks
}

/** Bokstäver barnet mött: nivåns egna, alla tidigare nivåers och allt som finns i mastery. */
export function introducedLetters(input: BuildInput): Set<string> {
  const out = new Set<string>(input.level.letters)
  const idx = input.levels.findIndex((l) => l.id === input.level.id)
  input.levels.slice(0, Math.max(0, idx)).forEach((l) => l.letters.forEach((x) => out.add(x)))
  for (const m of Object.values(input.mastery)) if (m.kind === 'letter' && m.attempts > 0) out.add(m.id)
  return out
}

function buildForLevel(input: BuildInput, rng: Rng): Task[] {
  const games = input.level.games.filter((g) => input.availableGames.includes(g))
  if (games.length === 0) return []
  switch (input.level.kind) {
    case 'sightwords':
      return buildSightwords(input, games, rng)
    case 'sentences':
      return buildSentences(input, games, rng)
    case 'templates':
      return buildTemplates(input, games, rng)
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

/**
 * Ljudlek invävd i passet: en per pass på bokstavsplaneterna, och på ordplaneterna tills Startrampen
 * är klar. Fonologisk medvetenhet är den starkaste prediktorn för läsinlärning och får inte vara
 * frivillig. Orden tas ur Startrampens lista (så att dess mätare fylls) bland dem med kända bokstäver.
 */
function wovenPhonology(input: BuildInput, introduced: Set<string>, rng: Rng): Task[] {
  const games = PHONOLOGY_GAMES.filter((g) => input.availableGames.includes(g))
  if (games.length === 0) return []
  const ramp = input.levels.find(isBonus)
  const rampDone = ramp ? levelProgress(ramp, input.mastery).complete : true
  if (input.level.kind === 'words' && rampDone) return []
  if (input.level.kind !== 'letters' && input.level.kind !== 'words') return []
  const byId = new Map(input.words.map((w) => [w.id, w]))
  const known = (w: Word) => w.emoji !== '' && w.sounds.every((s) => introduced.has(s))
  const curated = (ramp?.words ?? []).map((id) => byId.get(id)).filter((w): w is Word => !!w && known(w))
  const pool = curated.length >= 4 ? curated : input.words.filter(known)
  if (pool.length < 3) return []
  return phonologyTasks(input, games, rng, { pool, letters: introduced, count: 1 })
}

/**
 * Ordgåtan invävd: en per pass på bokstavs- och ordplaneterna tills BLEND_GOAL ord smälts ihop
 * rätt. Sammanljudning är den vanligaste knäcken när ljuden sitter, och den tränas inte av att
 * appen ljudar ihop åt barnet. Bara ord med kända bokstäver, lättast ljudbara först.
 */
function wovenRiddle(input: BuildInput, introduced: Set<string>, rng: Rng): Task[] {
  if (!input.availableGames.includes('sound-riddle')) return []
  if (input.level.kind !== 'letters' && input.level.kind !== 'words') return []
  const mastered = Object.values(input.mastery).filter((m) => m.kind === 'blend' && m.mastered).length
  if (mastered >= BLEND_GOAL) return []
  const pool = input.words.filter((w) => w.emoji !== '' && w.sounds.every((s) => introduced.has(s)))
  const t = riddleTask(input, pool, new Set(), rng, 0)
  return t ? [t] : []
}

/** Bokstavsplaneter, ordplaneter (kind words: given lista) och Verkstan: bokstavsuppgifter + ord + repetition. */
function buildLetters(input: BuildInput, games: GameId[], rng: Rng): Task[] {
  const { level, mastery, now } = input
  const diff = DIFFICULTY[input.difficulty]
  const letterGames = games.filter((g) => LETTER_GAMES.includes(g))
  const introduced = introducedLetters(input)
  const boosted = introduced.size >= DECODING_BOOST_AT
  // Ljudbandet tar en plats i rotationen så länge sammanljudningen tränas; när den sitter lämnar det
  // den förstärkta rotationen åt ren avkodning igen.
  const blending = Object.values(mastery).filter((m) => m.kind === 'blend' && m.mastered).length < BLEND_GOAL
  const wordGames = (boosted ? diff.boosted : diff.wordGames).filter((wg) => games.includes(wg.game) && WORD_GAMES.includes(wg.game) && (wg.game !== 'sound-band' || blending || !boosted))

  const poolIds = level.letters

  const known = (w: Word) => !w.noBlend && w.sounds.every((s) => introduced.has(s))
  let wordPool: Word[]
  if (level.kind === 'words') wordPool = (level.words ?? []).map((id) => input.words.find((w) => w.id === id)).filter((w): w is Word => !!w && !w.noBlend)
  else if (level.kind === 'cluster') wordPool = input.words.filter((w) => !w.decodable && known(w))
  else {
    wordPool = input.words.filter((w) => w.decodable && known(w) && w.sounds.some((s) => poolIds.includes(s)))
    if (wordPool.length < 3) wordPool = input.words.filter((w) => w.decodable && known(w))
  }
  if (wordGames.length === 0) wordPool = []

  const phonology = [...wovenPhonology(input, introduced, rng), ...wovenRiddle(input, introduced, rng)]
  const count = Math.max(1, input.count - phonology.length)

  const masteredRatio = poolIds.length === 0 ? 1 : poolIds.filter((id) => mastery[id]?.mastered).length / poolIds.length
  const wordShare = wordPool.length === 0 ? 0 : letterGames.length === 0 || poolIds.length === 0 ? 1 : Math.min(boosted ? 0.75 : 0.7, diff.wordShare + (boosted ? 0.1 : 0) + 0.4 * masteredRatio)

  // Repetition: bokstäver från andra planeter, förfallna/svaga först, sedan minst nyligen sedda.
  const seen = [...introduced]
    .filter((id) => !poolIds.includes(id))
    .map((id) => mastery[id])
    .filter((m): m is MasteryItem => !!m && m.attempts > 0)
  const urgent = seen.filter((m) => isDue(m, now) || !m.mastered).sort((a, b) => weakness(b) - weakness(a) || a.dueAt - b.dueAt)
  const rest = seen.filter((m) => !urgent.includes(m)).sort((a, b) => a.lastSeenAt - b.lastSeenAt)
  const reviewCandidates = [...urgent, ...rest]
  const reviewCount = letterGames.length === 0 ? 0 : Math.min(Math.round(count * input.reviewShare), reviewCandidates.length)

  const newCount = Math.max(0, count - reviewCount)
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
  // Bland lika: lättast ljudbara först (hållbara ljud, få ljud) tills sammanljudningen sitter.
  const tier = (m: MasteryItem | undefined) => (!m || m.attempts === 0 ? 1 : m.mastered ? 2 : m.streak > 0 ? 0 : 1)
  const rank = (list: Word[]) =>
    shuffle(list, rng).sort((a, b) => {
      const ma = mastery[masteryKey('word', a.id)]
      const mb = mastery[masteryKey('word', b.id)]
      return tier(ma) - tier(mb) || (blending ? blendTier(a) - blendTier(b) : 0) || weakness(mb) - weakness(ma) || (ma?.lastSeenAt ?? 0) - (mb?.lastSeenAt ?? 0)
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
  const letterTasks: Task[] = spreadOut(letterTargets, rng).map((t, i) => ({
    id: `l${i}-${t.id}`,
    game: letterGames[0],
    targetId: t.id,
    kind: 'letter',
    options: letterOptions(t.id, poolIds, distractorPool, rng),
    isReview: t.review,
  }))

  const knownWords = input.words.filter(known)
  let pictureCount = 0
  let plainCount = 0
  const plainGames = wordGames.filter((wg) => !wg.variant && NO_PICTURE_GAMES.includes(wg.game))
  const wordTasks: Task[] = wordTargets.map((w, i) => {
    const wg: WordGame = w.emoji === '' ? (plainGames.length ? plainGames[plainCount++ % plainGames.length] : g('sound-train')) : wordGames[pictureCount++ % wordGames.length]
    return { id: `w${i}-${w.id}`, game: wg.game, targetId: w.id, kind: 'word', options: wordOptions(wg.game, w, input.words, knownWords, distractorPool, rng), variant: wg.variant, isReview: false }
  })

  const tasks = interleave(letterTasks, wordTasks)
  // Ljudleken och Ordgåtan utspridda i passet: aldrig först (då hinner barnet inte in i spelet), aldrig sist.
  phonology.forEach((t, i) => tasks.splice(Math.min(tasks.length - 1, Math.max(1, Math.floor(((i + 1) * tasks.length) / (phonology.length + 1)))), 0, t))
  return tasks
}
