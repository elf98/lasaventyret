/**
 * Gemensamt id-schema för allt talat ljud. Både appen och
 * scripts/generate-audio.ts använder detta så att manifestet alltid
 * matchar det appen frågar efter.
 */
export const letterSoundId = (letterId: string) => `letter.${letterId}`
export const wordId = (id: string) => `word.${id}`
export const phraseId = (key: string) => `phrase.${key}`
export const levelNameId = (levelId: string) => `level.${levelId}`
export const levelGoalId = (levelId: string) => `level.${levelId}.goal`
export const mascotIntroId = (mascotId: string) => `mascot.${mascotId}.intro`
export const nameId = (nameKey: string) => `name.${nameKey}`
export const nameHelloId = (nameKey: string) => `name.${nameKey}.hello`
export const sightWordId = (id: string) => `sight.${id}`
export const sentenceId = (id: string) => `sentence.${id}`
export const storyTitleId = (id: string) => `story.${id}.title`
export const storySentenceId = (id: string, n: number) => `story.${id}.${n}`
export const storyQuestionId = (id: string, n = 0) => `story.${id}.q${n}`
/** Enskilt ord ur en mening, för ord-för-ord-läsning. */
export const tokenId = (text: string) => `token.${text}`

const translit: Record<string, string> = { å: 'aa', ä: 'ae', ö: 'oe', Å: 'AA', Ä: 'AE', Ö: 'OE' }

/** Filnamn utan å/ä/ö så att inget krånglar på servern eller i cache. */
export function audioFileName(id: string): string {
  return id.replace(/[åäöÅÄÖ]/g, (c) => translit[c]).replace(/[^a-zA-Z0-9._-]/g, '_') + '.mp3'
}
