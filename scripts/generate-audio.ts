/**
 * Förgenererar allt tal som MP3 med en neural svensk röst (Azure).
 *
 *   npm run audio            genererar det som saknas eller ändrats
 *   npm run audio:list       listar alla ljud-id och status
 *   npm run audio -- --force genererar om allt
 *   npm run audio -- --only phrase.   bara id:n som börjar så
 *
 * Läser src/content/*.json, skriver public/audio/<fil>.mp3 + manifest.json.
 * Manifestet hashar röst + SSML, så en ändrad text genereras om automatiskt.
 */
import 'dotenv/config'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config, letters, levels, mascots, names, phrases, sentences, sightwords, stories, tokenize, words } from '../src/content'
import { audioFileName, letterSoundId, levelGoalId, levelNameId, mascotIntroId, nameHelloId, nameId, phraseId, sentenceId, sightWordId, storyQuestionId, storySentenceId, storyTitleId, tokenId, wordId } from '../src/content/audioIds'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'public', 'audio')
const manifestPath = path.join(outDir, 'manifest.json')

const VOICE = process.env.AZURE_VOICE || 'sv-SE-SofieNeural'
const REGION = process.env.AZURE_SPEECH_REGION || 'swedencentral'
const KEY = process.env.AZURE_SPEECH_KEY || ''

interface Cut {
  /** 'tail' = behåll bara slutkonsonanten (m ur "ram"), 'voiced' = hoppa till röstens start. */
  start?: 'voiced' | 'tail' | number
  /**
   * Var ljudet ska ta slut: 'unvoiced' klipper där nästa frikativa börjar (y ur "yxa"),
   * 'voiced' klipper där vokalen tar vid (h ur "hav").
   */
  end?: 'unvoiced' | 'voiced'
  /** Millisekunder att behålla efter klippunkten: nasalers identitet sitter i övergången till vokalen. */
  after?: number
  keep?: number
  /** Töj ljudet till så här många ms genom att upprepa mitten – tonhöjden påverkas inte. */
  hold?: number
  /** Klangfilter (peaking EQ) som läggs på efter klippet: m görs dovare, n ljusare. gain i dB. */
  eq?: { f: number; gain: number; q?: number }[]
}

interface Item {
  id: string
  text: string
  /** Egen röst för just detta ljud (m och n blir otydliga i standardrösten). */
  voice?: string
  /** Innehållet i <voice>, redan SSML-escapat. */
  inner: string
  /** Klipp i ljudet efter generering: hämtas då som WAV och sparas som WAV. */
  cut?: Cut
}

