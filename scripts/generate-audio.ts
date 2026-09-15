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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { letters, levels, mascots, names, phrases, sentences, sightwords, stories, tokenize, words } from '../src/content'
import { audioFileName, letterSoundId, levelNameId, mascotIntroId, nameHelloId, nameId, phraseId, sentenceId, sightWordId, storyQuestionId, storySentenceId, storyTitleId, tokenId, wordId } from '../src/content/audioIds'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'public', 'audio')
const manifestPath = path.join(outDir, 'manifest.json')

const VOICE = process.env.AZURE_VOICE || 'sv-SE-SofieNeural'
const REGION = process.env.AZURE_SPEECH_REGION || 'swedencentral'
const KEY = process.env.AZURE_SPEECH_KEY || ''

interface Item {
  id: string
  text: string
  /** Innehållet i <voice>, redan SSML-escapat. */
  inner: string
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
}
const PRONOUNCE_RE = new RegExp(`\\b(${Object.keys(PRONOUNCE).join('|')})\\b`, 'gi')

/** Vanligt tal, lite långsammare än standard för att passa en sexåring. Byter ut orden i PRONOUNCE. */
const say = (text: string, rate = '-8%') => {
  const inner = esc(text).replace(PRONOUNCE_RE, (w) => {
    const fix = PRONOUNCE[w.toLowerCase()]
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
  for (const l of letters) items.push({ id: letterSoundId(l.id), text: `[ljud ${l.id}] ${l.ssml !== undefined ? 'ssml' : l.say !== undefined ? `"${l.say}"` : l.ipa}${l.rate ? ' ' + l.rate : ''}`, inner: sound(l) })
  for (const w of words)
    items.push({
      id: wordId(w.id),
      text: w.text,
      inner: w.ipa ? `<prosody rate="-12%"><phoneme alphabet="ipa" ph="${esc(w.ipa)}">${esc(w.text)}</phoneme></prosody>` : say(w.text, '-12%'),
    })
  for (const [k, t] of Object.entries(phrases)) items.push({ id: phraseId(k), text: t, inner: say(t) })
  for (const l of levels) items.push({ id: levelNameId(l.id), text: l.name, inner: say(l.name) })
  for (const m of mascots) items.push({ id: mascotIntroId(m.id), text: m.intro, inner: say(m.intro) })
  for (const n of names) {
    items.push({ id: nameId(n.id), text: n.text, inner: say(n.text) })
    items.push({ id: nameHelloId(n.id), text: `Hej! Jag heter ${n.text}!`, inner: say(`Hej! Jag heter ${n.text}!`) })
  }
  for (const s of sightwords) items.push({ id: sightWordId(s.id), text: s.text, inner: say(s.text, '-12%') })
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
    items.push({ id: storyQuestionId(st.id), text: st.question, inner: say(st.question) })
  }
  // Ord-för-ord-läsning: varje unikt ord i meningar och berättelser, lite långsamt.
  for (const t of [...tokens].sort()) items.push({ id: tokenId(t), text: t, inner: say(t, '-20%') })
  return items
}

function ssmlFor(inner: string): string {
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="sv-SE"><voice name="${VOICE}">${inner}</voice></speak>`
}

async function azureTts(ssml: string): Promise<Buffer> {
  const url = `https://${REGION}.tts.speech.microsoft.com/cognitiveservices/v1`
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': KEY,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
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

  const items = collect().filter((i) => !only || i.id.startsWith(only))
  const todo: { item: Item; ssml: string; hash: string; file: string }[] = []
  for (const item of items) {
    const ssml = ssmlFor(item.inner)
    const hash = createHash('sha1').update(VOICE + ssml).digest('hex').slice(0, 12)
    const file = audioFileName(item.id)
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
    const mp3 = await azureTts(t.ssml)
    writeFileSync(path.join(outDir, t.file), mp3)
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
