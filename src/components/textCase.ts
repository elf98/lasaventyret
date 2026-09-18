import { useSettings } from '../store/settings'

/**
 * Skrivstil för ord barnet ska läsa. Versaler är lättast i början; nästan all text barn möter
 * är gemener, så appen kan växla när barnet är redo. "Blandat" ger samma ord samma stil varje
 * gång (hash på ordet), så att inlärningen inte störs av att ordet ser olika ut från gång till gång.
 */
export function useCaseClass(): (key: string) => string {
  const mode = useSettings((s) => s.letterCase)
  return (key: string) => {
    if (mode === 'upper') return 'uppercase'
    if (mode === 'lower') return 'lowercase'
    let h = 0
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
    return h % 2 === 0 ? 'uppercase' : 'lowercase'
  }
}
