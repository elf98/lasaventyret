import { describe, expect, it } from 'vitest'
import { levels, rhymes, sentences, sightwords, stories, words } from '../../content'
import { seeded } from '../random'
import { buildSession, type BuildInput } from '../sessionBuilder'

const ALL: BuildInput['availableGames'] = ['catch-sound', 'sound-train', 'build-word', 'which-word', 'sight-memory', 'rhyme-hunt', 'silly-sentences', 'story']
const lvl = (id: string) => levels.find((l) => l.id === id)!
const build = (levelId: string, over: Partial<BuildInput> = {}) =>
  buildSession({ level: lvl(levelId), levels, mastery: {}, words, sightwords, sentences, stories, rhymes, now: 0, count: 8, reviewShare: 0.25, availableGames: ALL, difficulty: 'normal', rng: seeded(3), ...over })

describe('planeter med andra slag', () => {
  it('Ordplaneten varvar Vilket ord? och memory med tre ordbilder', () => {
    const tasks = build('ordplaneten')
    expect(tasks).toHaveLength(8)
    expect(tasks.some((t) => t.game === 'which-word')).toBe(true)
    expect(tasks.some((t) => t.game === 'sight-memory')).toBe(true)
    for (const t of tasks) {
      expect(t.kind).toBe('sightword')
      expect(t.options).toHaveLength(3)
      expect(t.options).toContain(t.targetId)
    }
  })

  it('Tokplaneten ger unika meningar med rätt bild bland alternativen', () => {
    const tasks = build('tokplaneten')
    expect(tasks).toHaveLength(8)
    expect(new Set(tasks.map((t) => t.targetId)).size).toBe(8)
    for (const t of tasks) {
      expect(t.game).toBe('silly-sentences')
      expect(t.options).toContain(t.answer)
      expect(t.options).toHaveLength(3)
    }
  })

  it('Sagoplaneten ger två berättelser varvade med meningar', () => {
    const tasks = build('sagoplaneten')
    expect(tasks.filter((t) => t.game === 'story')).toHaveLength(2)
    expect(tasks.filter((t) => t.game === 'silly-sentences')).toHaveLength(2)
    const st = tasks.find((t) => t.game === 'story')!
    expect(Number(st.answer)).toBeLessThan(st.options.length)
  })

  it('Startrampen ger rim med partnern bland tre bilder', () => {
    const tasks = build('startrampen')
    expect(tasks.length).toBeGreaterThanOrEqual(6)
    for (const t of tasks) {
      expect(t.game).toBe('rhyme-hunt')
      expect(t.options).toContain(t.answer)
      expect(t.options).toHaveLength(3)
      expect(rhymes.some((p) => p.includes(t.targetId) && p.includes(t.answer!))).toBe(true)
    }
  })

  it('Verkstan kör bara ordspel på klusterord', () => {
    const tasks = build('verkstan')
    expect(tasks.length).toBeGreaterThan(0)
    for (const t of tasks) {
      expect(t.kind).toBe('word')
      expect(words.find((w) => w.id === t.targetId)!.decodable).toBe(false)
    }
  })

  it('svår nivå ger fler ord än lätt på Kometen', () => {
    const easy = build('kometen', { difficulty: 'easy' }).filter((t) => t.kind === 'word').length
    const hard = build('kometen', { difficulty: 'hard' }).filter((t) => t.kind === 'word').length
    expect(hard).toBeGreaterThan(easy)
  })
})
