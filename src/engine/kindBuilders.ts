import { templates, type GameId, type Level, type Sentence, type SightWord, type Story, type Word } from '../content'
import { blendTier, DISTRACTOR_POOL, sentenceOptions, wordOptions } from './builderUtils'
import { masteryKey, weakness } from './mastery'
import { shuffle, type Rng } from './random'
import type { BuildInput } from './sessionBuilder'
import { generateSentence, templateKey } from './templates'
import type { ItemKind, Task } from './types'

/** Svagast/osedd först, jämnt slumpad bland lika. */
function rank<T extends { id: string }>(list: T[], kind: ItemKind, input: BuildInput, rng: Rng): T[] {
  return shuffle(list, rng).sort((a, b) => {
    const ma = input.mastery[masteryKey(kind, a.id)]
    const mb = input.mastery[masteryKey(kind, b.id)]
    return weakness(mb) - weakness(ma) || (ma?.lastSeenAt ?? 0) - (mb?.lastSeenAt ?? 0)
  })
}

/** Ordbilder: påbörjade (rätt men ännu inte behärskade) först så att de blir klara, sedan nya, sist behärskade. */
function rankSightwords(list: SightWord[], input: BuildInput, rng: Rng): SightWord[] {
  const tier = (w: SightWord) => {
    const m = input.mastery[masteryKey('sightword', w.id)]
    if (!m || m.attempts === 0) return 1
    if (m.mastered) return 2
    return m.streak > 0 ? 0 : 1
  }
  return shuffle(list, rng).sort((a, b) => tier(a) - tier(b) || (input.mastery[masteryKey('sightword', a.id)]?.lastSeenAt ?? 0) - (input.mastery[masteryKey('sightword', b.id)]?.lastSeenAt ?? 0))
}

/**
 * Ordplaneten: mest Vilket ord? med Ordbilds-memory som omväxling en gång per pass (två på lätt).
 * Memoryt har fyra par. Vilket ord? bär fyra distraktorer; skärmen visar tre eller fyra alternativ.
 */
export function buildSightwords(input: BuildInput, games: GameId[], rng: Rng): Task[] {
  const ranked = rankSightwords(input.sightwords, input, rng)
  if (ranked.length < 4) return []
  const memorySlots = !games.includes('sight-memory') ? [] : !games.includes('which-word') ? [...Array(input.count).keys()] : input.difficulty === 'easy' ? [2, 6] : [3]
  const tasks: Task[] = []
  for (let i = 0; i < input.count; i++) {
    const w: SightWord = ranked[i % ranked.length]
    const memory = memorySlots.includes(i)
    const others = shuffle(ranked.filter((o) => o.id !== w.id), rng)
      .slice(0, memory ? 3 : DISTRACTOR_POOL)
      .map((o) => o.id)
    tasks.push({
      id: `s${i}-${w.id}`,
      game: memory ? 'sight-memory' : 'which-word',
      targetId: w.id,
      kind: 'sightword',
      options: [w.id, ...others],
      isReview: false,
    })
  }
  return tasks
}

function sentenceTask(s: Sentence, i: number): Task {
  return { id: `m${i}-${s.id}`, game: 'silly-sentences', targetId: s.id, kind: 'sentence', options: sentenceOptions(s), answer: s.picture, isReview: false }
}

/** Tokplaneten: läs meningen, välj rätt bild. Aldrig samma mening två gånger i ett pass. */
export function buildSentences(input: BuildInput, _games: GameId[], rng: Rng): Task[] {
  const subset = input.level.sentences
  const ranked = rank(subset ? input.sentences.filter((s) => subset.includes(s.id)) : input.sentences, 'sentence', input, rng)
  return ranked.slice(0, Math.min(input.count, ranked.length)).map((s, i) => sentenceTask(s, i))
}

/**
 * Meningsmaskinen: varje uppgift är en ny mening ur en mall ("{En djur} har {en sak}."), fylld med
 * ord barnet redan kan. Åttio meningar räcker inte till läsflyt; mallarna ger hundratals utan nytt
 * ordförråd. Behärskningen lagras per mall, så planeten blir klar när hälften av mallarna sitter.
 */
