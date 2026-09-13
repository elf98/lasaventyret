import { Howl, Howler } from 'howler'
import { audioFileName } from '../content/audioIds'

export interface ManifestItem {
  file: string
  hash: string
  text: string
}

export interface Manifest {
  version: number
  voice: string
  items: Record<string, ManifestItem>
}

/** Hur länge vi "låtsas prata" när ett ljud saknas, så flödet inte hänger. */
const SILENT_MS = 450

/**
 * Allt tal går via denna klass. Prioritet per id:
 *   1. egen inspelning (override, blob-URL)
 *   2. förgenererad mp3 enligt manifestet
 *   3. tystnad (aldrig Web Speech API)
 */
class AudioManager {
  private manifest: Manifest | null = null
  private howls = new Map<string, Howl>()
  private overrides = new Map<string, { url: string; format: string }>()
  private token = 0
  private stopCurrent: (() => void) | null = null
  private warned = new Set<string>()
  ready = false

  async init(): Promise<void> {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}audio/manifest.json`, { cache: 'no-cache' })
      if (res.ok) this.manifest = (await res.json()) as Manifest
    } catch {
      this.manifest = null
    }
    this.ready = true
  }

  /** Anropas i första användarinteraktionen (iOS kräver det). */
  unlock(): void {
    Howler.autoUnlock = true
    Howler.volume(Howler.volume())
    const ctx = Howler.ctx as AudioContext | undefined
    if (ctx && ctx.state !== 'running') void ctx.resume()
  }

  setVolume(v: number): void {
    Howler.volume(Math.max(0, Math.min(1, v)))
  }

  has(id: string): boolean {
    return this.overrides.has(id) || !!this.manifest?.items[id]
  }

  manifestSize(): number {
    return this.manifest ? Object.keys(this.manifest.items).length : 0
  }

  setOverride(id: string, url: string, format = 'webm'): void {
    this.overrides.set(id, { url, format })
    this.howls.get(id)?.unload()
    this.howls.delete(id)
  }

  clearOverride(id: string): void {
    this.overrides.delete(id)
    this.howls.get(id)?.unload()
    this.howls.delete(id)
  }

  private urlFor(id: string): { url: string; format: string } | null {
    const o = this.overrides.get(id)
    if (o) return o
    const item = this.manifest?.items[id]
    if (item) return { url: `${import.meta.env.BASE_URL}audio/${item.file || audioFileName(id)}`, format: 'mp3' }
    return null
  }

  hasOverride(id: string): boolean {
    return this.overrides.has(id)
  }

  private howlFor(id: string): Howl | null {
    const cached = this.howls.get(id)
    if (cached) return cached
    const src = this.urlFor(id)
    if (!src) return null
    const h = new Howl({ src: [src.url], format: [src.format], html5: src.url.startsWith('blob:'), preload: true })
    this.howls.set(id, h)
    return h
  }

  preload(ids: string[]): void {
    ids.forEach((id) => this.howlFor(id))
  }

  /** Avbryter pågående tal och kö. */
  stop(): void {
    this.token++
    this.stopCurrent?.()
    this.stopCurrent = null
  }

  /** Spelar ett ljud och väntar tills det är klart. Saknat ljud = kort tystnad. */
  play(id: string): Promise<void> {
    const howl = this.howlFor(id)
    if (!howl) {
      if (import.meta.env.DEV && !this.warned.has(id)) {
        this.warned.add(id)
        console.info(`[audio] saknar ljud för "${id}" – kör npm run audio`)
      }
      return new Promise((resolve) => {
        const t = window.setTimeout(resolve, SILENT_MS)
        this.stopCurrent = () => {
          window.clearTimeout(t)
          resolve()
        }
      })
    }
    return new Promise((resolve) => {
      let done = false
      let watchdog = 0
      const finish = () => {
        if (done) return
        done = true
        window.clearTimeout(watchdog)
        this.stopCurrent = null
        resolve()
      }
      let cancelled = false
      const start = () => {
        if (cancelled) return
        const soundId = howl.play()
        howl.once('end', finish, soundId)
        howl.once('stop', finish, soundId)
        howl.once('playerror', finish, soundId)
        // Vakthund: om ljudet inte kan spelas (låst kontext, bakgrundsflik)
        // får flödet ändå gå vidare efter ljudets längd + marginal.
        watchdog = window.setTimeout(finish, (howl.duration(soundId) || 3) * 1000 + 1500)
        this.stopCurrent = () => {
          howl.stop(soundId)
          finish()
        }
      }
      if (howl.state() === 'loaded') start()
      else {
        howl.once('load', start)
        howl.once('loaderror', finish)
        watchdog = window.setTimeout(finish, 8000)
        this.stopCurrent = () => {
          cancelled = true
          howl.off('load', start)
          finish()
        }
      }
    })
  }

  /**
   * Talar en sekvens av id:n efter varandra. Ett nytt speak() avbryter
   * det föregående. Returnerar false om sekvensen avbröts.
   */
  speak(ids: string | string[], gapMs = 120): Promise<boolean> {
    return this.speakEach(Array.isArray(ids) ? ids : [ids], undefined, gapMs)
  }

  /**
   * Som speak(), men anropar onBefore(i) innan varje ljud (t.ex. för att
   * markera ordet som läses). Allt tal i appen ska gå via speak/speakEach
   * så att bara ett ljud spelas åt gången.
   */
  async speakEach(list: string[], onBefore?: (index: number) => void, gapMs = 120): Promise<boolean> {
    this.stop()
    const myToken = this.token
    for (let i = 0; i < list.length; i++) {
      if (myToken !== this.token) return false
      onBefore?.(i)
      await this.play(list[i])
      if (myToken !== this.token) return false
      if (i < list.length - 1 && gapMs > 0) await new Promise((r) => setTimeout(r, gapMs))
    }
    return myToken === this.token
  }

  /** Pågår tal just nu? */
  get speaking(): boolean {
    return this.stopCurrent !== null
  }
}

export const audio = new AudioManager()
