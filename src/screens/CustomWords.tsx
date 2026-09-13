import { useEffect, useRef, useState } from 'react'
import { audio } from '../audio/AudioManager'
import { canRecord, deleteRecording, listRecordingIds, saveRecording, startRecording, type Recorder } from '../audio/recordings'
import { wordId } from '../content/audioIds'
import { deleteCustomWord, listCustomWords, saveCustomWord, soundsOf, type CustomWord } from '../content/custom'

/**
 * Egna ord: text + emoji + inspelat uttal. Utan inspelning är ordet tyst i spelen
 * (TTS finns bara för orden i words.json), så inspelningen är i praktiken obligatorisk.
 */
export default function CustomWords() {
  const [list, setList] = useState<CustomWord[]>([])
  const [recorded, setRecorded] = useState<Set<string>>(new Set())
  const [text, setText] = useState('')
  const [emoji, setEmoji] = useState('')
  const [decodable, setDecodable] = useState(true)
  const [recordingFor, setRecordingFor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const recorder = useRef<Recorder | null>(null)

  const refresh = async () => {
    setList(await listCustomWords())
    setRecorded(new Set((await listRecordingIds()).filter((id) => id.startsWith('word.c:'))))
  }
  useEffect(() => {
    void refresh()
  }, [])

  const add = async () => {
    setError(null)
    try {
      if (!emoji.trim()) throw new Error('Lägg till en emoji som bild (Windows: Win + punkt, iPad: emoji-tangentbordet)')
      await saveCustomWord(text, emoji, decodable)
      setText('')
      setEmoji('')
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const record = async (id: string) => {
    setError(null)
    if (recordingFor === id) {
      const r = recorder.current
      recorder.current = null
      setRecordingFor(null)
      if (r) await saveRecording(wordId(id), await r.stop())
      await refresh()
      return
    }
    try {
      recorder.current = await startRecording()
      setRecordingFor(id)
      window.setTimeout(() => {
        if (recorder.current) void record(id)
      }, 3000)
    } catch (e) {
      setError('Kunde inte starta mikrofonen: ' + (e as Error).message)
    }
  }

  const remove = async (id: string) => {
    await deleteCustomWord(id)
    if (recorded.has(wordId(id))) await deleteRecording(wordId(id))
    await refresh()
  }

  return (
    <section>
      <h2 className="mb-3 text-[24px] font-bold">Egna ord</h2>
      <p className="mb-2 text-[15px] text-gray-500">
        Skriv ordet med små bokstäver, välj en emoji som bild och spela in hur det låter. Ljudenliga ord dyker upp i Ljudtåget, Bygg ordet och Vilket ord? så snart barnet mött alla bokstäver i ordet.
      </p>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="ord, t.ex. traktor" className="h-12 rounded-xl border border-gray-300 px-3 text-[20px]" />
        <input value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder="emoji 🚜" className="h-12 w-28 rounded-xl border border-gray-300 px-3 text-[24px]" />
        <label className="flex items-center gap-2">
          <input type="checkbox" className="h-5 w-5" checked={decodable} onChange={(e) => setDecodable(e.target.checked)} /> ljudenligt
        </label>
        <button type="button" onClick={() => void add()} className="rounded-full bg-space px-5 py-2 font-bold text-white">
          Lägg till
        </button>
        {text && <span className="text-gray-500">ljud: {soundsOf(text).join(' – ')}</span>}
      </div>
      {error && <p className="mb-2 text-red-600">{error}</p>}
      {list.length === 0 ? (
        <p className="text-gray-500">Inga egna ord än.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((w) => {
            const has = recorded.has(wordId(w.id))
            return (
              <li key={w.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-white px-4 py-2 shadow-sm">
                <span className="text-[32px]">{w.emoji}</span>
                <b className="text-[22px]">{w.text}</b>
                <span className="text-gray-500">{w.decodable ? 'ljudenligt' : 'bara bild'}</span>
                <span className={`rounded-full px-3 py-1 text-[14px] ${has ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'}`}>{has ? 'inspelat' : 'saknar ljud'}</span>
                <button type="button" disabled={!canRecord()} onClick={() => void record(w.id)} className={`rounded-full px-4 py-1 font-bold text-white disabled:opacity-40 ${recordingFor === w.id ? 'animate-pulse bg-red-700' : 'bg-red-600'}`}>
                  {recordingFor === w.id ? '■ Stoppa' : '● Spela in'}
                </button>
                {has && (
                  <button type="button" onClick={() => void audio.speak(wordId(w.id))} className="rounded-full bg-sun px-4 py-1 font-bold">
                    ▶ Lyssna
                  </button>
                )}
                <button type="button" onClick={() => void remove(w.id)} className="rounded-full bg-gray-200 px-4 py-1 font-bold">
                  🗑
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