export function buildTemplates(input: BuildInput, _games: GameId[], rng: Rng): Task[] {
  const ranked = shuffle(templates.templates, rng).sort((a, b) => {
    const ma = input.mastery[masteryKey('sentence', templateKey(a.id))]
    const mb = input.mastery[masteryKey('sentence', templateKey(b.id))]
    return weakness(mb) - weakness(ma) || (ma?.lastSeenAt ?? 0) - (mb?.lastSeenAt ?? 0)
  })
  const avoid = new Set<string>()
  const tasks: Task[] = []
  for (let i = 0; tasks.length < input.count && i < input.count * 2 && ranked.length; i++) {
    const t = ranked[i % ranked.length]
    const g = generateSentence(t.id, rng, avoid)
    if (!g) continue
    g.sentence.id.split('|').slice(2).forEach((id) => avoid.add(id))
    tasks.push({ id: `g${i}-${t.id}`, game: 'silly-sentences', targetId: templateKey(t.id), kind: 'sentence', options: g.options, answer: g.sentence.picture, variant: g.sentence.id, isReview: false })
  }
  return tasks
}

/**
 * Sagoplaneten: berättelser varvade med tokiga meningar. En berättelse tar ungefär lika lång tid som
 * tre vanliga uppgifter (meningar, två frågor, omläsning), så passet räknar den som tre – annars blev
 * passet bara hälften så långt som på andra planeter och planeten tog dubbelt så många pass.
 */
const STORY_WEIGHT = 3

export function buildStories(input: BuildInput, games: GameId[], rng: Rng): Task[] {
  const wanted = Math.max(1, Math.round(input.count / STORY_WEIGHT))
  const stories = rank(input.stories, 'story', input, rng).slice(0, wanted)
  const room = Math.max(0, input.count - stories.length * STORY_WEIGHT)
  const sentences = games.includes('silly-sentences') ? rank(input.sentences, 'sentence', input, rng).slice(0, room + stories.length) : []
  const tasks: Task[] = []
  stories.forEach((st: Story, i) => {
    tasks.push({ id: `st${i}-${st.id}`, game: 'story', targetId: st.id, kind: 'story', options: st.questions[0].options, answer: String(st.questions[0].answer), isReview: false })
    if (sentences[i]) tasks.push(sentenceTask(sentences[i], i))
  })
  // Fyll ut med meningar om berättelserna inte räcker till hela passet.
  for (let i = stories.length; tasks.length < Math.ceil(input.count / 2) && i < sentences.length; i++) tasks.push(sentenceTask(sentences[i], i))
  return tasks
}

/** Grov rimnyckel: ordets slut från och med sista vokalen ("gris" -> "is", "bro" -> "o"). */
export function rhymeKey(text: string): string {
  const m = text.toLowerCase().match(/[aeiouyåäö][^aeiouyåäö]*$/)
  return m ? m[0] : text.toLowerCase()
}

export interface PhonologyOpts {
  /** Ord (med bild) att välja bland. */
  pool: Word[]
  /** Bokstäver barnet mött: bokstavsalternativen och svaret i första/sista ljudet måste finnas här. */
  letters?: Set<string>
  count: number
  /** Ljudlekarnas ordning; passet varvar dem. */
  order?: GameId[]
}

const PHONOLOGY_ORDER: GameId[] = ['rhyme-hunt', 'first-sound', 'sound-riddle', 'count-sounds', 'last-sound']

/**
 * Ordgåtan: ordet hörs i bitar (ljuden med mellanrum) och barnet väljer bilden. Ren sammanljudning
 * utan bokstäver, det första steget när barnet kan ljuden men inte får ihop dem. Lättast ljudbara
 * ord först (blendTier): två hållbara ljud, sedan tre, stoppljud i början sist. Egen mastery-kind
 * `blend`, så att Ordgåtan kan vävas in i passen tills sammanljudningen sitter.
 */
export function riddleTask(input: BuildInput, pool: Word[], used: Set<string>, rng: Rng, i: number): Task | null {
  const cands = pool.filter((w) => w.emoji !== '' && w.decodable && !w.noBlend && w.sounds.length >= 2 && w.sounds.length <= 4 && !used.has(w.id))
  if (cands.length < 3) return null
  const tier = (w: Word) => {
    const m = input.mastery[masteryKey('blend', w.id)]
    return !m || m.attempts === 0 ? 1 : m.mastered ? 2 : m.streak > 0 ? 0 : 1
  }
  const ranked = shuffle(cands, rng).sort((a, b) => tier(a) - tier(b) || blendTier(a) - blendTier(b) || (input.mastery[masteryKey('blend', a.id)]?.lastSeenAt ?? 0) - (input.mastery[masteryKey('blend', b.id)]?.lastSeenAt ?? 0))
  const w = ranked[0]
  used.add(w.id)
  const options = wordOptions('sound-riddle', w, input.words, pool, [], rng)
  if (options.length < 3) return null
  return { id: `q${i}-${w.id}`, game: 'sound-riddle', targetId: w.id, kind: 'blend', options, isReview: false }
}

