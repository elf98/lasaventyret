import { describe, expect, it } from 'vitest'
import { levels, rhymes, sentences, sightwords, stories, words } from '../../content'
import { applyResult, masteryKey, newItem } from '../mastery'
import { seeded } from '../random'
import { buildSession, type BuildInput } from '../sessionBuilder'
import type { MasteryItem } from '../types'
import { levelProgress, unlockedLevels } from '../unlock'

const sol = levels.find((l) => l.id === 'solplaneten')!
const manen = levels.find((l) => l.id === 'manen')!
const ALL: BuildInput['availableGames'] = ['catch-sound', 'sound-train', 'build-word']

function mastered(id: string): MasteryItem {
  let m = newItem(id, 'letter', 0)
  m = applyResult(m, true, 'a', 1)
  m = applyResult(m, true, 'b', 2)
  m = applyResult(m, true, 'c', 3)
  return m
}

function build(over: Partial<BuildInput>): ReturnType<typeof buildSession> {
  return buildSession({ level: sol, levels, mastery: {}, words, sightwords, sentences, stories, rhymes, now: 0, count: 8, reviewShare: 0.25, availableGames: ALL, difficulty: 'easy', rng: seeded(1), ...over })
}

describe('buildSession', () => {
  it('första passet: rätt antal, alla nivåns bokstäver, ~25 % ord', () => {
    const tasks = build({})
    expect(tasks).toHaveLength(8)
    const letterTasks = tasks.filter((t) => t.kind === 'letter')
    const wordTasks = tasks.filter((t) => t.kind === 'word')
    expect(wordTasks.length).toBe(2)
    for (const l of sol.letters) expect(letterTasks.some((t) => t.targetId === l)).toBe(true)
    for (const t of letterTasks) {
      expect(t.options).toContain(t.targetId)
      expect(new Set(t.options).size).toBe(t.options.length)
    }
    // orden använder bara kända bokstäver
    for (const t of wordTasks) {
      const w = words.find((x) => x.id === t.targetId)!
      expect(w.sounds.every((s) => sol.letters.includes(s))).toBe(true)
    }
  })

  it('ordandelen växer när bokstäverna behärskas, men inga upprepningar och max två stavelser', () => {
    const mastery: Record<string, MasteryItem> = {}
    for (const l of sol.letters) mastery[l] = mastered(l)
    const tasks = build({ mastery })
    const wordTasks = tasks.filter((t) => t.kind === 'word')
    // Solplaneten har ett bildord (sol) och inga stavelser utan bild (os/so togs bort som obegripliga)
    const pool = words.filter((w) => w.decodable && w.sounds.every((s) => sol.letters.includes(s)))
    const expected = Math.min(pool.filter((w) => w.emoji !== '').length + Math.min(2, pool.filter((w) => w.emoji === '').length), 6)
    expect(wordTasks.length).toBe(expected)
    expect(new Set(wordTasks.map((t) => t.targetId)).size).toBe(wordTasks.length)
    const syllables = wordTasks.filter((t) => words.find((w) => w.id === t.targetId)!.emoji === '')
    expect(syllables.length).toBeLessThanOrEqual(2)
    expect(tasks).toHaveLength(8)
  })

  it('bygg ordet får brickor med ordets ljud plus distraktorer, ljudtåget får bildval', () => {
    const mastery: Record<string, MasteryItem> = {}
    for (const l of [...sol.letters, ...manen.letters]) mastery[l] = mastered(l)
    const tasks = build({ level: manen, mastery, count: 10 })
    const bw = tasks.find((t) => t.game === 'build-word')
    expect(bw).toBeDefined()
    const w = words.find((x) => x.id === bw!.targetId)!
    for (const s of w.sounds) expect(bw!.options).toContain(s)
    expect(bw!.options.length).toBeGreaterThan(w.sounds.length)
    const st = tasks.find((t) => t.game === 'sound-train' && words.find((x) => x.id === t.targetId)!.emoji !== '')
    if (st) {
      expect(st.options[0]).toBe(st.targetId)
      expect(st.options.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('blandar in repetition från tidigare nivåer, förfallna först', () => {
    const mastery: Record<string, MasteryItem> = {}
    for (const l of sol.letters) mastery[l] = mastered(l)
    mastery.s.dueAt = 0
    const tasks = build({ level: manen, mastery, now: 10, rng: seeded(2) })
    const review = tasks.filter((t) => t.isReview)
    expect(review.length).toBe(2)
    for (const r of review) expect(sol.letters).toContain(r.targetId)
    expect(review.some((r) => r.targetId === 's')).toBe(true)
  })

  it('ordbehärskning lagras under prefix så att ord och bokstav inte krockar', () => {
    expect(masteryKey('letter', 'ö')).toBe('ö')
    expect(masteryKey('word', 'ö')).toBe('w:ö')
  })

  it('returnerar tomt när nivåns spel inte finns', () => {
    expect(build({ availableGames: [] })).toEqual([])
  })
})

describe('buildSession på en senare planet', () => {
  it('använder tidigare planeters bokstäver till ord även utan träning', () => {
    const kometen = levels.find((l) => l.id === 'kometen')!
    const tasks = build({ level: kometen, rng: seeded(5) })
    const wordTasks = tasks.filter((t) => t.kind === 'word')
    expect(wordTasks.length).toBeGreaterThanOrEqual(2)
    for (const t of wordTasks) {
      const w = words.find((x) => x.id === t.targetId)!
      expect(w.sounds.some((s) => kometen.letters.includes(s))).toBe(true)
    }
  })
})

describe('unlock', () => {
  it('låser upp nästa planet när 80 % är behärskat', () => {
    const mastery: Record<string, MasteryItem> = {}
    // Startrampen är bonus (kräver inget), Solplaneten är första riktiga planeten
    expect(unlockedLevels(levels, [])).toEqual(['startrampen', 'solplaneten'])
    for (const l of sol.letters) mastery[l] = mastered(l)
    expect(levelProgress(sol, mastery).complete).toBe(true)
    expect(unlockedLevels(levels, ['solplaneten'])).toEqual(['startrampen', 'solplaneten', 'manen'])
  })
})
