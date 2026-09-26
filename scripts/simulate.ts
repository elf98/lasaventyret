/** Simulerar hela resan med den nya motorn: passar per planet, sidovägar, områden. Körs med tsx. */
import { levels, rhymes, sentences, sightwords, stories, words } from '../src/content'
import { applyResult, masteryKey, newItem } from '../src/engine/mastery'
import { seeded } from '../src/engine/random'
import { buildSession } from '../src/engine/sessionBuilder'
import type { MasteryItem } from '../src/engine/types'
import { completedLevels, completedZones, isMain, isSidePath, pairConfusions, sidePathLit, unlockedLevels } from '../src/engine/unlock'

const ALL = ['catch-sound', 'sound-sort', 'read-word', 'first-sound', 'last-sound', 'count-sounds', 'sound-train', 'sound-riddle', 'sound-band', 'build-word', 'which-word', 'sight-memory', 'rhyme-hunt', 'silly-sentences', 'story'] as const

function run(errorRate: number, seed: number) {
  const rng = seeded(seed)
  const mastery: Record<string, MasteryItem> = {}
  const confusions: Record<string, number> = {}
  const baseline: Record<string, number> = {}
  let completed: string[] = []
  const perLevel: Record<string, number> = {}
  const games: Record<string, number> = {}
  let passes = 0
  let day = 0
  let sideVisits = 0
  const last = [...levels].reverse().find(isMain)!
  while (!completed.includes(last.id) && passes < 500) {
    const unlocked = unlockedLevels(levels, completed, mastery)
    const lit = levels.filter((l) => isSidePath(l) && unlocked.includes(l.id) && sidePathLit(l, confusions, baseline))
    const current = lit[0] ?? levels.find((l) => isMain(l) && unlocked.includes(l.id) && !completed.includes(l.id)) ?? last
    if (isSidePath(current)) sideVisits++
    const now = day * 86_400_000
    const tasks = buildSession({ level: current, levels, mastery, words, sightwords, sentences, stories, rhymes, now, count: 8, reviewShare: 0.25, availableGames: [...ALL], difficulty: 'normal', rng })
    if (tasks.length === 0) throw new Error(`tomt pass på ${current.id}`)
    const sid = `s${passes}`
    for (const t of tasks) {
      games[t.game] = (games[t.game] ?? 0) + 1
      const clean = rng() >= errorRate
      const key = masteryKey(t.kind, t.targetId)
      mastery[key] = applyResult(mastery[key] ?? newItem(t.targetId, t.kind, now), clean, sid, now)
      // Fel i bokstavsval: förväxlingar är systematiska, så oftast tvillingbokstaven (första distraktorn).
      if (!clean && (t.game === 'catch-sound' || (t.game === 'sound-sort' && t.letter === undefined))) {
        const right = t.answer ?? t.targetId
        const others = t.options.filter((o) => o !== right)
        const picked = rng() < 0.6 ? others[0] : others[Math.floor(rng() * others.length)]
        if (picked) confusions[`${right}>${picked}`] = (confusions[`${right}>${picked}`] ?? 0) + 1
      }
    }
    if (isSidePath(current)) baseline[current.id] = pairConfusions(current.letters, confusions)
    completed = Array.from(new Set([...completed, ...completedLevels(levels, mastery)]))
    perLevel[current.id] = (perLevel[current.id] ?? 0) + 1
    passes++
    // två pass per dag
    if (passes % 2 === 0) day++
  }
  return { passes, day, perLevel, sideVisits, zones: completedZones(levels, completed), games, stuck: !completed.includes(last.id) }
}

for (const [rate, seed] of [
  [0, 1],
  [0.15, 2],
  [0.3, 3],
] as const) {
  const r = run(rate, seed)
  console.log(`\nfel ${Math.round(rate * 100)} %: ${r.passes} pass på ${r.day} dagar, sidovägsbesök ${r.sideVisits}, områden klara ${r.zones.join(',')}${r.stuck ? '  FASTNADE' : ''}`)
  console.log('  ' + Object.entries(r.perLevel).map(([k, v]) => `${k}:${v}`).join(' '))
  const total = Object.values(r.games).reduce((a, b) => a + b, 0)
  console.log('  spel: ' + Object.entries(r.games).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round((100 * v) / total)}%`).join(', '))
}