interface Manifest {
  version: number
  voice: string
  items: Record<string, { file: string; hash: string; text: string }>
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * Ord som rösten annars uttalar fel. Nyckel = ordet som det står i innehållet (skiftlägesokänsligt).
 * Värde: IPA, eller en omstavning med "=" först ("=Start-rampen" läses som två ord).
 * "Hurra" ska ha betoning och långt a på slutet ("hurraa"); "Startrampen" blev "star-trampen".
 */
const PRONOUNCE: Record<string, string> = {
  hurra: 'hɵˈrɑː',
  startrampen: '=Start-rampen',
  // spelkort [kuːʈ], inte adjektivet kort [kɔʈ] (förekommer bara i memory-frasen)
  kort: 'kuːʈ',
}
/** Bara när ordet läses ensamt (ordbild, ord-för-ord): "och" ska bli "ock", inte talspråkets "å". I fraser låter det naturliga bäst. */
const PRONOUNCE_ALONE: Record<string, string> = {
  // jag: läses som text – IPA "jɑːg" tappade g:et och "jɑːgg" gjorde vokalen kort ("jäg")
  och: 'ɔk',
  det: 'deːt',
  är: 'æːr',
  här: 'hæːr',
  med: 'meːd',
}
// Inte \b: det är ASCII-baserat i JS, så "är" skulle matcha inuti "här". Bokstavsgränser via \p{L}.
const pronounceRe = (map: Record<string, string>) => new RegExp(`(?<!\\p{L})(${Object.keys(map).join('|')})(?!\\p{L})`, 'giu')
const PRONOUNCE_RE = pronounceRe(PRONOUNCE)
const PRONOUNCE_ALONE_RE = pronounceRe({ ...PRONOUNCE, ...PRONOUNCE_ALONE })

/** Vanligt tal, lite långsammare än standard för att passa en sexåring. Byter ut orden i PRONOUNCE. */
const say = (text: string, rate = '-8%', alone = false) => {
  const map = alone ? { ...PRONOUNCE, ...PRONOUNCE_ALONE } : PRONOUNCE
  const inner = esc(text).replace(alone ? PRONOUNCE_ALONE_RE : PRONOUNCE_RE, (w) => {
    const fix = map[w.toLowerCase()]
    return fix.startsWith('=') ? esc(fix.slice(1)) : `<phoneme alphabet="ipa" ph="${fix}">${w}</phoneme>`
  })
  return `<prosody rate="${rate}">${inner}</prosody>`
}

/**
 * Bokstavsljud (inte bokstavsnamn), alltid via IPA-fonem ur letters.json.
 * Vokaler: det korta ljudet (a som i "katt", o = "ʊ" som i "ost"). Att låta rösten läsa
 * bokstaven som text gav långa vokaler ("aa") och o blev identiskt med å.
 * Konsonanter: Azure ignorerar längdmarkering (ː) och aspiration (ʰ), så hållbara ljud skrivs som
 * upprepade fonem ("ss", "rr", "fff") och p/t/k som "ph"/"th"/"kh" (pust utan vokal), b/d/g med kort
 * schwa. Per bokstav kan `say` (text), `ssml` (rå SSML, t.ex. bokstavsnamnet för y) och `rate`
 * ersätta standarden. Egen inspelning i föräldravyn går alltid före.
 */
const sound = (letter: { id: string; ipa: string; type: string; continuous: boolean; say?: string; ssml?: string; rate?: string }) => {
  const rate = letter.rate ?? (letter.type === 'vowel' ? '-35%' : letter.continuous ? '-20%' : '+20%')
  const inner = letter.ssml !== undefined ? letter.ssml : letter.say !== undefined ? esc(letter.say) : `<phoneme alphabet="ipa" ph="${esc(letter.ipa)}">${esc(letter.id)}</phoneme>`
  return `<prosody rate="${rate}">${inner}</prosody>`
}

function collect(): Item[] {
  const items: Item[] = []
  for (const l of letters)
    items.push({
      id: letterSoundId(l.id),
      text: `[ljud ${l.id}] ${l.ssml !== undefined ? 'ssml' : l.say !== undefined ? `"${l.say}"` : l.ipa}${l.rate ? ' ' + l.rate : ''}${l.cut ? ' klipp ' + JSON.stringify(l.cut) : ''}`,
      inner: sound(l),
      cut: l.cut,
      voice: l.voice,
    })
  for (const w of words)
    items.push({
      id: wordId(w.id),
      text: w.text,
      inner: w.ipa ? `<prosody rate="-12%"><phoneme alphabet="ipa" ph="${esc(w.ipa)}">${esc(w.text)}</phoneme></prosody>` : say(w.text, '-12%', true),
    })
  // {name} i en fras = barnets namn ur config.json (beröm med namn)
  for (const [k, t0] of Object.entries(phrases)) {
    const t = t0.replace(/\{name\}/g, config.childName)
    items.push({ id: phraseId(k), text: t, inner: say(t) })
  }
  for (const l of levels) {
    items.push({ id: levelNameId(l.id), text: l.name, inner: say(l.name) })
    if (l.goal) items.push({ id: levelGoalId(l.id), text: l.goal, inner: say(l.goal) })
  }
  for (const m of mascots) items.push({ id: mascotIntroId(m.id), text: m.intro, inner: say(m.intro) })
  for (const n of names) {
    items.push({ id: nameId(n.id), text: n.text, inner: say(n.text) })
    items.push({ id: nameHelloId(n.id), text: `Hej! Jag heter ${n.text}!`, inner: say(`Hej! Jag heter ${n.text}!`) })
  }
  for (const s of sightwords) items.push({ id: sightWordId(s.id), text: s.text, inner: say(s.text, '-12%', true) })
  const tokens = new Set<string>()
  for (const s of sentences) {
    items.push({ id: sentenceId(s.id), text: s.text, inner: say(s.text, '-15%') })
    tokenize(s.text).forEach((t) => tokens.add(t))
  }
  for (const st of stories) {
    items.push({ id: storyTitleId(st.id), text: st.title, inner: say(st.title) })
    st.sentences.forEach((sen, i) => {
      items.push({ id: storySentenceId(st.id, i), text: sen, inner: say(sen, '-15%') })
      tokenize(sen).forEach((t) => tokens.add(t))
    })
    st.questions.forEach((q, i) => items.push({ id: storyQuestionId(st.id, i), text: q.text, inner: say(q.text) }))
  }
  // Ord-för-ord-läsning: varje unikt ord i meningar och berättelser, lite långsamt.
  for (const t of [...tokens].sort()) items.push({ id: tokenId(t), text: t, inner: say(t, '-20%', true) })
  return items
}

function ssmlFor(inner: string, voice = VOICE): string {
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="sv-SE"><voice name="${voice}">${inner}</voice></speak>`
}

/**
 * Peaking-EQ (RBJ-biquad). Nasalerna m och n är nästan identiska i sig; det örat använder är att m är
 * dovt (energi under 1 kHz) och n ljust (energi kring 2 kHz). Filtret förstärker just den skillnaden.
 */
function peakingEq(x: Int16Array, sr: number, f0: number, gainDb: number, q = 0.8): Int16Array {
  const A = Math.pow(10, gainDb / 40)
  const w0 = (2 * Math.PI * f0) / sr
  const alpha = Math.sin(w0) / (2 * q)
  const cosw = Math.cos(w0)
  const b0 = 1 + alpha * A
  const b1 = -2 * cosw
  const b2 = 1 - alpha * A
  const a0 = 1 + alpha / A
  const a1 = -2 * cosw
  const a2 = 1 - alpha / A
  const out = new Int16Array(x.length)
  let x1 = 0
  let x2 = 0
  let y1 = 0
  let y2 = 0
  for (let i = 0; i < x.length; i++) {
    const y = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0
    x2 = x1
    x1 = x[i]
    y2 = y1
    y1 = y
    out[i] = Math.max(-32768, Math.min(32767, Math.round(y)))
  }
  return out
}

/**
 * Grundtonens periodlängd i sampel (autokorrelation, 80–330 Hz). En loop som inte är ett helt antal
 * perioder ger ett hörbart hack vid varje varv ("m,m,m"), därför måste töjningen synka mot den.
 */
function pitchPeriod(x: Int16Array, sr: number): number {
  const lo = Math.floor(sr / 330)
  const hi = Math.floor(sr / 80)
  const from = Math.round(x.length * 0.3)
  const len = Math.min(x.length - from, hi * 3)
  if (len <= hi * 2) return 0
  let best = 0
  let bestScore = 0
  for (let lag = lo; lag <= hi; lag++) {
    let num = 0
    let d1 = 0
    let d2 = 0
    for (let i = 0; i + lag < len; i++) {
      const a = x[from + i]
      const b = x[from + i + lag]
      num += a * b
      d1 += a * a
      d2 += b * b
    }
    const score = num / (Math.sqrt(d1 * d2) || 1)
    if (score > bestScore) {
      bestScore = score
      best = lag
    }
  }
  return bestScore > 0.6 ? best : 0
}

/**
 * Töjer ett nästan stationärt ljud (en nasal) till önskad längd genom att upprepa mitten ett helt
 * antal grundtonsperioder i taget. Tonhöjden bevaras – att i stället spela upp långsammare hade sänkt den.
 */
function stretchLoop(x: Int16Array, sr: number, target: number): Int16Array {
  const period = pitchPeriod(x, sr)
  if (!period) return x
  const lo = Math.round(x.length * 0.25)
  const hi = Math.round(x.length * 0.8)
  const periods = Math.floor((hi - lo) / period)
  if (periods < 2) return x
  const loopLen = periods * period
  const loop = x.slice(lo, lo + loopLen)
  // Nasalen tonar ut; en loop av den pulserar ("n,n,n"). Jämna därför ut varje periods styrka.
  const levels: number[] = []
  for (let p = 0; p < periods; p++) {
    let e = 0
    for (let i = p * period; i < (p + 1) * period; i++) e += loop[i] * loop[i]
    levels.push(Math.sqrt(e / period) || 1)
  }
  const target0 = [...levels].sort((u, v) => u - v)[Math.floor(periods / 2)]
  for (let p = 0; p < periods; p++) {
    const g = Math.min(3, target0 / levels[p])
    for (let i = p * period; i < (p + 1) * period; i++) loop[i] = Math.max(-32768, Math.min(32767, Math.round(loop[i] * g)))
  }
  const tail = x.slice(lo + loopLen)
  const out: number[] = Array.from(x.slice(0, lo + loopLen))
  // Korsfad över exakt en period: vågformerna ligger i fas, så skarven hörs inte.
  let guard = 0
  while (out.length + tail.length < target && guard++ < 40) {
    const start = out.length - period
    for (let i = 0; i < loop.length; i++) {
      if (i < period) out[start + i] = Math.round((out[start + i] ?? 0) * (1 - i / period) + loop[i] * (i / period))
      else out.push(loop[i])
    }
  }
  tail.forEach((v) => out.push(v))
  return Int16Array.from(out)
}

/**
 * Klipper ett 16-bitars mono-WAV från Azure: bort med tystnad före ljudet, valfritt allt före
 * röstens start (fonem som f/s har många nollgenomgångar, en vokal få) eller ett antal ms, och
 * behåll sedan bara en andel av resten. Kort intoning i början, uttoning i slutet.
 */
function trimWav(buf: Buffer, cut: Cut): Buffer {
  const sr = buf.readUInt32LE(24)
  let off = 12
  let dataOff = -1
  let dataLen = 0
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4)
    const len = buf.readUInt32LE(off + 4)
    if (id === 'data') {
      dataOff = off + 8
      dataLen = Math.min(len, buf.length - dataOff)
      break
    }
    off += 8 + len + (len & 1)
  }
  if (dataOff < 0) throw new Error('WAV utan data-chunk')
  const n = Math.floor(dataLen / 2)
  const x = new Int16Array(n)
  for (let i = 0; i < n; i++) x[i] = buf.readInt16LE(dataOff + i * 2)
  const frame = Math.round(sr * 0.01)
  const frames = Math.floor(n / frame)
  const rms: number[] = []
  const zcr: number[] = []
  for (let f = 0; f < frames; f++) {
    let e = 0
    let z = 0
    for (let i = f * frame; i < (f + 1) * frame; i++) {
      e += x[i] * x[i]
      if (i > f * frame && (x[i] >= 0) !== (x[i - 1] >= 0)) z++
    }
    rms.push(Math.sqrt(e / frame))
    zcr.push(z / frame)
  }
  const peak = Math.max(...rms)
  // Viskade ljud (h) är bara ett par procent av en vokals styrka: då måste starttröskeln ligga
  // strax över brusgolvet, annars klipps hela konsonanten bort.
  const noise = [...rms].sort((x, y) => x - y)[Math.floor(rms.length * 0.1)] || 1
  const floor = cut.end === 'voiced' ? Math.max(noise * 6, peak * 0.02) : peak * 0.1
  let a = rms.findIndex((v) => v > floor)
  let b = rms.length - 1
  while (b > a && rms[b] <= peak * 0.1) b--
  if (cut.start === 'tail') {
    // Gränsen vokal→slutkonsonant är det brantaste energifallet i ordet. Att bara leta "svaga ramar"
    // tog med vokalens uttoning, och då hördes ett "a" före m:et.
    let drop = -1
    let worst = 1
    for (let f = a + 2; f <= b; f++) {
      const ratio = rms[f] / Math.max(1, rms[f - 1])
      if (ratio < worst && rms[f - 1] > peak * 0.35) {
        worst = ratio
        drop = f
      }
    }
    if (drop > a && drop < b - 1) a = drop
  } else if (cut.start === 'voiced') {
    const v = rms.findIndex((r, f) => f >= a && r > peak * 0.3 && zcr[f] < 0.2)
    if (v > a) a = v
  } else if (typeof cut.start === 'number') {
    a = Math.min(b, a + Math.round(cut.start / 10))
  }
  if (cut.end === 'unvoiced') {
    // Frikativan (x, s) har ihållande hög nollgenomgångsfrekvens; en vokals uttoning ger enstaka
    // höga ramar, därför krävs två i rad. Två ramars marginal så att vokalslutet får vara kvar.
    const v = zcr.findIndex((z, f) => f > a + 2 && f < b && z > 0.4 && zcr[f + 1] > 0.4)
    if (v > a + 3) b = v - 2
  } else if (cut.end === 'voiced') {
    // Vokalen är mycket starkare än den viskade konsonanten före: klipp där energin tar fart.
    // Vokalstarten = en brant energiökning, inte bara "stark ram": en nasal (m, n) är nästan lika
    // stark som vokalen efter, medan ett viskat h är svagt. Kräver både nivå och fördubbling.
    const v = rms.findIndex((r, f) => f > a + 2 && f <= b && r > peak * 0.45 && zcr[f] < 0.15 && r > 2 * (rms[f - 2] || 1))
    if (v > a + 2) b = Math.min(b, v - 1 + Math.round((cut.after ?? 0) / 10))
  }
  // keep kortar det klippta ljudet proportionellt (en utdragen nasal blir annars nästan en sekund),
  // men den sista biten – vokalövergången – måste vara kvar, så den räknas bort först.
  if (cut.keep !== undefined) {
    const tail = Math.round((cut.after ?? 0) / 10)
    b = a + Math.round((b - a - tail) * cut.keep) + tail
  }
  const s0 = a * frame
  const s1 = Math.min(n, (b + 1) * frame)
  let out = x.slice(s0, s1)
  if (cut.hold) {
    const target = Math.round((cut.hold * sr) / 1000)
    if (out.length < target) out = stretchLoop(out, sr, target)
  }
  for (const e of cut.eq ?? []) out = peakingEq(out, sr, e.f, e.gain, e.q)
  const fadeIn = Math.round(sr * 0.012)
  const fadeOut = Math.round(sr * 0.035)
  for (let i = 0; i < Math.min(fadeIn, out.length); i++) out[i] = Math.round(out[i] * (i / fadeIn))
  for (let i = 0; i < Math.min(fadeOut, out.length); i++) out[out.length - 1 - i] = Math.round(out[out.length - 1 - i] * (i / fadeOut))
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + out.length * 2, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(sr, 24)
  header.writeUInt32LE(sr * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(out.length * 2, 40)
  return Buffer.concat([header, Buffer.from(out.buffer, out.byteOffset, out.length * 2)])
}

async function azureTts(ssml: string, wav = false): Promise<Buffer> {
  const url = `https://${REGION}.tts.speech.microsoft.com/cognitiveservices/v1`
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': KEY,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': wav ? 'riff-24khz-16bit-mono-pcm' : 'audio-24khz-48kbitrate-mono-mp3',
        'User-Agent': 'lasaventyret-audio',
      },
      body: ssml,
    })
    if (res.ok) return Buffer.from(await res.arrayBuffer())
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 1500 * attempt))
      continue
    }
    throw new Error(`Azure ${res.status}: ${await res.text()}`)
  }
  throw new Error('Azure: gav upp efter 4 försök')
}

