import { useRef, useState } from 'react'
import { exportRecordings, importRecordings } from '../audio/recordings'
import RecordLetters from './RecordLetters'
import CustomWords from './CustomWords'
import { exportCustomWords, importCustomWords, type CustomWord } from '../content/custom'
import { letters, levels, words } from '../content'
import { masteryKey, weakness } from '../engine/mastery'
import { levelProgress } from '../engine/unlock'
import { useApp } from '../store/app'
import { useProgress, type ProgressData } from '../store/progress'
import { useSettings } from '../store/settings'

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })
}

/** Föräldravyn (fas 1: progression, senaste pass, inställningar, export/import). */
export default function ParentScreen() {
  const go = useApp((s) => s.go)
  const p = useProgress()
  const settings = useSettings()
  const fileInput = useRef<HTMLInputElement>(null)
  const [view, setView] = useState<'main' | 'record'>('main')

  const struggling = letters
    .map((l) => ({ l, m: p.mastery[l.id] }))
    .filter((x) => x.m && x.m.attempts >= 2 && !x.m.mastered && weakness(x.m) >= 3)
    .sort((a, b) => weakness(b.m) - weakness(a.m))

  const exportJson = async () => {
    const data = { ...p.exportData(), recordings: await exportRecordings(), customWords: await exportCustomWords() }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `lasaventyret-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }

  const importJson = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as ProgressData & { recordings?: Record<string, { mime: string; data: string }>; customWords?: CustomWord[] }
      if (typeof data !== 'object' || !data.mastery) throw new Error('fel format')
      p.importData(data)
      const n = data.recordings ? await importRecordings(data.recordings) : 0
      const w = data.customWords ? await importCustomWords(data.customWords) : 0
      alert(`Importerat!${n ? ` ${n} inspelningar.` : ''}${w ? ` ${w} egna ord.` : ''}`)
    } catch (e) {
      alert('Kunde inte läsa filen: ' + (e as Error).message)
    }
  }

  const status = (id: string) => {
    const m = p.mastery[id]
    if (!m || m.attempts === 0) return 'bg-gray-200 text-gray-500'
    if (m.mastered) return 'bg-green-500 text-white'
    if (m.streak > 0) return 'bg-yellow-300 text-space'
    return 'bg-orange-300 text-space'
  }

  if (view === 'record') {
    return (
      <div className="screen overflow-y-auto bg-gray-50 p-6 text-[18px] text-space">
        <RecordLetters onBack={() => setView('main')} />
      </div>
    )
  }

  return (
    <div className="screen overflow-y-auto bg-gray-50 p-6 text-[18px] text-space">
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[32px] font-extrabold">Föräldravy</h1>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setView('record')} className="rounded-full bg-red-600 px-6 py-3 text-[20px] font-bold text-white">
              🎙️ Spela in bokstavsljud
            </button>
            <button type="button" onClick={() => go('map')} className="rounded-full bg-space px-6 py-3 text-[20px] font-bold text-white">
              Tillbaka till appen
            </button>
          </div>
        </div>

        <section>
          <h2 className="mb-3 text-[24px] font-bold">Bokstäver</h2>
          <div className="flex flex-wrap gap-2">
            {letters.map((l) => {
              const m = p.mastery[l.id]
              return (
                <div key={l.id} title={m ? `${m.attempts} försök, ${m.errors} fel, ${m.streak} rätt i rad` : 'inte tränad än'} className={`flex h-16 w-16 flex-col items-center justify-center rounded-2xl font-extrabold ${status(l.id)}`}>
                  <span className="text-[26px] leading-none">{l.id.toUpperCase()}{l.id}</span>
                  {m && m.attempts > 0 && <span className="text-[12px] font-semibold">{m.attempts - m.errors}/{m.attempts}</span>}
                </div>
              )
            })}
          </div>
          <p className="mt-2 text-[15px] text-gray-500">Grå = inte tränad, orange = fel senast, gul = på gång, grön = behärskad (3 rätt i rad över minst 2 pass).</p>
        </section>

        <section>
          <h2 className="mb-3 text-[24px] font-bold">Kämpar med</h2>
          {struggling.length === 0 ? (
            <p className="text-gray-500">Inget särskilt just nu.</p>
          ) : (
            <ul className="flex flex-wrap gap-3">
              {struggling.map(({ l, m }) => (
                <li key={l.id} className="rounded-xl bg-orange-100 px-4 py-2">
                  <b>{l.id.toUpperCase()}{l.id}</b> – {m!.errors} fel av {m!.attempts}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-[24px] font-bold">Ord</h2>
          {(() => {
            const seen = words.filter((w) => p.mastery[masteryKey('word', w.id)]?.attempts)
            if (seen.length === 0) return <p className="text-gray-500">Inga ord tränade än.</p>
            return (
              <div className="flex flex-wrap gap-2">
                {seen.map((w) => {
                  const m = p.mastery[masteryKey('word', w.id)]!
                  const cls = m.mastered ? 'bg-green-500 text-white' : m.streak > 0 ? 'bg-yellow-300' : 'bg-orange-300'
                  return (
                    <div key={w.id} title={`${m.attempts} försök, ${m.errors} fel`} className={`rounded-xl px-3 py-1 font-bold ${cls}`}>
                      {w.emoji} {w.text} <span className="text-[13px] font-semibold">{m.attempts - m.errors}/{m.attempts}</span>
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </section>

        <section>
          <h2 className="mb-3 text-[24px] font-bold">Senaste passen</h2>
          {p.sessions.length === 0 ? (
            <p className="text-gray-500">Inga pass än.</p>
          ) : (
            <table className="w-full text-left">
              <thead className="text-gray-500"><tr><th className="py-1">När</th><th>Planet</th><th>Rätt</th><th>Stjärnor</th><th>Tid</th></tr></thead>
              <tbody>
                {p.sessions.slice(-10).reverse().map((s) => (
                  <tr key={s.id} className="border-t border-gray-200">
                    <td className="py-1">{fmtDate(s.startedAt)}</td>
                    <td>{levels.find((l) => l.id === s.levelId)?.name ?? s.levelId}</td>
                    <td>{s.correct}/{s.tasks}</td>
                    <td>{s.stars}</td>
                    <td>{Math.round((s.endedAt - s.startedAt) / 60000)} min</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="grid grid-cols-3 gap-6">
          <label className="flex flex-col gap-1">Volym: {Math.round(settings.volume * 100)} %
            <input type="range" min={0} max={1} step={0.1} value={settings.volume} onChange={(e) => settings.setVolume(Number(e.target.value))} />
          </label>
          <label className="flex flex-col gap-1">Paus efter: {settings.sessionMinutes} min
            <input type="range" min={5} max={20} step={1} value={settings.sessionMinutes} onChange={(e) => settings.setSessionMinutes(Number(e.target.value))} />
          </label>
          <label className="flex flex-col gap-1">Uppgifter per pass: {settings.tasksPerSession}
            <input type="range" min={5} max={14} step={1} value={settings.tasksPerSession} onChange={(e) => settings.setTasksPerSession(Number(e.target.value))} />
          </label>
        </section>

        <section>
          <h2 className="mb-3 text-[24px] font-bold">Nivå</h2>
          <div className="flex flex-wrap gap-6 text-[20px]">
            {([['easy', 'Lätt: mest bokstavsljud, stavelser i Ljudtåget'], ['normal', 'Medel: fler ord, mer Bygg ordet'], ['hard', 'Svår: mest ord, inga stavelser, Vilket ord? tidigt']] as const).map(([v, label]) => (
              <label key={v} className="flex items-center gap-2">
                <input type="radio" name="difficulty" className="h-6 w-6" checked={settings.difficulty === v} onChange={() => settings.setDifficulty(v)} />
                {label}
              </label>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-[24px] font-bold">Planeter</h2>
          <p className="mb-2 text-[15px] text-gray-500">Bocka i planeter barnet redan behärskar, så låses nästa upp direkt. Behärskningen per bokstav påverkas inte.</p>
          <div className="flex flex-wrap gap-3">
            {levels.map((l) => {
              const done = p.completed.includes(l.id) || levelProgress(l, p.mastery).complete
              return (
                <label key={l.id} className={`flex items-center gap-2 rounded-xl px-3 py-2 ${done ? 'bg-green-100' : 'bg-gray-100'}`}>
                  <input type="checkbox" className="h-5 w-5" checked={done} onChange={(e) => (e.target.checked ? p.markCompleted([l.id]) : p.unmarkCompleted(l.id))} />
                  {l.emoji} {l.name}
                </label>
              )
            })}
          </div>
          <label className="mt-3 flex items-center gap-3 text-[18px]">
            <input type="checkbox" className="h-6 w-6" checked={settings.unlockAll} onChange={(e) => settings.setUnlockAll(e.target.checked)} />
            Alla planeter öppna (testläge)
          </label>
        </section>

        <section>
          <h2 className="mb-3 text-[24px] font-bold">Bokstavsljud</h2>
          <p className="mb-2 text-[15px] text-gray-500">TTS-rösten klarar p, t, k, b, d, g dåligt. Spela in ljuden själv, de används då i alla spel.</p>
          <button type="button" onClick={() => setView('record')} className="rounded-full bg-red-600 px-5 py-2 font-bold text-white">🎙️ Spela in bokstavsljud</button>
        </section>

        <CustomWords />

        <section>
          <h2 className="mb-3 text-[24px] font-bold">På iPaden</h2>
          <p className="text-gray-600">
            Öppna appen i Safari, tryck på Dela-knappen och välj <b>Lägg till på hemskärmen</b>. Då startar den i helskärm, i landskapsläge och fungerar utan nätverk.
            Progress, inspelningar och egna ord ligger i den enhetens webbläsare; flytta dem med Exportera/Importera nedan.
          </p>
        </section>

        <section className="flex flex-wrap items-center gap-4">
          <button type="button" onClick={() => void exportJson()} className="rounded-full bg-space px-5 py-2 font-bold text-white">Exportera progress (JSON)</button>
          <button type="button" onClick={() => fileInput.current?.click()} className="rounded-full bg-space px-5 py-2 font-bold text-white">Importera JSON</button>
          <input ref={fileInput} type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && void importJson(e.target.files[0])} />
          <button type="button" onClick={() => confirm('Nollställa all progress?') && p.reset()} className="rounded-full bg-red-600 px-5 py-2 font-bold text-white">Nollställ</button>
          <span className="text-gray-500">Maskot: {p.mascotName || '–'} · Stjärnor: {p.stars} · Klistermärken: {p.stickers.length}</span>
        </section>
      </div>
    </div>
  )
}
