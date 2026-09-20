import { describe, expect, it } from 'vitest'
import { levels, rhymes, sentences, sightwords, stories, templates, words, zones } from '../../content'
import { applyResult, masteryKey, newItem } from '../mastery'
import { optionCount, shownTask } from '../options'
import { seeded } from '../random'
import { buildSession, DECODING_BOOST_AT, type BuildInput } from '../sessionBuilder'
import { generateSentence, renderGenerated, templateKey } from '../templates'
import type { MasteryItem, Task } from '../types'
import { completedZones, CONTRAST_TRIGGER, isMain, isSidePath, levelProgress, sidePathLit, unlockedLevels } from '../unlock'

const ALL: BuildInput['availableGames'] = ['catch-sound', 'sound-sort', 'read-word', 'first-sound', 'last-sound', 'count-sounds', 'sound-train', 'build-word', 'which-word', 'sight-memory', 'rhyme-hunt', 'silly-sentences', 'story']
const lvl = (id: string) => levels.find((l) => l.id === id)!
const build = (levelId: string, over: Partial<BuildInput> = {}) =>
  buildSession({ level: lvl(levelId), levels, mastery: {}, words, sightwords, sentences, stories, rhymes, now: 0, count: 8, reviewShare: 0.25, availableGames: ALL, difficulty: 'normal', rng: seeded(3), ...over })

function mastered(id: string, kind: MasteryItem['kind'] = 'letter'): MasteryItem {
  let m = newItem(id, kind, 0)
  m = applyResult(m, true, 'a', 1)
  m = applyResult(m, true, 'b', 2)
  m = applyResult(m, true, 'c', 3)
  return m
}

/** Bokstäverna på alla planeter till och med den givna räknas som behärskade. */
function knownThrough(levelId: string): Record<string, MasteryItem> {
  const mastery: Record<string, MasteryItem> = {}
  for (const l of levels.slice(0, levels.findIndex((x) => x.id === levelId) + 1)) for (const x of l.letters) mastery[x] = mastered(x)
  return mastery
}

describe('A1: ljudlek invävd i passet', () => {
  it('bokstavsplaneter har exakt en ljudlek per pass, aldrig först, med bara kända bokstäver', () => {
    for (const id of ['manen', 'marsverkstan', 'kometen', 'ringplaneten', 'racerbanan']) {
      for (let seed = 1; seed <= 6; seed++) {
        const tasks = build(id, { rng: seeded(seed), mastery: knownThrough(id) })
        const phon = tasks.filter((t) => t.kind === 'phoneme')
        expect(phon, `${id} seed ${seed}`).toHaveLength(1)
        expect(tasks[0].kind).not.toBe('phoneme')
        expect(tasks).toHaveLength(8)
        const known = new Set(levels.slice(0, levels.findIndex((x) => x.id === id) + 1).flatMap((l) => l.letters))
        const t = phon[0]
        if (t.game === 'first-sound' || t.game === 'last-sound') for (const o of t.options) expect(known, `${id}: okänd bokstav ${o}`).toContain(o)
        if (t.game === 'count-sounds') for (const s of words.find((w) => w.id === t.targetId)!.sounds) expect(known).toContain(s)
      }
    }
  })

  it('ordplaneter har ljudlek tills Startrampen är klar, sedan inte', () => {
    const before = build('ordfabriken', { mastery: knownThrough('robotplaneten') })
    expect(before.filter((t) => t.kind === 'phoneme')).toHaveLength(1)
    const mastery = knownThrough('robotplaneten')
    for (const id of lvl('startrampen').words ?? []) mastery[masteryKey('phoneme', id)] = mastered(id, 'phoneme')
    expect(levelProgress(lvl('startrampen'), mastery).complete).toBe(true)
    const after = build('ordfabriken', { mastery })
    expect(after.filter((t) => t.kind === 'phoneme')).toHaveLength(0)
    expect(after).toHaveLength(8)
  })
})

