export type Rng = () => number

export function shuffle<T>(arr: T[], rng: Rng = Math.random): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function pick<T>(arr: T[], rng: Rng = Math.random): T {
  return arr[Math.floor(rng() * arr.length)]
}

/** Viktat slumpval: weights[i] >= 0. */
export function weightedPick<T>(items: T[], weights: number[], rng: Rng = Math.random): T {
  const total = weights.reduce((a, b) => a + b, 0)
  let r = rng() * total
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]
    if (r <= 0) return items[i]
  }
  return items[items.length - 1]
}

/**
 * Kortlek: drar varje element en gång i slumpad ordning innan leken blandas om,
 * och samma element kommer aldrig två gånger i rad. För beröm och skämt som
 * annars upprepar sig med rent slumpval.
 */
export function bag<T>(items: readonly T[], rng: Rng = Math.random): () => T {
  let deck: T[] = []
  let last: T | undefined
  return () => {
    if (deck.length === 0) {
      deck = shuffle(items as T[], rng)
      if (deck.length > 1 && deck[deck.length - 1] === last) deck.unshift(deck.pop() as T)
    }
    last = deck.pop() as T
    return last
  }
}

/** Deterministisk generator för tester (mulberry32). */
export function seeded(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function newId(): string {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
}
