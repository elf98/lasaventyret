import { describe, expect, it } from 'vitest'
import { letters, levels, rhymes, sentences, sightwords, stories, words } from '../../content'
import { rhymeKey } from '../kindBuilders'
import { seeded } from '../random'
import { buildSession, type BuildInput } from '../sessionBuilder'

const ALL: BuildInput['availableGames'] = ['catch-sound', 'sound-sort', 'read-word', 'first-sound', 'last-sound', 'count-sounds', 'sound-train', 'build-word', 'which-word', 'sight-memory', 'rhyme-hunt', 'silly-sentences', 'story']
const lvl = (id: string) => levels.find((l) => l.id === id)!
const lvl0 = lvl
const build = (levelId: string, over: Partial<BuildInput> = {}) =>
  buildSession({ level: lvl(levelId), levels, mastery: {}, words, sightwords, sentences, stories, rhymes, now: 0, count: 8, reviewShare: 0.25, availableGames: ALL, difficulty: 'normal', rng: seeded(3), ...over })

describe('planeter med andra slag', () => {
  it('Ordplaneten: mest Vilket ord? med fyra alternativ, ett memory med fyra par per pass', () => {
    const tasks = build('ordplaneten')
    expect(tasks).toHaveLength(8)
    expect(tasks.filter((t) => t.game === 'which-word')).toHaveLength(7)
    expect(tasks.filter((t) => t.game === 'sight-memory')).toHaveLength(1)
    for (const t of tasks) {
      expect(t.kind).toBe('sightword')
      expect(t.options).toHaveLength(4)
      expect(new Set(t.options).size).toBe(4)
      expect(t.options).toContain(t.targetId)
    }
    // lätt nivå: tre alternativ och två memory
    const easy = build('ordplaneten', { difficulty: 'easy' })
    expect(easy.filter((t) => t.game === 'sight-memory')).toHaveLength(2)
    for (const t of easy.filter((t) => t.game === 'which-word')) expect(t.options).toHaveLength(3)
  })

  it('Tvillingplaneten ger alltid sammanhang: inga ensamma bokstavsljud att gissa på', () => {
    const tasks = build('tvillingplaneten')
    expect(tasks).toHaveLength(8)
    // Fånga ljudet spelar ett ensamt m/n utan jämförelse – omöjligt att avgöra, ska inte förekomma.
    expect(tasks.some((t) => t.game === 'catch-sound')).toBe(false)
    expect(new Set(tasks.map((t) => t.game)).size).toBeGreaterThanOrEqual(3)
    const sorts = tasks.filter((t) => t.game === 'sound-sort')
    expect(sorts.length).toBeGreaterThanOrEqual(3)
    for (const t of sorts) {
      expect(t.kind).toBe('contrast')
      const w = words.find((x) => x.id === t.targetId)!
      expect(w.emoji).not.toBe('')
      expect(w.sounds.includes('m')).not.toBe(w.sounds.includes('n'))
      if (t.options.includes('m')) expect(t.answer).toBe(w.sounds.includes('m') ? 'm' : 'n')
      else {
        expect(t.options).toHaveLength(3)
        expect(t.answer).toBe(t.targetId)
        for (const id of t.options.filter((x) => x !== t.targetId)) expect(words.find((x) => x.id === id)!.sounds.includes(w.sounds.includes('m') ? 'n' : 'm')).toBe(true)
      }
    }
    for (const t of tasks.filter((x) => x.game === 'build-word')) {
      const w = words.find((x) => x.id === t.targetId)!
      expect(t.options).toContain(w.sounds.includes('m') ? 'n' : 'm')
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

  it('Startrampen blandar fyra ljudlekar, alla räknas som hörövning', () => {
    const tasks = build('startrampen')
    expect(tasks.length).toBeGreaterThanOrEqual(6)
    expect(new Set(tasks.map((t) => t.game)).size).toBeGreaterThanOrEqual(3)
    for (const t of tasks) {
      expect(t.kind).toBe('phoneme')
      expect(t.options).toContain(t.answer)
      const w = words.find((x) => x.id === t.targetId)!
      expect(w.emoji).not.toBe('')
      if (t.game === 'rhyme-hunt') {
        expect(rhymes.some((p) => p.includes(t.targetId) && p.includes(t.answer!))).toBe(true)
        for (const o of t.options.filter((x) => x !== t.answer)) expect(rhymeKey(words.find((x) => x.id === o)!.text)).not.toBe(rhymeKey(w.text))
      } else if (t.game === 'first-sound' || t.game === 'last-sound') {
        expect(t.options).toHaveLength(3)
        expect(t.answer).toBe(t.game === 'first-sound' ? w.sounds[0] : w.sounds[w.sounds.length - 1])
        // fel bokstäver får inte finnas i ordet alls
        for (const o of t.options.filter((x) => x !== t.answer)) expect(w.sounds).not.toContain(o)
      } else {
        expect(t.game).toBe('count-sounds')
        expect(Number(t.answer)).toBe(w.sounds.length)
        expect(w.decodable).toBe(true)
        for (const o of t.options) expect(Number(o)).toBeGreaterThanOrEqual(2)
      }
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

describe('rimpar', () => {
  it('alla par i rhymes.json rimmar (samma slut från sista vokalen)', () => {
    for (const [a, b] of rhymes) {
      const wa = words.find((w) => w.id === a)!
      const wb = words.find((w) => w.id === b)!
      expect(rhymeKey(wa.text), `${a}/${b}`).toBe(rhymeKey(wb.text))
    }
  })
})

describe('nivådata', () => {
  it('ordplaneter pekar på ord som finns och har bild, meningsurval finns, krav-kedjan är hel', () => {
    for (const l of levels) {
      for (const id of l.words ?? []) {
        const w = words.find((x) => x.id === id)
        expect(w, `${l.id}: ${id}`).toBeDefined()
        // Bild krävs bara där ett bildspel används; vardagsord som "har" har ingen bild.
        if (l.games.includes('read-word')) expect(w!.emoji, `${l.id}: ${id} saknar bild`).not.toBe('')
      }
      for (const id of l.sentences ?? []) expect(sentences.some((s) => s.id === id), `${l.id}: ${id}`).toBe(true)
      for (const r of l.requires) expect(levels.findIndex((x) => x.id === r), `${l.id} kräver ${r}`).toBeLessThan(levels.findIndex((x) => x.id === l.id))
    }
    const listed = new Set(levels.flatMap((l) => l.sentences ?? []))
    for (const s of sentences) expect(listed.has(s.id), `meningen ${s.id} finns inte på någon planet`).toBe(true)
  })
})

describe('ordbilder och vardagsord', () => {
  it('ordbildslistan innehåller bara ord som inte låter som de stavas', () => {
    // Ljudenliga ord ska avkodas (Vardagsplaneten), inte memoreras som helhetsbilder.
    const decodableLooking = ['du', 'en', 'ett', 'har', 'inte', 'på', 'vi', 'hon', 'han', 'kan', 'ska', 'till', 'med', 'här', 'nu']
    for (const w of sightwords) expect(decodableLooking, `${w.text} är ljudenligt och hör hemma bland orden`).not.toContain(w.text)
  })

  it('Vardagsplaneten kör ord utan bild i flera spel, aldrig i Läs och välj', () => {
    const lvl = lvl0('vardagsplaneten')
    expect(lvl.games).not.toContain('read-word')
    const tasks = build('vardagsplaneten')
    expect(tasks).toHaveLength(8)
    expect(new Set(tasks.map((t) => t.game)).size).toBeGreaterThan(1)
    for (const t of tasks) {
      expect(lvl.words).toContain(t.targetId)
      expect(['sound-train', 'build-word', 'which-word']).toContain(t.game)
    }
  })
})

describe('bilderna', () => {
  it('inga två ord delar bild, och varje bokstavs exempelord finns', () => {
    // Två ord med samma bild gör bildvalet omöjligt: barnet kan läsa rätt och ändå välja "fel" ruta.
    const seen = new Map<string, string>()
    for (const w of words.filter((x) => x.emoji !== '')) {
      expect(seen.has(w.emoji), `${w.id} delar bild med ${seen.get(w.emoji)}`).toBe(false)
      seen.set(w.emoji, w.id)
    }
    for (const l of letters) {
      const w = words.find((x) => x.id === l.example)
      expect(w, `bokstaven ${l.id} pekar på exempelordet ${l.example} som inte finns`).toBeDefined()
      expect(w!.sounds, `${l.example} innehåller inte ljudet ${l.id}`).toContain(l.id)
    }
  })

  it('Spegelplaneten blandar hörövning och läsning med b- och d-ord', () => {
    const tasks = build('spegelplaneten')
    expect(tasks).toHaveLength(8)
    expect(new Set(tasks.map((t) => t.game)).size).toBeGreaterThanOrEqual(3)
    expect(tasks.some((t) => t.game === 'read-word')).toBe(true)
    expect(tasks.some((t) => t.game === 'catch-sound')).toBe(false)
    for (const t of tasks.filter((x) => x.kind === 'contrast')) {
      const w = words.find((x) => x.id === t.targetId)!
      expect(w.sounds.includes('b')).not.toBe(w.sounds.includes('d'))
    }
  })
})

describe('berättelser och meningar', () => {
  it('varje berättelse har två frågor med giltigt svar och tre alternativ', () => {
    expect(stories.length).toBeGreaterThanOrEqual(10)
    for (const st of stories) {
      expect(st.sentences.length, st.id).toBeGreaterThanOrEqual(3)
      expect(st.questions.length, `${st.id} saknar andra frågan`).toBe(2)
      for (const q of st.questions) {
        expect(q.options.length, `${st.id}: ${q.text}`).toBe(3)
        expect(q.answer).toBeGreaterThanOrEqual(0)
        expect(q.answer).toBeLessThan(q.options.length)
        expect(new Set(q.options).size, `${st.id}: ${q.text} har dubbletter`).toBe(q.options.length)
      }
    }
  })

  it('varje mening har rätt bild bland tre olika alternativ', () => {
    expect(sentences.length).toBeGreaterThanOrEqual(40)
    for (const s of sentences) {
      expect(s.distractors.length, s.id).toBe(2)
      expect(new Set([s.picture, ...s.distractors]).size, `${s.id} har dubblerade bilder`).toBe(3)
      expect(s.text.endsWith('.'), s.id).toBe(true)
    }
  })
})
