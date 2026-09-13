import type { GameId, Sentence, SightWord, Story, Word } from '../content'
import { masteryKey, weakness } from './mastery'
import { shuffle, type Rng } from './random'
import type { BuildInput } from './sessionBuilder'
import type { ItemKind, Task } from './types'

/** Svagast/osedd först, jämnt slumpad bland lika. */
function rank<T extends { id: string }>(list: T[], kind: ItemKind, input: BuildInput, rng: Rng): T[] {
  return shuffle(list, rng).sort((a, b) => {
    const ma = input.mastery[masteryKey(kind, a.id)]
    const mb = input.mastery[masteryKey(kind, b.id)]
    return weakness(mb) - weakness(ma) || (ma?.lastSeenAt ?? 0) - (mb?.lastSeenAt ?? 0)
  })
}

/** Ordplaneten: Vilket ord? och Ordbilds-memory om vartannat. */
export function buildSightwords(input: BuildInput, games: GameId[], rng: Rng): Task[] {
  const ranked = rank(input.sightwords, 'sightword', input, rng)
  if (ranked.length < 3) return []
  const tasks: Task[] = []
  for (let i = 0; i < input.count; i++) {
    const w: SightWord = ranked[i % ranked.length]
    const others = shuffle(ranked.filter((o) => o.id !== w.id), rng).slice(0, 2).map((o) => o.id)
    const memory = games.includes('sight-memory') && (!games.includes('which-word') || i % 2 === 1)
    tasks.push({
      id: `s${i}-${w.id}`,
      game: memory ? 'sight-memory' : 'which-word',
      targetId: w.id,
      kind: 'sightword',
      options: memory ? [w.id, ...others] : shuffle([w.id, ...others], rng),
      isReview: false,
    })
  }
  return tasks
}

function sentenceTask(s: Sentence, i: number, rng: Rng): Task {
  return { id: `m${i}-${s.id}`, game: 'silly-sentences', targetId: s.id, kind: 'sentence', options: shuffle([s.picture, ...s.distractors], rng), answer: s.picture, isReview: false }
}

/** Tokplaneten: läs meningen, välj rätt bild. Aldrig samma mening två gånger i ett pass. */
export function buildSentences(input: BuildInput, _games: GameId[], rng: Rng): Task[] {
  const ranked = rank(input.sentences, 'sentence', input, rng)
  return ranked.slice(0, Math.min(input.count, ranked.length)).map((s, i) => sentenceTask(s, i, rng))
}

/** Sagoplaneten: två berättelser varvade med två tokiga meningar. */
export function buildStories(input: BuildInput, games: GameId[], rng: Rng): Task[] {
  const stories = rank(input.stories, 'story', input, rng).slice(0, 2)
  const sentences = games.includes('silly-sentences') ? rank(input.sentences, 'sentence', input, rng).slice(0, 2) : []
  const tasks: Task[] = []
  stories.forEach((st: Story, i) => {
    tasks.push({ id: `st${i}-${st.id}`, game: 'story', targetId: st.id, kind: 'story', options: st.options, answer: String(st.answer), isReview: false })
    if (sentences[i]) tasks.push(sentenceTask(sentences[i], i, rng))
  })
  return tasks
}

/** Startrampen: Rimjakt. Hör ett ord, välj bilden som rimmar. */
export function buildPhonology(input: BuildInput, _games: GameId[], rng: Rng): Task[] {
  const byId = new Map(input.words.map((w) => [w.id, w]))
  const pairs = input.rhymes.filter((p) => p.every((id) => byId.get(id)?.emoji))
  if (pairs.length === 0) return []
  const inPair = new Set(pairs.flat())
  const fillers = input.words.filter((w) => w.emoji !== '' && !inPair.has(w.id))
  const order = shuffle(pairs, rng)
  const tasks: Task[] = []
  for (let i = 0; i < Math.min(input.count, order.length); i++) {
    const pair = order[i]
    const [target, partner] = rng() < 0.5 ? pair : [pair[1], pair[0]]
    const w = byId.get(target) as Word
    const distract = shuffle(fillers.filter((f) => f.emoji !== w.emoji && f.emoji !== byId.get(partner)?.emoji), rng)
      .filter((f, k, arr) => arr.findIndex((x) => x.emoji === f.emoji) === k)
      .slice(0, 2)
    tasks.push({ id: `r${i}-${target}`, game: 'rhyme-hunt', targetId: target, kind: 'word', options: shuffle([partner, ...distract.map((d) => d.id)], rng), answer: partner, isReview: false })
  }
  return tasks
}
