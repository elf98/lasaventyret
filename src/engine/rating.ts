/**
 * Passbetyg: 3 stjärnor = alla uppgifter rätt på första försöket, 2 = högst två uppgifter
 * med fel, annars 1. Ersätter stjärnor per uppgift (blev inflation: 12–16 per pass).
 */
export function sessionRating(correct: number, total: number): 1 | 2 | 3 {
  const wrong = Math.max(0, total - correct)
  return wrong === 0 ? 3 : wrong <= 2 ? 2 : 1
}
