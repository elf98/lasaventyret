import { describe, expect, it } from 'vitest'
import { letters, levels, phrases, rhymes, sentences, sightwords, stories, words } from '../../content'
import { rhymeKey } from '../kindBuilders'
import { applyResult, masteryKey, newItem } from '../mastery'
import { seeded } from '../random'
import { buildSession, type BuildInput } from '../sessionBuilder'
import type { MasteryItem } from '../types'
import { levelProgress, unlockedLevels } from '../unlock'

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

  it('Sagoplaneten fyller passet: en berättelse väger tre uppgifter', () => {
    const tasks = build('sagoplaneten')
    const stories = tasks.filter((t) => t.game === 'story')
    const sentences = tasks.filter((t) => t.game === 'silly-sentences')
    expect(stories).toHaveLength(3)
    // Tre berättelser à tre uppgifters tid plus meningarna ska motsvara ett helt pass.
    expect(stories.length * 3 + sentences.length).toBeGreaterThanOrEqual(8)
    expect(new Set(stories.map((t) => t.targetId)).size).toBe(stories.length)
    const st = stories[0]
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
      }
      // Bildspel kräver att det finns bildord att välja bland – men enskilda ord får sakna bild,
      // passbyggaren ger dem bara uppgifter som fungerar utan (Ljudtåget, Bygg ordet, Vilket ord?).
      if (l.games.includes('read-word') && (l.words ?? []).length) {
        expect((l.words ?? []).some((id) => words.find((x) => x.id === id)?.emoji), `${l.id} har inget bildord`).toBe(true)
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

describe('bildlösa ord', () => {
  it('ord utan bild hamnar aldrig i ett spel som kräver bild', () => {
    const needsPicture = ['read-word', 'rhyme-hunt', 'first-sound', 'last-sound', 'count-sounds']
    for (const l of levels.filter((x) => (x.words ?? []).some((id) => !words.find((w) => w.id === id)?.emoji))) {
      for (let seed = 1; seed <= 6; seed++) {
        for (const t of build(l.id, { rng: seeded(seed) })) {
          if (!needsPicture.includes(t.game)) continue
          expect(words.find((w) => w.id === t.targetId)?.emoji, `${l.id}: ${t.targetId} i ${t.game}`).toBeTruthy()
        }
      }
    }
  })
})

describe('vokallängd', () => {
  it('minimala par pekar på varandra och skiljer sig bara i dubbelteckningen', () => {
    const pairs = words.filter((w) => w.pair)
    expect(pairs.length).toBeGreaterThanOrEqual(10)
    for (const w of pairs) {
      const p = words.find((x) => x.id === w.pair)
      expect(p, `${w.id} pekar på ${w.pair} som inte finns`).toBeDefined()
      expect(p!.pair, `${w.pair} pekar inte tillbaka på ${w.id}`).toBe(w.id)
      expect(Math.abs(p!.text.length - w.text.length), `${w.id}/${w.pair}`).toBe(1)
    }
  })

  it('Vilket ord? sätter alltid partnern bland alternativen', () => {
    const tasks = build('dubbelplaneten', { rng: seeded(5), count: 12 }).filter((t) => t.game === 'which-word')
    expect(tasks.length).toBeGreaterThan(0)
    for (const t of tasks) {
      const w = words.find((x) => x.id === t.targetId)!
      if (w.pair) expect(t.options, `${w.id} saknar ${w.pair}`).toContain(w.pair)
    }
  })
})

describe('fraser', () => {
  it('varje fras används någonstans, och varje använd fras finns', async () => {
    // Fraser som blir kvar när ett spel ändras ger ljudfiler som aldrig spelas och listor som växer.
    const fs = await import('node:fs')
    const path = await import('node:path')
    const read = (dir: string): string =>
      fs.readdirSync(dir, { withFileTypes: true }).reduce((acc, e) => {
        const full = path.join(dir, e.name)
        if (e.isDirectory()) return acc + read(full)
        return e.name.endsWith('.ts') || e.name.endsWith('.tsx') ? acc + fs.readFileSync(full, 'utf8') : acc
      }, '')
    const code = read(path.resolve(__dirname, '../..'))
    // praise_/poke_/stars_ byggs ihop dynamiskt och kan inte hittas som textsträngar.
    const dynamic = /^(praise_|poke_|stars_)/
    for (const key of Object.keys(phrases)) {
      if (dynamic.test(key)) continue
      expect(code.includes(`'${key}'`), `frasen ${key} används inte längre`).toBe(true)
    }
    for (const m of code.matchAll(/phraseId\('([a-z_0-9]+)'\)/g)) {
      expect(phrases[m[1]], `koden använder frasen ${m[1]} som inte finns`).toBeDefined()
    }
  })
})

describe('ljudmanifestet', () => {
  it('varje post har en fil och varje fil en post', async () => {
    // Ett manifest som lovar ljud vars fil saknas ger tyst paus i appen i stället för tal.
    const fs = await import('node:fs')
    const path = await import('node:path')
    const dir = path.resolve(__dirname, '../../../public/audio')
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as { items: Record<string, { file: string }> }
    const files = new Set(fs.readdirSync(dir))
    const used = new Set<string>()
    for (const [id, item] of Object.entries(manifest.items)) {
      expect(files.has(item.file), `${id} saknar filen ${item.file}`).toBe(true)
      used.add(item.file)
    }
    for (const f of files) {
      if (f === 'manifest.json') continue
      expect(used.has(f), `${f} finns men ingen post pekar på den`).toBe(true)
    }
  })
})

describe('omvänd ljudsortering', () => {
  it('bär med sig planetens bokstav i stället för att gissa den ur ordet', () => {
    for (const id of ['tvillingplaneten', 'spegelplaneten', 'prickplaneten', 'bubbelplaneten', 'trumplaneten', 'gokplaneten']) {
      const pair = levels.find((l) => l.id === id)!.letters
      for (let seed = 1; seed <= 8; seed++) {
        const reverse = build(id, { rng: seeded(seed) }).filter((t) => t.game === 'sound-sort' && t.answer === t.targetId)
        for (const t of reverse) {
          const w = words.find((x) => x.id === t.targetId)!
          expect(t.letter, `${id}: ${t.targetId} saknar bokstav`).toBeDefined()
          // Bokstaven måste vara planetens egen, och finnas i målordet.
          expect(pair).toContain(t.letter)
          expect(w.sounds).toContain(t.letter)
          for (const other of t.options.filter((x) => x !== t.targetId)) {
            expect(words.find((x) => x.id === other)!.sounds, `${other} har också ${t.letter}`).not.toContain(t.letter)
          }
        }
      }
    }
  })
})

describe('mätaren och repetitionen', () => {
  it('mätaren når 100 % först när planeten faktiskt kan bli klar', () => {
    // Ett rätt på varje mening ska inte ge full mätare: då stod den på 100 % pass efter pass
    // medan noll var behärskade och nästa planet aldrig öppnade.
    const lvl = lvl0('smameningar')
    const mastery: Record<string, MasteryItem> = {}
    for (const id of lvl.sentences ?? []) {
      let m = newItem(id, 'sentence', 0)
      m = applyResult(m, true, 'p1', 1)
      mastery[masteryKey('sentence', id)] = m
    }
    const p = levelProgress(lvl, mastery)
    expect(p.mastered).toBe(0)
    expect(p.complete).toBe(false)
    expect(p.partial).toBeLessThan(1)
  })

  it('repetitionsord använder bara bokstäver barnet mött', () => {
    const early = lvl0('marsverkstan')
    const seen = new Set(levels.slice(0, levels.findIndex((l) => l.id === early.id) + 1).flatMap((l) => l.letters))
    const mastery: Record<string, MasteryItem> = {}
    // Gör ett tidigt ord förfallet så att repetitionen plockar in det.
    for (const id of ['sol', 'is', 'mor']) {
      let m = newItem(id, 'word', 0)
      m = applyResult(m, true, 'p1', 1)
      m = applyResult(m, true, 'p2', 2)
      mastery[masteryKey('word', id)] = m
    }
    for (const x of seen) {
      let m = newItem(x, 'letter', 0)
      m = applyResult(m, true, 'p1', 1)
      mastery[x] = m
    }
    for (let seed = 1; seed <= 10; seed++) {
      for (const t of build('marsverkstan', { mastery, rng: seeded(seed), now: 10 * 86_400_000 })) {
        // Bara Vilket ord? visar alternativen som text; i Läs och välj är de bilder.
        if (!t.isReview || t.game !== 'which-word') continue
        for (const id of t.options) {
          const w = words.find((x) => x.id === id)
          if (!w) continue
          for (const s of w.sounds) expect(seen.has(s), `repetition visar ${w.text} med okänd bokstav ${s}`).toBe(true)
        }
      }
    }
  })
})

describe('upplåsning', () => {
  it('nästa planet öppnar när den föregående är halvvägs, inte först när den är klar', () => {
    const sol = lvl0('solplaneten')
    const none: Record<string, MasteryItem> = {}
    expect(unlockedLevels(levels, [], none)).not.toContain('manen')
    // Två av fyra bokstäver behärskade = halvvägs.
    const half: Record<string, MasteryItem> = {}
    for (const x of sol.letters.slice(0, 2)) {
      let m = newItem(x, 'letter', 0)
      m = applyResult(m, true, 'p1', 1)
      m = applyResult(m, true, 'p1', 2)
      m = applyResult(m, true, 'p2', 3)
      half[x] = m
    }
    expect(levelProgress(sol, half).complete).toBe(false)
    expect(unlockedLevels(levels, [], half)).toContain('manen')
    // men inte planeten efter den
    expect(unlockedLevels(levels, [], half)).not.toContain('marsverkstan')
  })
})