/**
 * Ljudlekar utan bokstavsläsning: Rimjakt, första ljudet, sista ljudet och räkna ljuden. Att höra
 * enskilda ljud i ord är grunden all ljudning vilar på, och det tränas inte av att läsa hela ord.
 * Används både på Startrampen (hela passet) och invävt i bokstavs- och ordplaneterna (en per pass).
 */
export function phonologyTasks(input: BuildInput, games: GameId[], rng: Rng, opts: PhonologyOpts): Task[] {
  const byId = new Map(input.words.map((w) => [w.id, w]))
  const pool = opts.pool.filter((w) => w.emoji !== '')
  const known = (s: string) => !opts.letters || opts.letters.has(s)
  // Räkna ljuden kräver att bokstäverna motsvarar ljuden (inte katt, sko, stjärna).
  const countable = pool.filter((w) => w.decodable && !w.noBlend && w.sounds.length >= 2 && w.sounds.length <= 4 && w.sounds.every(known))
  const tier = (w: Word) => {
    const m = input.mastery[masteryKey('phoneme', w.id)]
    return !m || m.attempts === 0 ? 1 : m.mastered ? 2 : m.streak > 0 ? 0 : 1
  }
  const ranked = shuffle(pool, rng).sort((a, b) => tier(a) - tier(b) || (input.mastery[masteryKey('phoneme', a.id)]?.lastSeenAt ?? 0) - (input.mastery[masteryKey('phoneme', b.id)]?.lastSeenAt ?? 0))
  const used = new Set<string>()
  const take = (ok: (w: Word) => boolean): Word | undefined => {
    const w = ranked.find((x) => !used.has(x.id) && ok(x))
    if (w) used.add(w.id)
    return w
  }

  // Bara rimpar där båda orden ingår i listan: annars lagras behärskningen på ord som
  // levelItems aldrig räknar, och mätaren står stilla hur många rim barnet än klarar.
  const inPool = new Set(pool.map((w) => w.id))
  const pairs = input.rhymes.filter((p) => p.every((id) => byId.get(id)?.emoji && inPool.has(id)))
  const inPair = new Set(pairs.flat())
  const fillers = pool.filter((w) => !inPair.has(w.id))
  const rhymeTask = (i: number): Task | null => {
    const pair = shuffle(pairs, rng).find((p) => p.some((id) => !used.has(id)))
    if (!pair) return null
    // Målordet måste vara det oanvända i paret, annars kan samma ord bli rimmål två gånger i passet.
    const free = pair.filter((id) => !used.has(id))
    const target = free.length === 2 ? (rng() < 0.5 ? pair[0] : pair[1]) : free[0]
    const partner = pair.find((id) => id !== target) as string
    const w = byId.get(target) as Word
    used.add(target)
    const distract = shuffle((fillers.length >= 2 ? fillers : input.words.filter((x) => x.emoji !== '' && !inPair.has(x.id))).filter((f) => f.emoji !== w.emoji && f.emoji !== byId.get(partner)?.emoji && rhymeKey(f.text) !== rhymeKey(w.text)), rng)
      .filter((f, k, arr) => arr.findIndex((x) => x.emoji === f.emoji) === k)
      .slice(0, DISTRACTOR_POOL)
    if (distract.length < 2) return null
    return { id: `r${i}-${target}`, game: 'rhyme-hunt', targetId: target, kind: 'phoneme', options: [partner, ...distract.map((d) => d.id)], answer: partner, isReview: false }
  }

  /** Bokstavsalternativ: andra ljud som finns i samma position i andra ord, men inte i målordet. */
  const letterTask = (i: number, first: boolean): Task | null => {
    const at = (x: Word) => (first ? x.sounds[0] : x.sounds[x.sounds.length - 1])
    const w = take((x) => known(at(x)))
    if (!w) return null
    const answer = at(w)
    const others = [...new Set(pool.map(at))].filter((s) => s !== answer && !w.sounds.includes(s) && known(s))
    const picks = shuffle(others, rng).slice(0, DISTRACTOR_POOL)
    if (picks.length < 2) return null
    return { id: `${first ? 'f' : 'l'}${i}-${w.id}`, game: first ? 'first-sound' : 'last-sound', targetId: w.id, kind: 'phoneme', options: [answer, ...picks], answer, isReview: false }
  }

  const countTask = (i: number): Task | null => {
    const w = take((x) => countable.includes(x))
    if (!w) return null
    const n = w.sounds.length
    const opts = [...new Set([n, n === 2 ? 4 : n - 1, n + 1])].filter((x) => x >= 2).slice(0, 3)
    return { id: `n${i}-${w.id}`, game: 'count-sounds', targetId: w.id, kind: 'phoneme', options: opts.sort((a, b) => a - b).map(String), answer: String(n), isReview: false }
  }

  const order = (opts.order ?? PHONOLOGY_ORDER).filter((g) => games.includes(g))
  if (order.length === 0) return []
  const tasks: Task[] = []
  const start = Math.floor(rng() * order.length)
  for (let i = 0; tasks.length < opts.count && i < Math.max(opts.count * 3, order.length); i++) {
    const g = order[(start + i) % order.length]
    const t = g === 'rhyme-hunt' ? rhymeTask(i) : g === 'count-sounds' ? countTask(i) : g === 'sound-riddle' ? riddleTask(input, pool.filter((w) => w.sounds.every(known)), used, rng, i) : letterTask(i, g === 'first-sound')
    if (t) tasks.push(t)
  }
  return tasks
}

