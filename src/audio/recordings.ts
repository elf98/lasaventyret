import Dexie, { type EntityTable } from 'dexie'
import { audioFileName, letterSoundId } from '../content/audioIds'
import { audio } from './AudioManager'

/** Egen inspelning av ett bokstavsljud (eller annat ljud-id). */
export interface Recording {
  /** Ljud-id, t.ex. "letter.s". */
  id: string
  blob: Blob
  mime: string
  createdAt: number
}

const db = new Dexie('lasaventyret') as Dexie & { recordings: EntityTable<Recording, 'id'> }
db.version(1).stores({ recordings: 'id, createdAt' })

const urls = new Map<string, string>()

/** Howler behöver ett format för blob-URL:er (ingen filändelse). */
export function formatFor(mime: string): string {
  if (mime.includes('webm')) return 'webm'
  if (mime.includes('mp4') || mime.includes('aac')) return 'm4a'
  if (mime.includes('ogg')) return 'ogg'
  if (mime.includes('wav')) return 'wav'
  return 'mp3'
}

function activate(rec: Recording): void {
  const old = urls.get(rec.id)
  if (old) URL.revokeObjectURL(old)
  const url = URL.createObjectURL(rec.blob)
  urls.set(rec.id, url)
  audio.setOverride(rec.id, url, formatFor(rec.mime))
}

/** Läser in alla inspelningar och låter dem gå före TTS-ljuden. */
export async function loadRecordings(): Promise<string[]> {
  try {
    const all = await db.recordings.toArray()
    all.forEach(activate)
    return all.map((r) => r.id)
  } catch {
    return []
  }
}

export async function saveRecording(id: string, blob: Blob): Promise<void> {
  const rec: Recording = { id, blob, mime: blob.type || 'audio/webm', createdAt: Date.now() }
  await db.recordings.put(rec)
  activate(rec)
}

export async function deleteRecording(id: string): Promise<void> {
  await db.recordings.delete(id)
  const old = urls.get(id)
  if (old) URL.revokeObjectURL(old)
  urls.delete(id)
  audio.clearOverride(id)
}

export async function listRecordingIds(): Promise<string[]> {
  return (await db.recordings.toArray()).map((r) => r.id)
}

export const letterRecordingId = (letterId: string) => letterSoundId(letterId)

/** Inspelning via MediaRecorder. iOS Safari ger audio/mp4, Chrome audio/webm. */
export function canRecord(): boolean {
  return typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined' && window.isSecureContext
}

export interface Recorder {
  stop: () => Promise<Blob>
}

export async function startRecording(): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((m) => MediaRecorder.isTypeSupported(m))
  const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data)
  rec.start()
  return {
    stop: () =>
      new Promise<Blob>((resolve) => {
        rec.onstop = () => {
          stream.getTracks().forEach((t) => t.stop())
          resolve(new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' }))
        }
        rec.stop()
      }),
  }
}

/* ---------- Inspelningar på servern: spela in på datorn, hörs på iPaden utan export/import ---------- */

interface ServerIndex {
  items: Record<string, { file: string; hash: string }>
}

const serverIndexUrl = () => `${import.meta.env.BASE_URL}recorded/index.json`

/**
 * Hämtar listan över inspelningar som laddats upp till servern och låter dem gå före TTS-ljuden
 * (men efter en lokal inspelning på samma enhet). Filerna cachas länge; ?v=hash ger ny URL vid ny inspelning.
 */
export async function loadServerRecordings(): Promise<string[]> {
  try {
    const res = await fetch(serverIndexUrl(), { cache: 'no-cache' })
    if (!res.ok) return []
    const index = (await res.json()) as ServerIndex
    const ids: string[] = []
    for (const [id, item] of Object.entries(index.items ?? {})) {
      audio.setServerRecording(id, `${import.meta.env.BASE_URL}recorded/${item.file}?v=${item.hash}`, item.file.endsWith('.wav') ? 'wav' : 'mp3')
      ids.push(id)
    }
    return ids
  } catch {
    return []
  }
}

export async function listServerRecordingIds(): Promise<string[]> {
  try {
    const res = await fetch(serverIndexUrl(), { cache: 'no-cache' })
    if (!res.ok) return []
    return Object.keys(((await res.json()) as ServerIndex).items ?? {})
  } catch {
    return []
  }
}

/**
 * Laddar upp en inspelning (WAV) till servern. Samma adress tas emot av Vites dev-server (skriver till
 * public/recorded/) och av upload-recording.php på servern. 'unavailable' = ingen mottagare där appen kör.
 */
export async function uploadRecording(id: string, blob: Blob): Promise<'saved' | 'unavailable'> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}upload-recording.php?id=${encodeURIComponent(id)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'audio/wav', 'X-Recording-Key': 'lasaventyret' },
      body: blob,
    })
    if (!res.ok) return 'unavailable'
    const data = (await res.json()) as { ok?: boolean; file?: string; hash?: string }
    if (!data.ok) return 'unavailable'
    audio.setServerRecording(id, `${import.meta.env.BASE_URL}recorded/${data.file ?? audioFileName(id).replace(/\.mp3$/, '.wav')}?v=${data.hash ?? Date.now()}`, 'wav')
    return 'saved'
  } catch {
    return 'unavailable'
  }
}

export async function deleteServerRecording(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}upload-recording.php?id=${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'X-Recording-Key': 'lasaventyret' } })
    if (res.ok) audio.clearServerRecording(id)
    return res.ok
  } catch {
    return false
  }
}

/** Export/import: inspelningar som base64 i progress-JSON så de kan flyttas mellan enheter. */
export async function exportRecordings(): Promise<Record<string, { mime: string; data: string }>> {
  const out: Record<string, { mime: string; data: string }> = {}
  for (const r of await db.recordings.toArray()) out[r.id] = { mime: r.mime, data: await blobToBase64(r.blob) }
  return out
}

export async function importRecordings(data: Record<string, { mime: string; data: string }>): Promise<number> {
  let n = 0
  for (const [id, r] of Object.entries(data)) {
    const bytes = Uint8Array.from(atob(r.data), (c) => c.charCodeAt(0))
    await saveRecording(id, new Blob([bytes], { type: r.mime }))
    n++
  }
  return n
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result).split(',')[1] ?? '')
    fr.onerror = () => reject(fr.error)
    fr.readAsDataURL(blob)
  })
}