describe('A2: tvillingplaneterna är sidovägar', () => {
  it('huvudkedjan går förbi dem, och de öppnar först efter tre förväxlingar av paret', () => {
    for (const l of levels.filter(isMain)) for (const r of l.requires) expect(isSidePath(lvl(r)), `${l.id} kräver sidovägen ${r}`).toBe(false)
    const mastery = knownThrough('marsverkstan')
    const completed = ['solplaneten', 'manen', 'marsverkstan']
    expect(unlockedLevels(levels, completed, mastery, {})).not.toContain('tvillingplaneten')
    expect(unlockedLevels(levels, completed, mastery, { 'm>n': 2 })).not.toContain('tvillingplaneten')
    expect(unlockedLevels(levels, completed, mastery, { 'm>n': 2, 'n>m': 1 })).toContain('tvillingplaneten')
    // men inte innan basplaneten är halvvägs
    expect(unlockedLevels(levels, [], {}, { 'm>n': 5 })).not.toContain('tvillingplaneten')
    // Kometen öppnar utan Tvillingplaneten
    expect(unlockedLevels(levels, completed, mastery, {})).toContain('kometen')
  })

  it('lyser vid nya förväxlingar utöver baslinjen, och slocknar när den spelats', () => {
    const l = lvl('spegelplaneten')
    expect(sidePathLit(l, { 'b>d': CONTRAST_TRIGGER }, {})).toBe(true)
    expect(sidePathLit(l, { 'b>d': CONTRAST_TRIGGER }, { spegelplaneten: CONTRAST_TRIGGER })).toBe(false)
    expect(sidePathLit(l, { 'b>d': CONTRAST_TRIGGER + 2, 'd>b': 1 }, { spegelplaneten: CONTRAST_TRIGGER })).toBe(true)
  })
})

describe('A3: avkodningen väger dubbelt från åtta kända bokstäver', () => {
  it('ren avkodning (Läs och välj + läs-först) är minst hälften av ordspelen på Marsverkstan och framåt', () => {
    let decoding = 0
    let wordTasks = 0
    for (const id of ['marsverkstan', 'kometen', 'ringplaneten', 'ordfabriken']) {
      for (let seed = 1; seed <= 8; seed++) {
        const tasks = build(id, { rng: seeded(seed), mastery: knownThrough(id) })
        for (const t of tasks.filter((x) => x.kind === 'word' && words.find((w) => w.id === x.targetId)?.emoji)) {
          wordTasks++
          if (t.game === 'read-word' || (t.game === 'which-word' && t.variant === 'read')) decoding++
        }
      }
    }
    expect(wordTasks).toBeGreaterThan(20)
    expect(decoding / wordTasks).toBeGreaterThanOrEqual(0.5)
  })

  it('läs-först-varianten kräver bild och kommer inte före boosten', () => {
    const early = build('manen', { mastery: knownThrough('manen') })
    expect(new Set([...lvl('solplaneten').letters, ...lvl('manen').letters]).size).toBeLessThan(DECODING_BOOST_AT + 1)
    expect(early.some((t) => t.variant === 'read')).toBe(false)
    for (let seed = 1; seed <= 6; seed++) {
      for (const t of build('kometen', { rng: seeded(seed), mastery: knownThrough('kometen') }).filter((x) => x.variant === 'read')) {
        expect(t.game).toBe('which-word')
        expect(words.find((w) => w.id === t.targetId)?.emoji).toBeTruthy()
      }
    }
  })
})

describe('A4: Meningsmaskinen', () => {
  it('genererar korrekta meningar med rätt artikel, unik bild och tre distraktorer', () => {
    const rng = seeded(9)
    for (const t of templates.templates) {
      for (let i = 0; i < 20; i++) {
        const g = generateSentence(t.id, rng)
        expect(g, t.id).not.toBeNull()
        const { sentence, options } = g!
        expect(options[0]).toBe(sentence.picture)
        expect(new Set(options).size).toBe(options.length)
        expect(options.length).toBeGreaterThanOrEqual(3)
        expect(sentence.text).toMatch(/^[A-ZÅÄÖ].*\.$/)
        // ett-ord får aldrig "en" före sig och tvärtom
        for (const m of sentence.text.matchAll(/\b(en|ett|En|Ett) ([a-zåäö]+)/g)) {
          const w = words.find((x) => x.text === m[2])
          expect(w, m[2]).toBeDefined()
          expect(m[1].toLowerCase(), sentence.text).toBe(templates.ett.includes(w!.id) ? 'ett' : 'en')
        }
        // återskapas ur id:t
        const back = renderGenerated(sentence.id)
        expect(back?.text).toBe(sentence.text)
        expect(back?.picture).toBe(sentence.picture)
      }
    }
  })

  it('passet ger åtta olika mallar och behärskningen lagras per mall', () => {
    const tasks = build('meningsmaskinen')
    expect(tasks).toHaveLength(8)
    expect(new Set(tasks.map((t) => t.targetId)).size).toBe(8)
    for (const t of tasks) {
      expect(t.kind).toBe('sentence')
      expect(t.targetId.startsWith('tpl:')).toBe(true)
      expect(renderGenerated(t.variant!)).not.toBeNull()
      expect(t.options[0]).toBe(t.answer)
    }
    // klar när hälften av mallarna sitter
    const mastery: Record<string, MasteryItem> = {}
    for (const t of templates.templates.slice(0, Math.ceil(templates.templates.length / 2))) mastery[masteryKey('sentence', templateKey(t.id))] = mastered(templateKey(t.id), 'sentence')
    expect(levelProgress(lvl('meningsmaskinen'), mastery).complete).toBe(true)
    // alla slot-ord finns och har bild
    for (const list of Object.values(templates.slots)) for (const id of list) expect(words.find((w) => w.id === id)?.emoji, id).toBeTruthy()
  })
})

