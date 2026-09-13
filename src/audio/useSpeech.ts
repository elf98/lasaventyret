import { useEffect } from 'react'
import { audio } from './AudioManager'

/** Stoppar pågående tal när skärmen/komponenten lämnas. */
export function useStopSpeechOnUnmount(): void {
  useEffect(() => () => audio.stop(), [])
}

export function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
