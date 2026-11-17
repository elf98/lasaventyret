import { useEffect, useRef, useState } from 'react'
import { audio } from '../audio/AudioManager'
import { canRecord, checkRecordingKey, deleteRecording, deleteServerRecording, letterRecordingId, listRecordingIds, listServerRecordingIds, listUnsyncedRecordingIds, recordingKey, saveRecording, setRecordingKey, startRecording, uploadLocalRecording, uploadRecording, type Recorder } from '../audio/recordings'
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
  /** En ruta per ljud: bokstavens id, eller "<id>.long" för vokalens långa ljud (inspelnings-id letter.<ruta>). */
  const slots = [...letters.map((l) => l.id), ...letters.filter((l) => l.longExample).map((l) => `${l.id}.long`)]
  const [current, setCurrent] = useState(letters[0].id)
  const [local, setLocal] = useState<Set<string>>(new Set())
  const [server, setServer] = useState<Set<string>>(new Set())
  const [state, setState] = useState<'idle' | 'recording' | 'review' | 'saving'>('idle')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  /** Rutor vars inspelning bara finns på den här enheten (eller är en annan än serverns). */
  const [unsynced, setUnsynced] = useState<Set<string>>(new Set())
  const [syncing, setSyncing] = useState(false)
  const refreshUnsynced = () => listUnsyncedRecordingIds().then((ids) => setUnsynced(new Set(ids.filter((id) => id.startsWith('letter.')).map((id) => id.slice(7)))))
  /** Har enheten lösenordet sparas inspelningarna för alla; annars bara här. */
  const [shared, setShared] = useState(() => recordingKey() !== '')
  const [keyDraft, setKeyDraft] = useState('')
  const [keyError, setKeyError] = useState(false)
  const unlock = async () => {
    const key = keyDraft.trim()
    if (!key) return
    if (await checkRecordingKey(key)) {
      setRecordingKey(key)
      setShared(true)
      setKeyDraft('')
      setKeyError(false)
    } else setKeyError(true)
  }
  const recorder = useRef<Recorder | null>(null)
  const timer = useRef<number | null>(null)
  const stopPlay = useRef<(() => void) | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const letter = letters.find((l) => l.id === current.split('.')[0])!
  const long = current.endsWith('.long')
  const label = (slot: string) => slot.split('.')[0].toUpperCase() + (slot.endsWith('.long') ? ' lång' : '')

  useEffect(() => {
    void listRecordingIds().then((ids) => setLocal(new Set(ids.filter((id) => id.startsWith('letter.')).map((id) => id.slice(7)))))
    void listServerRecordingIds().then((ids) => setServer(new Set(ids.filter((id) => id.startsWith('letter.')).map((id) => id.slice(7)))))
    void refreshUnsynced()
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
      setNotice(`${label(current)} sparad på servern: iPaden använder den vid nästa start.`)
    } else if (status === 'denied') {
      setNotice(`${label(current)} sparad på den här enheten. Den hörs bara här.`)
    } else {
      setNotice(`${label(current)} sparad på den här enheten, men servern tog inte emot den. Kör appen via npm run dev, eller se README om upload-recording.php.`)
    }
    void refreshUnsynced()
    setDraft(null)
    setState('idle')
    const i = slots.indexOf(current)
    if (i + 1 < slots.length) setCurrent(slots[i + 1])
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

  /** Laddar upp allt som bara finns här. Kräver lösenordet; utan det säger servern nej på första. */
  const uploadAll = async () => {
    setSyncing(true)
    let sent = 0
    let failed = 0
    let denied = false
    for (const slot of slots.filter((x) => unsynced.has(x))) {
      const status = await uploadLocalRecording(letterRecordingId(slot))
      if (status === 'saved') sent++
      else if (status === 'denied') {
        denied = true
        break
      } else failed++
    }
    void listServerRecordingIds().then((ids) => setServer(new Set(ids.filter((id) => id.startsWith('letter.')).map((id) => id.slice(7)))))
    await refreshUnsynced()
    setSyncing(false)
    if (denied) {
      setShared(false)
      setRecordingKey('')
      setNotice(null)
      setError('Servern godkände inte lösenordet. Skriv in det igen längst ner.')
    } else {
      setError(null)
      setNotice(`${sent} ${sent === 1 ? 'inspelning uppladdad' : 'inspelningar uppladdade'}${failed ? `, ${failed} gick inte att ladda upp (spela in dem igen)` : ''}.`)
    }
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
        </p>
      )}
      <p className="text-gray-600">
        Säg <b>ljudet</b>, inte bokstavens namn: "sss" inte "ess", "mmm" inte "emm". Vokaler har två rutor: det korta ljudet ("a" som i katt, "o" som i ost) och det långa i rutorna märkta "lång" ("a" som i glas, "o" som i sol). Stopp-ljud (p, t, k, b, d, g) sägs kort och utan vokal efter.
        Tystnaden före och efter klipps bort automatiskt; dra i reglagen om klippet blev fel. Grön = finns på servern (hörs på alla enheter). Orange = finns bara på den här enheten. Grå = inte inspelad.
      </p>

      <div className="flex flex-wrap gap-2">
        {slots.map((slot) => ({ id: slot })).map((l) => (
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
            className={`relative h-14 ${l.id.endsWith('.long') ? 'px-3' : 'w-14'} rounded-xl text-[24px] font-extrabold ${l.id === current ? 'ring-4 ring-space' : ''} ${unsynced.has(l.id) ? 'bg-orange-400 text-white' : has(l.id) ? 'bg-green-500 text-white' : 'bg-gray-200'}`}
          >
            {l.id.endsWith('.long') ? `${l.id[0].toUpperCase()}${l.id[0]} lång` : `${l.id.toUpperCase()}${l.id}`}
          </button>
        ))}
      </div>

      {unsynced.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-orange-100 px-4 py-3 text-[17px] text-orange-950">
          <span>
            <b>{unsynced.size} {unsynced.size === 1 ? 'inspelning finns' : 'inspelningar finns'} bara på den här enheten:</b> {slots.filter((x) => unsynced.has(x)).map(label).join(', ')}.
          </span>
          {shared ? (
            <button type="button" disabled={syncing} onClick={() => void uploadAll()} className="rounded-full bg-orange-500 px-5 py-2 font-bold text-white disabled:opacity-50">
              {syncing ? 'Laddar upp …' : 'Ladda upp dem till servern'}
            </button>
          ) : (
            <span>Skriv in lösenordet längst ner för att kunna ladda upp dem.</span>
          )}
        </div>
      )}

      <div className="flex items-start gap-8 rounded-3xl bg-white p-6 shadow">
        <div className={`letter-card ${letter.type}`} style={{ width: 140, height: 140, fontSize: 70 }}>
          <span>{letter.id.toUpperCase()}</span>
          <span style={{ fontSize: 58 }}>{letter.id}</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="text-[24px]">
            Säg {long ? 'det långa ljudet' : 'ljudet'} för <b>{letter.id.toUpperCase()}</b> som i <b>{long ? letter.longExample : letter.example}</b>
            {long ? ' (lång vokal, dra ut den: "' + letter.id.repeat(3) + '")' : letter.type === 'vowel' ? ' (kort vokal, som i "' + letter.example + '")' : letter.continuous ? ' (dra ut det: "' + letter.id + letter.id + letter.id + '")' : ' (kort, utan vokal)'}
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
          {shared ? (
            <div className="text-[15px] text-gray-600">
              Den här enheten sparar inspelningarna för alla.{' '}
              <button type="button" className="underline" onClick={() => { setRecordingKey(''); setShared(false) }}>
                Sluta med det
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-[15px] text-gray-600">
              <span>Inspelningarna sparas bara på den här enheten. Lösenord för att spara för alla:</span>
              <input type="password" value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void unlock() }} className="rounded-lg border border-gray-300 px-3 py-1" aria-label="Lösenord" />
              <button type="button" onClick={() => void unlock()} className="rounded-full bg-gray-200 px-4 py-1 font-bold">Lås upp</button>
              {keyError && <span className="text-red-600">Fel lösenord.</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
