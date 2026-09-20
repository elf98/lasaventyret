import { motion } from 'framer-motion'
import BigButton from './BigButton'
import { letterById, sightwordById, stories, templates, wordById, type Level } from '../content'
import { phraseId } from '../content/audioIds'
import { STREAK_NEEDED } from '../engine/mastery'
import type { ItemKind, MasteryItem } from '../engine/types'
import { COMPLETE_SHARE, isSidePath, levelItems, levelProgress } from '../engine/unlock'
import { useProgress } from '../store/progress'

interface Props {
  level: Level
  /** Låst planet: visa informationen men ingen Spela-knapp. */
  locked?: boolean
  onPlay: () => void
  onClose: () => void
}

const KIND_OF: Record<Level['kind'], ItemKind> = { letters: 'letter', sightwords: 'sightword', cluster: 'word', words: 'word', contrast: 'contrast', sentences: 'sentence', stories: 'story', phonology: 'phoneme', templates: 'sentence' }
const NOUN: Record<Level['kind'], [string, string]> = {
  letters: ['bokstav', 'bokstäver'],
  sightwords: ['ordbild', 'ordbilder'],
  cluster: ['ord', 'ord'],
  words: ['ord', 'ord'],
  contrast: ['ord', 'ord'],
  sentences: ['mening', 'meningar'],
  stories: ['berättelse', 'berättelser'],
  phonology: ['rimord', 'rimord'],
  templates: ['mall', 'mallar'],
}

/** Läsbar etikett för en mastery-nyckel (bokstav, ord, ordbild, berättelse). */
function labelFor(kind: Level['kind'], key: string): string {
  const id = key.includes(':') ? key.slice(key.indexOf(':') + 1) : key
  switch (kind) {
    case 'letters':
      return (letterById.get(id)?.id ?? id).toUpperCase()
    case 'sightwords':
      return (sightwordById.get(id)?.text ?? id).toUpperCase()
    case 'cluster':
    case 'words':
    case 'contrast':
    case 'phonology':
      return (wordById.get(id)?.text ?? id).toUpperCase()
    case 'stories':
      return stories.find((s) => s.id === id)?.title ?? id
    case 'templates':
      return templates.templates.find((t) => `tpl:${t.id}` === id)?.text ?? id
    default:
      return id
  }
}

/**
 * Planetrutan: vad planeten går ut på, vad som krävs för att klara den och hur långt varje
 * del kommit. Texten är för den vuxne; målet läses upp av rösten när rutan öppnas.
 */
export default function PlanetInfo({ level, locked = false, onPlay, onClose }: Props) {
  const mastery = useProgress((s) => s.mastery)
  const items = levelItems(level)
  const lp = levelProgress(level, mastery)
  const need = STREAK_NEEDED[KIND_OF[level.kind]]
  const needed = Math.ceil(COMPLETE_SHARE[level.kind] * lp.total)
  const [one, many] = NOUN[level.kind]
  const status = (m: MasteryItem | undefined) => (m?.mastered ? 'done' : m && m.streak > 0 ? 'going' : m && m.attempts > 0 ? 'reset' : 'new')
  const remaining = Math.max(0, needed - lp.mastered)
  const bonus = level.requires.length === 0 && level.kind === 'phonology'
  const side = isSidePath(level)
  const showChips = level.kind !== 'sentences' && items.length <= 40

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 p-6" onPointerDown={(e) => e.target === e.currentTarget && onClose()} role="presentation">
      <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.25 }} className="flex max-h-full w-full max-w-4xl flex-col gap-4 overflow-y-auto rounded-[36px] bg-white p-7 text-space shadow-2xl no-scrollbar" role="dialog" aria-label={level.name}>
        <div className="flex items-center gap-5">
          <span className="big-emoji text-[72px]">{level.emoji}</span>
          <div className="flex flex-col">
            <div className="text-[36px] font-extrabold leading-tight">{level.name}</div>
            {level.goal && <div className="text-[20px] text-gray-700">{level.goal}</div>}
          </div>
        </div>

        <div className="rounded-2xl bg-gray-100 px-5 py-4 text-[18px] leading-snug text-gray-800">
          {bonus ? (
            <span>Bonusplanet: alltid öppen, inget krav. Rim tränar att höra ljud i ord.</span>
          ) : (
            <>
              <b>Klar när {needed} av {lp.total} {many} är behärskade.</b> Behärskad = {need} rätt i rad på första försöket, fördelade på minst två pass. Ett fel nollställer raden för den {one}en.
              {lp.complete ? <span> Planeten är klar.</span> : <span> Just nu: {lp.mastered} av {lp.total} behärskade, {remaining} kvar till klar.</span>}
              {side && <span> Sidoväg: öppnar när {level.letters.join(' och ').toUpperCase()} blandats ihop tre gånger, och lyser igen vid nya förväxlingar.</span>}
            </>
          )}
        </div>

        {showChips && (
          <div className="flex flex-wrap gap-2">
            {items.map((key) => {
              const m = mastery[key]
              const st = status(m)
              const cls = st === 'done' ? 'bg-go text-white' : st === 'going' ? 'bg-sun text-space' : st === 'reset' ? 'bg-orange-200 text-space' : 'bg-gray-200 text-gray-600'
              const detail = st === 'done' ? '✓' : st === 'going' ? `${Math.min(m!.streak, need)}/${need}` : st === 'reset' ? '0/' + need : ''
              return (
                <span key={key} className={`flex items-center gap-2 rounded-full px-4 py-2 text-[20px] font-extrabold ${cls}`}>
                  <span>{labelFor(level.kind, key)}</span>
                  {detail && <span className="text-[15px] font-bold opacity-80">{detail}</span>}
                </span>
              )
            })}
          </div>
        )}
        {!showChips && !bonus && <div className="text-[18px] text-gray-700">{lp.mastered} av {lp.total} {many} behärskade.</div>}
        <div className="flex flex-wrap gap-4 text-[15px] text-gray-600">
          <span><span className="inline-block h-3 w-3 rounded-full bg-go" /> behärskad</span>
          <span><span className="inline-block h-3 w-3 rounded-full bg-sun" /> på väg (rätt i rad)</span>
          <span><span className="inline-block h-3 w-3 rounded-full bg-orange-300" /> fel senast, börjar om</span>
          <span><span className="inline-block h-3 w-3 rounded-full bg-gray-300" /> inte tränad än</span>
        </div>

        <div className="flex items-center justify-end gap-6 pt-2">
          <BigButton size="md" icon="✕" color="bg-gray-300" speakId={phraseId('btn_back')} onPress={onClose} label="Stäng" />
          {locked ? <span className="text-[18px] text-gray-600">{side ? 'Låst: öppnar bara om de två bokstäverna blandas ihop.' : 'Låst: kom halvvägs på planeten före, så öppnar den här.'}</span> : <BigButton size="lg" icon="🚀" speakId={phraseId('btn_play')} onPress={onPlay} label="Spela" />}
        </div>
      </motion.div>
    </div>
  )
}
