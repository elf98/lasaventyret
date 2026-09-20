import { templates, wordById, type Sentence, type Word } from '../content'
import { shuffle, type Rng } from './random'

/** Prefix på id för en mening som genererats ur en mall: "g|har|mus|bok". */
const GEN = 'g|'
/** Mastery-id för mallen (kind sentence): en mall behärskas när barnet läst två av dess meningar rätt. */
export const templateKey = (templateId: string) => `tpl:${templateId}`

export function isGenerated(id: string): boolean {
  return id.startsWith(GEN)
}

interface Slot {
  /** Nyckel i fyllningen: "djur", "djur2", "sak" ... */
  key: string
  /** Ordlistan i templates.json som ordet hämtas ur. */
  list: string
  /** Sätt ut en/ett före ordet, versal i början av meningen. */
  article: 'En' | 'en' | null
}

const SLOT_RE = /\{(En |en )?([a-zåäö_]+?)(\d?)\}/g

function slotsOf(text: string): Slot[] {
  return [...text.matchAll(SLOT_RE)].map((m) => ({ key: m[2] + m[3], list: m[2], article: m[1] ? (m[1].trim() as 'En' | 'en') : null }))
}

const article = (w: Word) => (templates.ett.includes(w.id) ? 'ett' : 'en')

/** Fyller mallen med orden och ger texten och bilden. */
function render(templateId: string, fills: string[]): Sentence | null {
  const t = templates.templates.find((x) => x.id === templateId)
  if (!t) return null
  const slots = slotsOf(t.text)
  if (fills.length !== slots.length) return null
  const words = fills.map((id) => wordById.get(id))
  if (words.some((w) => !w || w.emoji === '')) return null
  let i = 0
  const text = t.text.replace(SLOT_RE, () => {
    const w = words[i] as Word
    const s = slots[i++]
    if (!s.article) return w.text
    const a = article(w)
    return `${s.article === 'En' ? a[0].toUpperCase() + a.slice(1) : a} ${w.text}`
  })
  return { id: GEN + [templateId, ...fills].join('|'), text, picture: words.map((w) => (w as Word).emoji).join(''), distractors: [] }
}

/** Meningen bakom ett genererat id, återskapad ur mallen (deterministiskt, ingen lagring behövs). */
export function renderGenerated(id: string): Sentence | null {
  if (!isGenerated(id)) return null
  const [templateId, ...fills] = id.slice(GEN.length).split('|')
  return render(templateId, fills)
}

export interface Generated {
  sentence: Sentence
  /** Rätt bild först, sedan distraktorer svårast först (de som delar en del med rätt bild). */
  options: string[]
}

/**
 * Slumpar en mening ur mallen. `avoid` = ord som redan använts i passet (samma mus i varje mening
 * blir tjatigt). Distraktorer: varje bilddel utbytt för sig, sist alla utbytta.
 */
export function generateSentence(templateId: string, rng: Rng, avoid: Set<string> = new Set()): Generated | null {
  const t = templates.templates.find((x) => x.id === templateId)
  if (!t) return null
  const slots = slotsOf(t.text)
  const used = new Set<string>()
  const usedEmoji = new Set<string>()
  const pickFrom = (list: string, exclude: Set<string>): Word | undefined => {
    const cands = (templates.slots[list] ?? []).map((id) => wordById.get(id)).filter((w): w is Word => !!w && w.emoji !== '' && !exclude.has(w.id) && !usedEmoji.has(w.emoji))
    const fresh = cands.filter((w) => !avoid.has(w.id))
    return shuffle(fresh.length ? fresh : cands, rng)[0]
  }
  const fills: Word[] = []
  for (const s of slots) {
    const w = pickFrom(s.list, used)
    if (!w) return null
    used.add(w.id)
    usedEmoji.add(w.emoji)
    fills.push(w)
  }
  const sentence = render(templateId, fills.map((w) => w.id))
  if (!sentence) return null
  // Distraktorer: en del i taget byts mot ett annat ord ur samma lista.
  const swaps: Word[] = []
  for (let i = 0; i < slots.length; i++) {
    const other = pickFrom(slots[i].list, new Set([...used, ...swaps.map((w) => w.id)]))
    if (!other) return null
    swaps.push(other)
  }
  const pic = (ws: Word[]) => ws.map((w) => w.emoji).join('')
  const options = [sentence.picture]
  for (let i = 0; i < slots.length; i++) options.push(pic(fills.map((w, j) => (j === i ? swaps[i] : w))))
  if (slots.length === 2) options.push(pic(swaps))
  return { sentence, options: options.filter((o, i, arr) => arr.indexOf(o) === i) }
}
