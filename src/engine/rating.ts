/**
 * Passbetyg: 3 stjärnor = alla uppgifter lösta med högst ETT fel, 2 = högst två uppgifter som
 * krävde fler försök, annars 1. Räknas på "rätt inom två försök", inte på felfritt: annars lönar
 * det sig att vänta och inte våga pröva. Ersätter stjärnor per uppgift (blev inflation: 12–16/pass).
 */
export function sessionRating(good: number, total: number): 1 | 2 | 3 {
  const wrong = Math.max(0, total - good)
  return wrong === 0 ? 3 : wrong <= 2 ? 2 : 1
}
