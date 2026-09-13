import { useEffect, useRef, useState } from 'react'
import { audio } from '../audio/AudioManager'
import { canRecord, deleteRecording, letterRecordingId, listRecordingIds, saveRecording, startRecording, type Recorder } from '../audio/recordings'
import { letters } from '../content'
import { letterSoundId } from '../content/audioIds'

const MAX_MS = 3000

/**
 * Guidat flöde för att spela in bokstavsljud med egen röst:
 * välj bokstav, spela in (max 3 s), lyssna, godkänn. Egen inspelning går alltid före TTS.
 */
export default function RecordLetters({ onBack }: { onBack: () => void }) {
  const [current, setCurrent] = useState(letters[0].id)
  const [recorded, setRecorded] = useState<Set<string>>(new Set())
  const [state, setState] = useState<'idle' | 'recording' | 'review'>('idle')
  const [draft, setDraft] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const recorder = useRef<Recorder | null>(null)
  const timer = useRef<number | null>(null)
  const draftUrl = useRef<string | null>(null)
  const letter = letters.find((l) => l.id === current)!

  useEffect(() => {
    void listRecordingIds().then((ids) => setRecorded(new Set(ids.filter((id) => id.startsWith('letter.')).map((id) => id.slice(7)))))
  }, [])

  const begin = async () => {
    setError(null)
    try {
      recorder.current = await startRecording()
      setState('recording')
      timer.current = window.setTimeout(() => void end(), MAX_MS)
    } catch (e) {
      setError('Kunde inte starta mikrofonen: ' + (e as Error).message)
    }
  }

  const end = async () => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = null
    const r = recorder.current
    recorder.current = null
    if (!r) return
    const blob = await r.stop()
    setDraft(blob)
    if (draftUrl.current) URL.revokeObjectURL(draftUrl.current)
    draftUrl.current = URL.createObjectURL(blob)
    setState('review')
  }

  const playDraft = () => {
    if (!draftUrl.current) return
    const a = new Audio(draftUrl.current)
    void a.play()
  }

  const approve = async () => {
    if (!draft) return
    await saveRecording(letterRecordingId(current), draft)
    setRecorded((s) => new Set([...s, current]))
    setDraft(null)
    setState('idle')
    const i = letters.findIndex((l) => l.id === current)
    if (i + 1 < letters.length) setCurrent(letters[i + 1].id)
  }

  const remove = async () => {
    await deleteRecording(letterRecordingId(current))
    setRecorded((s) => {
      const n = new Set(s)
      n.delete(current)
      return n
    })
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[32px] font-extrabold">Spela in bokstavsljud</h1>
        <button type="button" onClick={onBack} className="rounded-full bg-space px-6 py-3 text-[20px] font-bold text-white">
          Tillbaka
        </button>
      </div>
      {!canRecord() && (
        <p className="rounded-xl bg-orange-100 p-4">
          Inspelning kräver mikrofon och en säker sida (https eller localhost). På iPaden fungerar det när appen ligger på lasaventyret.elf98.com.
          Du kan också spela in här på datorn och flytta inspelningarna med Exportera/Importera.
        </p>
      )}
      <p className="text-gray-600">
        Säg <b>ljudet</b>, inte bokstavens namn: "sss" inte "ess", "mmm" inte "emm". Stopp-ljud (p, t, k, b, d, g) sägs kort och utan vokal efter.
        Grön = inspelad. Inspelningen används i alla spel i stället för TTS-rösten.
      </p>

      <div className="flex flex-wrap gap-2">
        {letters.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => {
              setCurrent(l.id)
              setState('idle')
              setDraft(null)
            }}
            className={`h-14 w-14 rounded-xl text-[24px] font-extrabold ${l.id === current ? 'ring-4 ring-space' : ''} ${recorded.has(l.id) ? 'bg-green-500 text-white' : 'bg-gray-200'}`}
          >
            {l.id.toUpperCase()}{l.id}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-8 rounded-3xl bg-white p-6 shadow">
        <div className={`letter-card ${letter.type}`} style={{ width: 140, height: 140, fontSize: 70 }}>
          <span>{letter.id.toUpperCase()}</span>
          <span style={{ fontSize: 58 }}>{letter.id}</span>
        </div>
        <div className="flex flex-col gap-3">
          <div className="text-[24px]">
            Säg ljudet för <b>{letter.id.toUpperCase()}</b> som i <b>{letter.example}</b>
            {letter.continuous ? ' (dra ut det: "' + letter.id + letter.id + letter.id + '")' : ' (kort, utan vokal)'}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => void audio.speak(letterSoundId(current))} className="rounded-full bg-gray-200 px-5 py-3 text-[18px] font-bold">
              🔊 Lyssna på nuvarande
            </button>
            {state !== 'recording' ? (
              <button type="button" disabled={!canRecord()} onClick={() => void begin()} className="rounded-full bg-red-600 px-5 py-3 text-[18px] font-bold text-white disabled:opacity-40">
                ● Spela in
              </button>
            ) : (
              <button type="button" onClick={() => void end()} className="animate-pulse rounded-full bg-red-600 px-5 py-3 text-[18px] font-bold text-white">
                ■ Stoppa (spelar in …)
              </button>
            )}
            {state === 'review' && (
              <>
                <button type="button" onClick={playDraft} className="rounded-full bg-sun px-5 py-3 text-[18px] font-bold">▶ Lyssna</button>
                <button type="button" onClick={() => void approve()} className="rounded-full bg-go px-5 py-3 text-[18px] font-bold text-white">✓ Godkänn</button>
                <button type="button" onClick={() => void begin()} className="rounded-full bg-gray-200 px-5 py-3 text-[18px] font-bold">↻ Gör om</button>
              </>
            )}
            {recorded.has(current) && state === 'idle' && (
              <button type="button" onClick={() => void remove()} className="rounded-full bg-gray-200 px-5 py-3 text-[18px] font-bold">🗑 Ta bort inspelning</button>
            )}
          </div>
          {error && <div className="text-red-600">{error}</div>}
        </div>
      </div>
    </div>
  )
}
