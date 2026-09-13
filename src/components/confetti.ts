import confetti from 'canvas-confetti'

export function burstConfetti(): void {
  const colors = ['#ffcc33', '#ff5d73', '#3b82f6', '#22c55e', '#ffffff']
  void confetti({ particleCount: 90, spread: 80, origin: { x: 0.3, y: 0.6 }, colors })
  void confetti({ particleCount: 90, spread: 80, origin: { x: 0.7, y: 0.6 }, colors })
}

export function starBurst(x: number, y: number): void {
  void confetti({
    particleCount: 24,
    spread: 360,
    startVelocity: 25,
    gravity: 0.6,
    ticks: 60,
    origin: { x, y },
    shapes: ['star'],
    colors: ['#ffcc33', '#fff', '#ffe98a'],
    scalar: 1.4,
  })
}