/** Startrampen: fyra ljudlekar över planetens kurerade ordlista (alla med bild). */
export function buildPhonology(input: BuildInput, games: GameId[], rng: Rng): Task[] {
  const byId = new Map(input.words.map((w) => [w.id, w]))
  const curated = (input.level.words ?? []).map((id) => byId.get(id)).filter((w): w is Word => !!w && w.emoji !== '')
  const pool = curated.length ? curated : input.words.filter((w) => w.emoji !== '')
  return phonologyTasks(input, games, rng, { pool, count: input.count })
}

/** Ord med bild som innehåller exakt en av planetens två bokstäver (t.ex. m eller n, inte båda). */
export function contrastWords(level: Level, words: Word[]): Word[] {
  const [a, b] = level.letters
  return words.filter((w) => w.emoji !== '' && w.sounds.includes(a) !== w.sounds.includes(b))
}

/**
 * Tvillingplaneten (m/n) och Spegelplaneten (b/d). Varje uppgift ger sammanhang: ett ensamt nasalljud
 * går inte att avgöra utan något att jämföra med, så bokstaven visas eller ordet hörs. Passet blandar
 * Ljudsortering (hör ordet, välj bokstav, båda bokstäverna syns), omvänd sortering
 * (se bokstaven, välj bilden vars ord har ljudet), Bygg ordet med både m och n bland brickorna,
 * Ljudtåget och Vilket ord? med m-/n-ord. Läsuppgifterna använder bara ord med kända bokstäver.
 */
