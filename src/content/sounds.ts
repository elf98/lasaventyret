import { letterById, type Word } from './index'
import { letterLongSoundId, letterSoundId } from './audioIds'

const isVowel = (s: string) => letterById.get(s)?.type === 'vowel'

/**
 * Vilken vokal i ordet som är lång (index i sounds), eller −1. Svenskans regel: den betonade vokalen
 * är lång när högst en konsonant följer (glas, sol, apa) och kort före två (glass, ost, katt); x är
 * två ljud (sax). Betoningen antas ligga på första vokalen. Ord där det inte stämmer (tomat, kanin:
 * betoning på slutet; ram, han, mun: kort trots en konsonant) har `long` i words.json.
 */
export function longVowelIndex(w: Word): number {
  if (w.long !== undefined) return w.long
  const i = w.sounds.findIndex(isVowel)
  if (i < 0) return -1
  let n = 0
  for (let k = i + 1; k < w.sounds.length && !isVowel(w.sounds[k]); k++) n += w.sounds[k] === 'x' ? 2 : 1
  return n <= 1 ? i : -1
}

/**
 * Ljud-id för varje ljud i ordet, med rätt vokallängd. Med bara korta vokaler ljudas "glas" som
 * "glass", och barnet kan inte höra vad dubbelteckningen gör.
 */
export function wordSoundIds(w: Word | undefined): string[] {
  if (!w) return []
  const long = longVowelIndex(w)
  return w.sounds.map((s, i) => (i === long ? letterLongSoundId(s) : letterSoundId(s)))
}
