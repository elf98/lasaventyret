import { useEffect, useRef, useState } from 'react'
import { audio } from '../audio/AudioManager'
import { canRecord, deleteRecording, deleteServerRecording, letterRecordingId, listRecordingIds, listServerRecordingIds, saveRecording, startRecording, uploadRecording, type Recorder } from '../audio/recordings'
import { autoTrim, cut, decodeBlob, drawWave, encodeWav, playClip, type Clip } from '../audio/wav'
import { letters } from '../content'
import { letterSoundId } from '../content/audioIds'

const MAX_MS = 3000

interface Draft {
  clip: Clip
  start: number
  end: number
}

/**
 * Guidat flöde för att spela in bokstavsljud med egen röst: välj bokstav, spela in (max 3 s), klipp
 * bort tystnaden (automatiskt, med reglage för att finjustera), lyssna, godkänn. Inspelningen sparas
 * som WAV på den här enheten OCH laddas upp till servern, så att iPaden hör den utan export/import.
 * Egen inspelning går alltid före TTS.
 */
export default function RecordLetters({ onBack }: { onBack: () => void }) {
  const [current, setCurrent] = useState(letters[0].id)
  const [local, setLocal] = useState<Set<string>>(new Set())
  const [server, setServer] = useState<Set<string>>(new Set())
  const [state, setState] = useState<'idle' | 'recording' | 'review' | 'saving'>('idle')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const recorder = useRef<Recorder | null>(null)
  const timer = useRef<number | null>(null)
  const stopPlay = useRef<(() => void) | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const letter = letters.find((l) => l.id === current)!

  useEffect(() => {
    void listRecordingIds().then((ids) => setLocal(new Set(ids.filter((id) => id.startsWith('letter.')).map((id) => id.slice(7)))))
    void listServerRecordingIds().then((ids) => setServer(new Set(ids.filter((id) => id.startsWith('letter.')).map((id) => id.slice(7)))))
  }, [])

  useEffect(() => {
    if (draft && canvas.current) drawWave(canvas.current, draft.clip, draft.start, draft.end)
  }, [draft])

  const begin = async () => {
    setError(null)
    setNotice(null)
    stopPlay.current?.()
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
    try {
      const clip = await decodeBlob(blob)
      const { start, end } = autoTrim(clip)
      setDraft({ clip, start, end })
      setState('review')
    } catch (e) {
      setError('Kunde inte läsa inspelningen: ' + (e as Error).message)
      setState('idle')
    }
  }

  const playDraft = () => {
    if (!draft) return
    stopPlay.current?.()
    stopPlay.current = playClip(draft.clip, draft.start, draft.end)
  }

  const approve = async () => {
    if (!draft) return
    stopPlay.current?.()
    setState('saving')
    const wav = encodeWav(cut(draft.clip, draft.start, draft.end))
    const id = letterRecordingId(current)
    await saveRecording(id, wav)
    setLocal((s) => new Set([...s, current]))
    const status = await uploadRecording(id, wav)
    if (status === 'saved') {
      setServer((s) => new Set([...s, current]))
      setNotice(`${current.toUpperCase()} sparad på servern: iPaden använder den vid nästa start.`)
    } else {
      setNotice(`${current.toUpperCase()} sparad på den här enheten, men servern tog inte emot den. Kör appen via npm run dev, eller se README om upload-recording.php.`)
    }
    setDraft(null)
    setState('idle')
    const i = letters.findIndex((l) => l.id === current)
    if (i + 1 < letters.length) setCurrent(letters[i + 1].id)
  }

  // Ett steg i taget: först den lokala (då hörs serverns), sedan serverns. Annars raderade ett tryck
  // på iPaden även inspelningen som gjorts på datorn.
  const remove = async () => {
    if (local.has(current)) {
      await deleteRecording(letterRecordingId(current))
      setLocal((s) => {
        const n = new Set(s)
        n.delete(current)
        return n
      })
      return
    }
    if (server.has(current) && (await deleteServerRecording(letterRecordingId(current)))) {
      setServer((s) => {
        const n = new Set(s)
        n.delete(current)
        return n
      })
    }
  }

  const ms = (samples: number) => (draft ? Math.round((samples / draft.clip.sampleRate) * 1000) : 0)
  const total = draft ? draft.clip.samples.length : 0
  const has = (id: string) => local.has(id) || server.has(id)

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
        </p>
      )}
      <p className="text-gray-600">
        Säg <b>ljudet</b>, inte bokstavens namn: "sss" inte "ess", "mmm" inte "emm". Vokaler sägs som det korta ljudet ("a" som i katt, "o" som i ost). Stopp-ljud (p, t, k, b, d, g) sägs kort och utan vokal efter.
        Tystnaden före och efter klipps bort automatiskt; dra i reglagen om klippet blev fel. Grön = inspelad, punkt = finns på servern (hörs på alla enheter).
      </p>

      <div className="flex flex-wrap gap-2">
        {letters.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => {
              stopPlay.current?.()
              setCurrent(l.id)
              setState('idle')
              setDraft(null)
              setNotice(null)
            }}
            className={`relative h-14 w-14 rounded-xl text-[24px] font-extrabold ${l.id === current ? 'ring-4 ring-space' : ''} ${has(l.id) ? 'bg-green-500 text-white' : 'bg-gray-200'}`}
          >
            {l.id.toUpperCase()}{l.id}
            {server.has(l.id) && <span className="absolute top-1 right-1 h-2.5 w-2.5 rounded-full bg-white" aria-label="på servern" />}
          </button>
        ))}
      </div>

      <div className="flex items-start gap-8 rounded-3xl bg-white p-6 shadow">
        <div className={`letter-card ${letter.type}`} style={{ width: 140, height: 140, fontSize: 70 }}>
          <span>{letter.id.toUpperCase()}</span>
          <span style={{ fontSize: 58 }}>{letter.id}</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="text-[24px]">
            Säg ljudet för <b>{letter.id.toUpperCase()}</b> som i <b>{letter.example}</b>
            {letter.type === 'vowel' ? ' (kort vokal, som i "' + letter.example + '")' : letter.continuous ? ' (dra ut det: "' + letter.id + letter.id + letter.id + '")' : ' (kort, utan vokal)'}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => void audio.speak(letterSoundId(current))} className="rounded-full bg-gray-200 px-5 py-3 text-[18px] font-bold">
              🔊 Lyssna på nuvarande
            </button>
            {state !== 'recording' ? (
              <button type="button" disabled={!canRecord() || state === 'saving'} onClick={() => void begin()} className="rounded-full bg-red-600 px-5 py-3 text-[18px] font-bold text-white disabled:opacity-40">
                ● Spela in
              </button>
            ) : (
              <button type="button" onClick={() => void end()} className="animate-pulse rounded-full bg-red-600 px-5 py-3 text-[18px] font-bold text-white">
                ■ Stoppa (spelar in …)
              </button>
            )}
            {has(current) && state === 'idle' && (
              <button type="button" onClick={() => void remove()} className="rounded-full bg-gray-200 px-5 py-3 text-[18px] font-bold">
                {local.has(current) ? '🗑 Ta bort inspelningen på den här enheten' : '🗑 Ta bort från servern'}
              </button>
            )}
          </div>

          {state === 'review' && draft && (
            <div className="flex flex-col gap-3 rounded-2xl bg-gray-50 p-4">
              <canvas ref={canvas} width={720} height={120} className="w-full rounded-xl" style={{ maxWidth: 720 }} />
              <div className="grid grid-cols-2 gap-6 text-[16px]">
                <label className="flex flex-col gap-1">
                  Start: {ms(draft.start)} ms
                  <input type="range" min={0} max={Math.max(0, draft.end - 1)} step={Math.round(draft.clip.sampleRate * 0.005)} value={draft.start} onChange={(e) => setDraft({ ...draft, start: Number(e.target.value) })} />
                </label>
                <label className="flex flex-col gap-1">
                  Slut: {ms(draft.end)} ms (längd {ms(draft.end - draft.start)} ms)
                  <input type="range" min={draft.start + 1} max={total} step={Math.round(draft.clip.sampleRate * 0.005)} value={draft.end} onChange={(e) => setDraft({ ...draft, end: Number(e.target.value) })} />
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={playDraft} className="rounded-full bg-sun px-5 py-3 text-[18px] font-bold">▶ Lyssna på klippet</button>
                <button type="button" onClick={() => setDraft({ ...draft, ...autoTrim(draft.clip) })} className="rounded-full bg-gray-200 px-5 py-3 text-[18px] font-bold">✂ Klipp automatiskt</button>
                <button type="button" onClick={() => setDraft({ ...draft, start: 0, end: total })} className="rounded-full bg-gray-200 px-5 py-3 text-[18px] font-bold">Hela inspelningen</button>
                <button type="button" onClick={() => void approve()} className="rounded-full bg-go px-5 py-3 text-[18px] font-bold text-white">✓ Godkänn och spara</button>
                <button type="button" onClick={() => void begin()} className="rounded-full bg-gray-200 px-5 py-3 text-[18px] font-bold">↻ Gör om</button>
              </div>
            </div>
          )}
          {state === 'saving' && <div className="text-gray-600">Sparar …</div>}
          {notice && <div className="rounded-xl bg-green-100 px-4 py-2 text-green-900">{notice}</div>}
          {error && <div className="text-red-600">{error}</div>}
        </div>
      </div>
    </div>
  )
}