async function main() {
  const args = process.argv.slice(2)
  const list = args.includes('--list')
  const force = args.includes('--force')
  const onlyIdx = args.indexOf('--only')
  const only = onlyIdx >= 0 ? args[onlyIdx + 1] : ''

  mkdirSync(outDir, { recursive: true })
  const manifest: Manifest = existsSync(manifestPath)
    ? (JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest)
    : { version: 1, voice: VOICE, items: {} }
  manifest.voice = VOICE

  const all = collect()
  // Ljud som inte längre finns i innehållet ska bort ur manifestet, annars släpar filerna med i bygget.
  if (!only) {
    const live = new Set(all.map((i) => i.id))
    for (const id of Object.keys(manifest.items)) {
      if (live.has(id)) continue
      const file = path.join(outDir, manifest.items[id].file)
      if (existsSync(file)) rmSync(file)
      delete manifest.items[id]
      if (!list) console.log(`  tog bort ${id}`)
    }
  }
  const items = all.filter((i) => !only || i.id.startsWith(only))
  const todo: { item: Item; ssml: string; hash: string; file: string }[] = []
  for (const item of items) {
    const ssml = ssmlFor(item.inner, item.voice)
    const hash = createHash('sha1').update((item.voice ?? VOICE) + ssml + (item.cut ? JSON.stringify(item.cut) : '')).digest('hex').slice(0, 12)
    const file = item.cut ? audioFileName(item.id).replace(/\.mp3$/, '.wav') : audioFileName(item.id)
    const have = manifest.items[item.id]
    const fresh = have && have.hash === hash && existsSync(path.join(outDir, file))
    if (list) console.log(`${fresh ? 'OK   ' : 'SAKNAS'} ${item.id.padEnd(28)} ${item.text}`)
    if (!fresh || force) todo.push({ item, ssml, hash, file })
  }
  if (list) {
    console.log(`\n${items.length} ljud, ${todo.length} att generera.`)
    return
  }
  if (todo.length === 0) {
    console.log('Allt ljud är redan genererat.')
    return
  }
  if (!KEY) {
    console.error(`Saknar AZURE_SPEECH_KEY i .env – ${todo.length} ljud kan inte genereras. Kopiera .env.example till .env.`)
    process.exit(1)
  }
  console.log(`Genererar ${todo.length} ljud med ${VOICE} (${REGION}) ...`)
  let n = 0
  for (const t of todo) {
    const raw = await azureTts(t.ssml, !!t.item.cut)
    writeFileSync(path.join(outDir, t.file), t.item.cut ? trimWav(raw, t.item.cut) : raw)
    manifest.items[t.item.id] = { file: t.file, hash: t.hash, text: t.item.text }
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
    n++
    console.log(`  ${String(n).padStart(3)}/${todo.length}  ${t.item.id}  "${t.item.text}"`)
    await new Promise((r) => setTimeout(r, 150))
  }
  console.log('Klart.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
