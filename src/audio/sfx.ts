/**
 * Små syntetiserade ljudeffekter via Web Audio. Inga filer behövs,
 * fungerar offline och låses upp av samma tryck som talet.
 */
let ctx: AudioContext | null = null
let master: GainNode | null = null
let volume = 1

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = volume
    master.connect(ctx.destination)
  }
  return ctx
}

export function unlockSfx(): void {
  const c = getCtx()
  if (!c) return
  if (c.state !== 'running') void c.resume()
  // Tyst buffert: krävs på iOS för att kontexten ska "väckas".
  const buf = c.createBuffer(1, 1, 22050)
  const src = c.createBufferSource()
  src.buffer = buf
  src.connect(c.destination)
  src.start(0)
}

export function setSfxVolume(v: number): void {
  volume = v
  if (master) master.gain.value = v
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.25, slideTo?: number) {
  const c = getCtx()
  if (!c || !master) return
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, c.currentTime + start)
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + start + dur)
  g.gain.setValueAtTime(0.0001, c.currentTime + start)
  g.gain.exponentialRampToValueAtTime(gain, c.currentTime + start + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur)
  o.connect(g)
  g.connect(master)
  o.start(c.currentTime + start)
  o.stop(c.currentTime + start + dur + 0.05)
}

function noise(start: number, dur: number, gain = 0.15, from = 400, to = 4000) {
  const c = getCtx()
  if (!c || !master) return
  const len = Math.floor(c.sampleRate * dur)
  const buf = c.createBuffer(1, len, c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  const src = c.createBufferSource()
  src.buffer = buf
  const f = c.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.setValueAtTime(from, c.currentTime + start)
  f.frequency.exponentialRampToValueAtTime(to, c.currentTime + start + dur)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, c.currentTime + start)
  g.gain.exponentialRampToValueAtTime(gain, c.currentTime + start + 0.05)
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur)
  src.connect(f)
  f.connect(g)
  g.connect(master)
  src.start(c.currentTime + start)
}

export const sfx = {
  pop() {
    tone(600, 0, 0.09, 'sine', 0.3, 900)
  },
  click() {
    tone(900, 0, 0.05, 'triangle', 0.15)
  },
  whoosh() {
    noise(0, 0.35, 0.12, 300, 3000)
  },
  star() {
    tone(1200, 0, 0.12, 'sine', 0.2)
    tone(1600, 0.08, 0.12, 'sine', 0.2)
    tone(2100, 0.16, 0.2, 'sine', 0.18)
  },
  /** Mjuk "hmm" vid fel, aldrig hård. */
  soft() {
    tone(420, 0, 0.18, 'sine', 0.12, 360)
  },
  boing() {
    tone(200, 0, 0.25, 'triangle', 0.25, 500)
  },
  tada() {
    tone(523, 0, 0.12, 'triangle', 0.25)
    tone(659, 0.1, 0.12, 'triangle', 0.25)
    tone(784, 0.2, 0.3, 'triangle', 0.25)
  },
  jingle() {
    const notes = [523, 659, 784, 1047, 784, 1047, 1319]
    notes.forEach((n, i) => tone(n, i * 0.11, 0.25, 'triangle', 0.22))
    tone(1568, 0.8, 0.6, 'sine', 0.2)
  },
  unlock() {
    noise(0, 0.5, 0.1, 200, 5000)
    tone(392, 0.2, 0.15, 'triangle', 0.22)
    tone(523, 0.35, 0.15, 'triangle', 0.22)
    tone(659, 0.5, 0.4, 'triangle', 0.22)
  },
  sneeze() {
    noise(0, 0.25, 0.2, 800, 200)
  },
  spin() {
    tone(300, 0, 0.4, 'sine', 0.15, 1200)
  },
}
