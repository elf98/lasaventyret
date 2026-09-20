import { levelById } from '../content'
import { levelProgress } from '../engine/unlock'
import { useProgress, type ProgressData } from '../store/progress'
import { useSettings } from '../store/settings'

/** Planeten som byter till blandat respektive gemener när den är klar. */
export const CASE_MILESTONES = { mixed: 'ordfabriken', lower: 'rymdstationen' } as const

/** Skrivstil som resan motiverar: versaler tills Ordfabriken är klar, blandat tills Rymdstationen är klar, sedan gemener. */
export function caseStage(p: ProgressData): 'upper' | 'mixed' | 'lower' {
  const done = (id: string) => {
    const l = levelById.get(id)
    return p.completed.includes(id) || (!!l && levelProgress(l, p.mastery).complete)
  }
  if (done(CASE_MILESTONES.lower)) return 'lower'
  if (done(CASE_MILESTONES.mixed)) return 'mixed'
  return 'upper'
}

/**
 * Skrivstil för ord barnet ska läsa. Versaler är lättast i början; nästan all text barn möter
 * är gemener, så appen växlar automatiskt när barnet är redo (eller enligt föräldravyn).
 * "Blandat" ger samma ord samma stil varje gång (hash på ordet), så att inlärningen inte störs
 * av att ordet ser olika ut från gång till gång.
 */
export function useCaseClass(): (key: string) => string {
  const setting = useSettings((s) => s.letterCase)
  const stage = useProgress(caseStage)
  const mode = setting === 'auto' ? stage : setting
  return (key: string) => {
    if (mode === 'upper') return 'uppercase'
    if (mode === 'lower') return 'lowercase'
    let h = 0
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
    return h % 2 === 0 ? 'uppercase' : 'lowercase'
  }
}