describe('A7/G5: alternativen', () => {
  it('tre på lätt, fyra på medel och svår, ett till efter tre rätt i rad, ett färre vid kamp', () => {
    expect(optionCount('read-word', 'easy', 0, false)).toBe(3)
    expect(optionCount('read-word', 'normal', 0, false)).toBe(4)
    expect(optionCount('read-word', 'hard', 0, false)).toBe(4)
    expect(optionCount('read-word', 'normal', 3, false)).toBe(5)
    expect(optionCount('read-word', 'normal', 0, true)).toBe(3)
    expect(optionCount('read-word', 'easy', 0, true)).toBe(2)
    expect(optionCount('catch-sound', 'easy', 0, false)).toBe(4)
  })

  it('den visade uppgiften har rätt svar, de svåraste distraktorerna och blandad ordning', () => {
    const task: Task = { id: 't', game: 'read-word', targetId: 'sol', kind: 'word', options: ['sol', 'hard1', 'hard2', 'easy1', 'easy2'], isReview: false }
    const three = shownTask(task, 3, seeded(1))
    expect(three.options).toHaveLength(3)
    expect(three.options).toContain('sol')
    expect(three.options).toContain('hard1')
    expect(three.options).toContain('hard2')
    const five = shownTask(task, 5, seeded(1))
    expect(five.options).toHaveLength(5)
    // aldrig fler än det finns, aldrig färre än två
    expect(shownTask(task, 9, seeded(1)).options).toHaveLength(5)
    expect(shownTask(task, 1, seeded(1)).options).toHaveLength(2)
    // rätt svar hamnar inte alltid först
    const firsts = new Set(Array.from({ length: 20 }, (_, i) => shownTask(task, 4, seeded(i)).options[0]))
    expect(firsts.size).toBeGreaterThan(1)
    // brickor, memory och sagofrågor rörs inte
    const bw: Task = { ...task, game: 'build-word', options: ['s', 'o', 'l', 'a', 'm'] }
    expect(shownTask(bw, 3, seeded(1)).options).toEqual(bw.options)
    const sort: Task = { ...task, game: 'sound-sort', options: ['m', 'n'], answer: 'm' }
    expect(shownTask(sort, 4, seeded(1)).options).toEqual(['m', 'n'])
  })

  it('byggarna lägger alltid rätt svar först i valspelen', () => {
    for (const id of ['manen', 'kometen', 'ordplaneten', 'tvillingplaneten', 'startrampen', 'smameningar', 'ordfabriken']) {
      for (const t of build(id, { rng: seeded(4), mastery: knownThrough(id) })) {
        if (['build-word', 'sight-memory', 'story', 'count-sounds'].includes(t.game)) continue
        if (t.game === 'sound-sort' && t.letter === undefined) continue
        if (t.options.length === 0) continue
        expect(t.options[0], `${id}: ${t.game} ${t.targetId}`).toBe(t.answer ?? t.targetId)
      }
    }
  })

  it('tokiga meningar får en fjärde bild när båda delarna går att byta', () => {
    const tasks = build('smameningar')
    expect(tasks.filter((t) => t.options.length === 4).length).toBeGreaterThan(tasks.length / 2)
  })
})

describe('G2/G3: områden och raketdelar', () => {
  it('varje planet har område och replik, områdena täcker huvudkedjan i ordning', () => {
    for (const l of levels) {
      expect([1, 2, 3], l.id).toContain(l.zone)
      expect(l.line.length, l.id).toBeGreaterThan(10)
    }
    const main = levels.filter(isMain)
    for (let i = 1; i < main.length; i++) expect(main[i].zone).toBeGreaterThanOrEqual(main[i - 1].zone)
    for (const z of zones) expect(main.some((l) => l.zone === z.id), `område ${z.id} saknar planeter`).toBe(true)
    // ett område är klart när alla dess planeter i huvudkedjan är klara, sidovägarna räknas inte
    const zone1 = main.filter((l) => l.zone === 1).map((l) => l.id)
    expect(completedZones(levels, zone1)).toEqual([1])
    expect(completedZones(levels, zone1.slice(1))).toEqual([])
    expect(completedZones(levels, [...zone1, 'tvillingplaneten'])).toEqual([1])
  })
})
