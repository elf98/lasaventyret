import Dexie, { type EntityTable } from 'dexie'
import { wordById, words, type Word } from './index'

/**
 * Egna ord (föräldravyn): text + emoji + inspelat uttal. Sparas i IndexedDB och
 * registreras i den vanliga ordlistan vid start, så alla spel ser dem.
 */
export interface CustomWord {
  /** "c:" + slug, så att id aldrig krockar med words.json. */
  id: string
  text: string
  emoji: string
  sounds: string[]
  decodable: boolean
  createdAt: number
}

const db = new Dexie('lasaventyret-words') as Dexie & { customWords: EntityTable<CustomWord, 'id'> }
db.version(1).stores({ customWords: 'id, createdAt' })

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-zåäö]/g, '')
    .slice(0, 20)
}

/** Ljudsekvens = bokstäverna i ordet (dubbelteckning ger två lika ljud, som i Ljudtåget). */
export function soundsOf(text: string): string[] {
  return slugify(text).split('')
}

export function register(w: CustomWord): void {
  const asWord: Word = { id: w.id, text: w.text, emoji: w.emoji, sounds: w.sounds, decodable: w.decodable }
  const i = words.findIndex((x) => x.id === w.id)
  if (i >= 0) words[i] = asWord
  else words.push(asWord)
  wordById.set(w.id, asWord)
}

export function unregister(id: string): void {
  const i = words.findIndex((x) => x.id === id)
  if (i >= 0) words.splice(i, 1)
  wordById.delete(id)
}

export async function loadCustomWords(): Promise<CustomWord[]> {
  try {
    const all = await db.customWords.orderBy('createdAt').toArray()
    all.forEach(register)
    return all
  } catch {
    return []
  }
}

export async function saveCustomWord(text: string, emoji: string, decodable: boolean): Promise<CustomWord> {
  const slug = slugify(text)
  if (!slug) throw new Error('Ordet måste innehålla bokstäver a–ö')
  let id = `c:${slug}`
  let n = 2
  while (wordById.has(id)) id = `c:${slug}${n++}`
  const w: CustomWord = { id, text: slug, emoji: emoji.trim(), sounds: soundsOf(slug), decodable, createdAt: Date.now() }
  await db.customWords.put(w)
  register(w)
  return w
}

export async function deleteCustomWord(id: string): Promise<void> {
  await db.customWords.delete(id)
  unregister(id)
}

export async function listCustomWords(): Promise<CustomWord[]> {
  return db.customWords.orderBy('createdAt').toArray()
}

/** Export/import tillsammans med progress-JSON. */
export async function exportCustomWords(): Promise<CustomWord[]> {
  return listCustomWords()
}

export async function importCustomWords(list: CustomWord[]): Promise<number> {
  for (const w of list) {
    await db.customWords.put(w)
    register(w)
  }
  return list.length
}
