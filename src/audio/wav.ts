/**
 * Ljudverktyg i webbläsaren för egna inspelningar: avkoda, hitta var ljudet börjar och slutar,
 * klipp, och koda som 16-bitars mono-WAV. Ingen ffmpeg behövs: WAV spelas överallt.
 */

export interface Clip {
  samples: Float32Array
  sampleRate: number
}

export async function decodeBlob(blob: Blob): Promise<Clip> {
  const ctx = new AudioContext()
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer())
    // Mono: medelvärde av kanalerna.
    const out = new Float32Array(buf.length)
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const ch = buf.getChannelData(c)
      for (let i = 0; i < out.length; i++) out[i] += ch[i] / buf.numberOfChannels
    }
    return { samples: out, sampleRate: buf.sampleRate }
  } finally {
    void ctx.close()
  }
}

/**
 * Var ljudet börjar och slutar, i sampel. Energi per 10 ms; tröskeln ligger strax över brusgolvet
 * (viskade ljud som h är svaga) och start/slut får lite luft så att inget klipps av.
 */
export function autoTrim(clip: Clip): { start: number; end: number } {
  const { samples, sampleRate } = clip
  const frame = Math.round(sampleRate * 0.01)
  const frames = Math.floor(samples.length / frame)
  if (frames < 3) return { start: 0, end: samples.length }
  const rms: number[] = []
  for (let f = 0; f < frames; f++) {
    let e = 0
    for (let i = f * frame; i < (f + 1) * frame; i++) e += samples[i] * samples[i]
    rms.push(Math.sqrt(e / frame))
  }
  const peak = Math.max(...rms)
  const noise = [...rms].sort((a, b) => a - b)[Math.floor(rms.length * 0.1)] || 0
  const floor = Math.max(noise * 4, peak * 0.04)
  let a = rms.findIndex((v) => v > floor)
  let b = rms.length - 1
  while (b > a && rms[b] <= floor) b--
  if (a < 0) return { start: 0, end: samples.length }
  a = Math.max(0, a - 3)
  b = Math.min(frames - 1, b + 8)
  return { start: a * frame, end: Math.min(samples.length, (b + 1) * frame) }
}

/** Klipper ut [start, end) med kort in- och uttoning. */
export function cut(clip: Clip, start: number, end: number): Clip {
  const out = clip.samples.slice(Math.max(0, start), Math.min(clip.samples.length, end))
  const fadeIn = Math.min(out.length, Math.round(clip.sampleRate * 0.01))
  const fadeOut = Math.min(out.length, Math.round(clip.sampleRate * 0.03))
  for (let i = 0; i < fadeIn; i++) out[i] *= i / fadeIn
  for (let i = 0; i < fadeOut; i++) out[out.length - 1 - i] *= i / fadeOut
  return { samples: out, sampleRate: clip.sampleRate }
}

/** 16-bitars mono-WAV. Normaliserar toppen till −1 dB så att alla bokstäver låter lika starkt. */
export function encodeWav(clip: Clip): Blob {
  const { samples, sampleRate } = clip
  let peak = 0
  for (const v of samples) peak = Math.max(peak, Math.abs(v))
  const gain = peak > 0 ? Math.min(4, 0.89 / peak) : 1
  const buf = new ArrayBuffer(44 + samples.length * 2)
  const v = new DataView(buf)
  const str = (off: number, s: string) => [...s].forEach((c, i) => v.setUint8(off + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  v.setUint32(4, 36 + samples.length * 2, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, sampleRate, true)
  v.setUint32(28, sampleRate * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  str(36, 'data')
  v.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, Math.round(samples[i] * gain * 32767))), true)
  return new Blob([buf], { type: 'audio/wav' })
}

/** Spelar ett klipp direkt ur minnet. Returnerar en stoppfunktion. */
export function playClip(clip: Clip, start: number, end: number): () => void {
  const ctx = new AudioContext()
  const c = cut(clip, start, end)
  const buffer = ctx.createBuffer(1, Math.max(1, c.samples.length), c.sampleRate)
  buffer.getChannelData(0).set(c.samples)
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.connect(ctx.destination)
  src.onended = () => void ctx.close()
  src.start()
  return () => {
    try {
      src.stop()
    } catch {
      /* redan stoppad */
    }
  }
}

/** Ritar vågformen i en canvas, med det valda avsnittet markerat. */
export function drawWave(canvas: HTMLCanvasElement, clip: Clip, start: number, end: number): void {
  const g = canvas.getContext('2d')
  if (!g) return
  const { width, height } = canvas
  g.clearRect(0, 0, width, height)
  g.fillStyle = '#f3f4f6'
  g.fillRect(0, 0, width, height)
  const x0 = (start / clip.samples.length) * width
  const x1 = (end / clip.samples.length) * width
  g.fillStyle = 'rgba(255, 204, 51, 0.35)'
  g.fillRect(x0, 0, x1 - x0, height)
  g.fillStyle = '#17204a'
  const per = clip.samples.length / width
  for (let x = 0; x < width; x++) {
    let lo = 0
    let hi = 0
    const from = Math.floor(x * per)
    const to = Math.min(clip.samples.length, Math.floor((x + 1) * per))
    for (let i = from; i < to; i++) {
      const s = clip.samples[i]
      if (s < lo) lo = s
      if (s > hi) hi = s
    }
    const mid = height / 2
    g.fillRect(x, mid - hi * mid, 1, Math.max(1, (hi - lo) * mid))
  }
  g.fillStyle = '#ff5d73'
  g.fillRect(x0 - 1, 0, 2, height)
  g.fillRect(x1 - 1, 0, 2, height)
}
