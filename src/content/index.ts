import lettersJson from './letters.json'
import wordsJson from './words.json'
import phrasesJson from './phrases.json'
import mascotsJson from './mascots.json'
import namesJson from './names.json'
import levelsJson from './levels.json'
import outfitsJson from './outfits.json'
import stickersJson from './stickers.json'
import configJson from './config.json'
import sightwordsJson from './sightwords.json'
import sentencesJson from './sentences.json'
import storiesJson from './stories.json'
import rhymesJson from './rhymes.json'

export interface Letter {
  id: string
  order: number
  type: 'consonant' | 'vowel'
  continuous: boolean
  ipa: string
  example: string
  /** Läs detta som vanlig text i stället för IPA (t.ex. "e": bokstavsnamnet lät bäst). */
  say?: string
  /** Rå SSML i stället för IPA/text (t.ex. say-as characters för bokstavsnamnet). */
  ssml?: string
  /** Eget tempo för ljudet, t.ex. "-10%". Standard: vokal -35 %, hållbar konsonant -20 %, stopp +20 %. */
  rate?: string
}

export interface Word {
  id: string
  text: string
  emoji: string
  sounds: string[]
  /** Ljudenligt utan kluster/dubbelteckning: kan användas i Ljudtåget och Bygg ordet. */
  decodable: boolean
  /** Valfritt IPA-uttal när TTS annars läser fel (stavelser som "al"). */
  ipa?: string
  /** Ordet går inte att ljuda bokstav för bokstav (sj-ljud m.m.): bara bild/rim. */
  noBlend?: boolean
}

export interface SightWord {
  id: string
  text: string
}

export interface Sentence {
  id: string
  text: string
  /** Bilden som passar, som en eller flera emoji. */
  picture: string
  distractors: string[]
}

export interface Story {
  id: string
  title: string
  sentences: string[]
  question: string
  options: string[]
  answer: number
}

export interface Mascot {
  id: string
  emoji: string
  intro: string
}

export interface MascotName {
  id: string
  text: string
}

export type GameId =
  | 'catch-sound'
  | 'build-word'
  | 'which-word'
  | 'sound-train'
  | 'rhyme-hunt'
  | 'sight-memory'
  | 'silly-sentences'
  | 'story'

export interface Level {
  id: string
  name: string
  emoji: string
  x: number
  y: number
  kind: 'letters' | 'sightwords' | 'cluster' | 'sentences' | 'stories' | 'phonology'
  letters: string[]
  games: GameId[]
  requires: string[]
  note?: string
}

export interface Outfit {
  id: string
  emoji: string
  slot: 'hat' | 'eyes' | 'wings' | 'hand'
  stars: number
}

export interface AppConfig {
  childName: string
  tasksPerSession: number
  reviewShare: number
  sessionMinutes: number
}

export const letters = lettersJson as Letter[]
export const words = wordsJson as Word[]
export const phrases = phrasesJson as Record<string, string>
export const mascots = mascotsJson as Mascot[]
export const names = namesJson as MascotName[]
export const levels = levelsJson as Level[]
export const outfits = outfitsJson as Outfit[]
export const stickers = stickersJson as string[]
export const config = configJson as AppConfig
export const sightwords = sightwordsJson as SightWord[]
export const sentences = sentencesJson as Sentence[]
export const stories = storiesJson as Story[]
export const rhymes = rhymesJson as string[][]

export const sightwordById = new Map(sightwords.map((w) => [w.id, w]))
export const sentenceById = new Map(sentences.map((s) => [s.id, s]))
export const storyById = new Map(stories.map((s) => [s.id, s]))

/** Delar upp en mening i ord (gemener, utan skiljetecken) för ord-för-ord-uppläsning. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[.,!?:;"]/g, '')
    .split(/\s+/)
    .filter(Boolean)
}

export const letterById = new Map(letters.map((l) => [l.id, l]))
export const wordById = new Map(words.map((w) => [w.id, w]))
export const levelById = new Map(levels.map((l) => [l.id, l]))

/** Ord med bild (emoji). Stavelser som "sa" saknar bild. */
export const pictureWords = words.filter((w) => w.emoji !== '')

export const praiseKeys = Object.keys(phrases).filter((k) => k.startsWith('praise_'))
export const pokeKeys = Object.keys(phrases).filter((k) => k.startsWith('poke_'))
