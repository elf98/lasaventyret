import { describe, expect, it } from 'vitest'
import { applyResult, isDue, meetsMastery, newItem } from '../mastery'

const DAY = 86_400_000

describe('mastery', () => {
  it('kräver tre rätt i rad över minst två pass', () => {
    let m = newItem('s', 'letter', 0)
    m = applyResult(m, true, 'pass1', 1)
    m = applyResult(m, true, 'pass1', 2)
    m = applyResult(m, true, 'pass1', 3)
    expect(m.streak).toBe(3)
    expect(meetsMastery(m)).toBe(false)
    m = applyResult(m, true, 'pass2', 4)
    expect(m.mastered).toBe(true)
  })

  it('ett fel nollställer raden och gör objektet förfallet', () => {
    let m = newItem('s', 'letter', 0)
    m = applyResult(m, true, 'p1', 1)
    m = applyResult(m, true, 'p2', 2)
    m = applyResult(m, false, 'p2', 3)
    expect(m.streak).toBe(0)
    expect(m.errors).toBe(1)
    expect(m.mastered).toBe(false)
    expect(isDue(m, 3)).toBe(true)
  })

  it('intervallet växer med raden', () => {
    let m = newItem('s', 'letter', 0)
    m = applyResult(m, true, 'p1', 0)
    expect(m.dueAt).toBe(1 * DAY)
    m = applyResult(m, true, 'p2', 0)
    expect(m.dueAt).toBe(3 * DAY)
  })
})