export function buildContrast(input: BuildInput, games: GameId[], rng: Rng): Task[] {
  const { level, mastery } = input
  const [a, b] = level.letters
  const other = (w: Word) => (w.sounds.includes(a) ? b : a)
  const introduced = new Set<string>(level.letters)
  const levelIndex = input.levels.findIndex((l) => l.id === level.id)
  input.levels.slice(0, Math.max(0, levelIndex)).forEach((l) => l.letters.forEach((x) => introduced.add(x)))
  for (const m of Object.values(mastery)) if (m.kind === 'letter' && m.attempts > 0) introduced.add(m.id)
  const pool = contrastWords(level, input.words)
  const readable = pool.filter((w) => !w.noBlend && w.decodable && w.sounds.every((x) => introduced.has(x)))
  const tier = (w: Word) => {
    const m = mastery[masteryKey('contrast', w.id)]
    return !m || m.attempts === 0 ? 1 : m.mastered ? 2 : m.streak > 0 ? 0 : 1
  }
  const ranked = shuffle(pool, rng).sort((x, y) => tier(x) - tier(y) || (mastery[masteryKey('contrast', x.id)]?.lastSeenAt ?? 0) - (mastery[masteryKey('contrast', y.id)]?.lastSeenAt ?? 0))
  const withA = ranked.filter((w) => w.sounds.includes(a))
  const withB = ranked.filter((w) => w.sounds.includes(b))
  const nextWord = (i: number) => {
    const first = i % 2 === 0 ? withA : withB
    const second = first === withA ? withB : withA
    return (first.length ? first : second).shift()
  }
  const tasks: Task[] = []
  const sorts: Task[] = []
  const has = (g: GameId) => games.includes(g)
  let n = 0
  const pictures = readable.length ? readable : pool
  /** Bilddistraktorer: ord med den andra bokstaven först (svårast), sedan övriga. */
  const pictureDistractors = (w: Word) => {
    const cands = pictures.filter((x) => x.id !== w.id && x.emoji !== w.emoji)
    return [...shuffle(cands.filter((x) => x.sounds.includes(other(w))), rng), ...shuffle(cands.filter((x) => !x.sounds.includes(other(w))), rng)].slice(0, DISTRACTOR_POOL)
  }
  if (has('build-word') && readable.length) {
    const w = shuffle(readable, rng)[0]
    const extra = shuffle([...introduced].filter((x) => !w.sounds.includes(x) && x !== other(w)), rng)[0]
    tasks.push({ id: `b-${w.id}`, game: 'build-word', targetId: w.id, kind: 'word', options: shuffle([...w.sounds, other(w), ...(extra ? [extra] : [])], rng), isReview: false })
  }
  if (has('sound-train') && readable.length) {
    const w = shuffle(readable, rng)[0]
    const others = pictureDistractors(w)
    if (others.length >= 2) tasks.push({ id: `t-${w.id}`, game: 'sound-train', targetId: w.id, kind: 'word', options: [w.id, ...others.map((x) => x.id)], isReview: false })
  }
  if (has('read-word') && readable.length >= 3) {
    // Viktigast för b/d: ordet står skrivet och måste läsas, ingen ledtråd i örat.
    const w = shuffle(readable, rng)[0]
    const others = pictureDistractors(w)
    if (others.length >= 2) tasks.push({ id: `d-${w.id}`, game: 'read-word', targetId: w.id, kind: 'word', options: [w.id, ...others.map((x) => x.id)], isReview: false })
  }
  if (has('which-word') && readable.length >= 3) {
    const w = shuffle(readable, rng)[0]
    const cands = readable.filter((x) => x.id !== w.id)
    const others = [...shuffle(cands.filter((x) => x.sounds.includes(other(w))), rng), ...shuffle(cands.filter((x) => !x.sounds.includes(other(w))), rng)].slice(0, DISTRACTOR_POOL)
    tasks.push({ id: `w-${w.id}`, game: 'which-word', targetId: w.id, kind: 'word', options: [w.id, ...others.map((x) => x.id)], isReview: false })
  }
  if (has('sound-sort')) {
    // Omvänd sortering: bokstaven visas, välj bland bilder den vars ord har ljudet.
    const w = nextWord(n++)
    if (w) {
      const distractors = shuffle(pool.filter((x) => x.sounds.includes(other(w)) && x.emoji !== w.emoji), rng).slice(0, DISTRACTOR_POOL)
      if (distractors.length >= 2) sorts.push({ id: `r-${w.id}`, game: 'sound-sort', targetId: w.id, kind: 'contrast', options: [w.id, ...distractors.map((x) => x.id)], answer: w.id, letter: w.sounds.includes(a) ? a : b, isReview: false })
    }
    while (tasks.length + sorts.length < input.count) {
      const x = nextWord(n++)
      if (!x) break
      sorts.push({ id: `s-${x.id}`, game: 'sound-sort', targetId: x.id, kind: 'contrast', options: [a, b], answer: x.sounds.includes(a) ? a : b, isReview: false })
    }
  }
  // Sorteringarna först och varvade med läsuppgifterna: de visar båda bokstäverna sida vid sida.
  const rest = shuffle(tasks, rng)
  const out: Task[] = []
  const sortQueue = shuffle(sorts, rng)
  while (sortQueue.length || rest.length) {
    if (sortQueue.length) out.push(sortQueue.shift() as Task)
    if (rest.length) out.push(rest.shift() as Task)
  }
  return out.slice(0, input.count)
}
