import Dexie, { type EntityTable } from 'dexie'
import { letterSoundId } from '../content/audioIds'
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
