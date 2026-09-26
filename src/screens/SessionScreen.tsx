import { motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { audio } from '../audio/AudioManager'
import { sfx } from '../audio/sfx'
import { wait } from '../audio/useSpeech'
import BigButton from '../components/BigButton'
import StarRating from '../components/StarRating'
import Starfield from '../components/Starfield'
import { useCaseClass } from '../components/textCase'
import { config, letterById, levelById, levels, outfits, praiseKeys, rhymes, sentenceById, sentences, sightwordById, sightwords, stickers, stories, storyById, wordById, words } from '../content'
import { phraseId, wordId } from '../content/audioIds'
import { optionCount, shownTask } from '../engine/options'
import { bag, newId, pick, seeded } from '../engine/random'
import { sessionRating } from '../engine/rating'
import { buildSession } from '../engine/sessionBuilder'
import type { Task } from '../engine/types'
import { diff, isSidePath } from '../engine/unlock'
import { AVAILABLE_GAMES } from '../games'
import BuildWord from '../games/BuildWord'
import CatchSound from '../games/CatchSound'
import RhymeHunt from '../games/RhymeHunt'
import SightMemory from '../games/SightMemory'
import SillySentences from '../games/SillySentences'
import CountSounds from '../games/CountSounds'
import ReadWord from '../games/ReadWord'
import SoundHunt from '../games/SoundHunt'
import SoundSort from '../games/SoundSort'
import SoundTrain from '../games/SoundTrain'
import SoundRiddle from '../games/SoundRiddle'
import SoundBand from '../games/SoundBand'
import StoryReader from '../games/StoryReader'
import WhichWord from '../games/WhichWord'
import { useApp } from '../store/app'
import { selectCompleted, selectUnlocked, useProgress } from '../store/progress'
import { useSettings } from '../store/settings'

/** Beröm i slumpad ordning utan upprepning, hela leken innan någon fras återkommer. */
const nextPraise = bag(praiseKeys)

/** Rader som får en egen fras. Ingen fras när raden bryts: en rad är en bonus, aldrig ett straff. */
const STREAK_PHRASES: Record<number, string> = { 3: 'streak_3', 5: 'streak_5', 8: 'streak_8' }

const GAMES = { 'catch-sound': CatchSound, 'sound-sort': SoundSort, 'read-word': ReadWord, 'first-sound': SoundHunt, 'last-sound': SoundHunt, 'count-sounds': CountSounds, 'sound-train': SoundTrain, 'sound-riddle': SoundRiddle, 'sound-band': SoundBand, 'build-word': BuildWord, 'which-word': WhichWord, 'sight-memory': SightMemory, 'rhyme-hunt': RhymeHunt, 'silly-sentences': SillySentences, story: StoryReader }

/** Dev-genväg: ?task=<spel>:<mål> ger ett pass med exakt en uppgift. */
function devTask(): Task[] | null {
  if (!import.meta.env.DEV) return null
  const spec = new URLSearchParams(window.location.search).get('task')
  if (!spec) return null
  const [game, targetId, variant] = spec.split(':') as [Task['game'], string, string | undefined]
  const word = words.find((w) => w.id === targetId)
  const all = ['s', 'o', 'l', 'a', 'm', 'i', 'r', 'e']
  const t: Task = { id: `dev-${spec}`, game, targetId, kind: 'word', options: [], isReview: false, variant }
  if (game === 'catch-sound') Object.assign(t, { kind: 'letter', options: [targetId, ...all.filter((x) => x !== targetId).slice(0, 4)] })
  else if (game === 'build-word' && word) t.options = [...word.sounds, ...all.filter((x) => !word.sounds.includes(x)).slice(0, 2)].sort(() => Math.random() - 0.5)
  else if ((game === 'sound-train' || game === 'read-word' || game === 'sound-band' || game === 'sound-riddle') && word?.emoji) t.options = [targetId, ...words.filter((w) => w.emoji && w.id !== targetId).slice(0, 4).map((w) => w.id)]
  else if (game === 'which-word' || game === 'sight-memory') {
    const sight = sightwords.some((s) => s.id === targetId)
    const pool = sight ? sightwords.map((s) => s.id) : words.map((w) => w.id)
    Object.assign(t, { kind: sight ? 'sightword' : 'word', options: [targetId, ...pool.filter((x) => x !== targetId).slice(0, game === 'sight-memory' ? 3 : 4)] })
  } else if (game === 'rhyme-hunt') {
    const pair = rhymes.find((p) => p.includes(targetId)) ?? [targetId, targetId]
    const partner = pair.find((x) => x !== targetId) ?? targetId
    Object.assign(t, { options: [partner, ...words.filter((w) => w.emoji && !pair.includes(w.id)).slice(0, 4).map((w) => w.id)], answer: partner })
  } else if (game === 'silly-sentences') {
    const s = sentenceById.get(targetId)
    if (s) Object.assign(t, { kind: 'sentence', options: [s.picture, ...s.distractors], answer: s.picture })
  } else if (game === 'story') {
    const s = storyById.get(targetId)
    if (s) Object.assign(t, { kind: 'story', options: s.questions[0].options, answer: String(s.questions[0].answer) })
  }
  return [t]
}

function ProgressTrack({ total, index }: { total: number; index: number }) {
  return (
    <div className="flex items-center gap-2 rounded-full bg-black/40 px-4 py-2">
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} className={`flex h-6 w-6 items-center justify-center text-[22px] ${i < index ? 'text-sun' : 'text-white/30'}`}>
          {i === index ? '🚀' : '●'}
        </span>
      ))}
    </div>
  )
}

/** Två ord av samma längd som skiljer sig i exakt en bokstav: bil/pil ger paret b/p. */
function singleLetterDiff(a: string, b: string): [string, string] | null {
  if (a.length !== b.length || a === b) return null
  let at = -1
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue
    if (at >= 0) return null
    at = i
  }
  return at >= 0 ? [a[at], b[at]] : null
}

/** Kör ett pass: bygger uppgifter, växlar spel, bokför resultat och skickar till belöningen. */
export default function SessionScreen() {
  const levelId = useApp((s) => s.levelId)
  const finishSession = useApp((s) => s.finishSession)
  const go = useApp((s) => s.go)
  const tasksPerSession = useSettings((s) => s.tasksPerSession)
  const difficulty = useSettings((s) => s.difficulty)
  const level = levelById.get(levelId ?? '') ?? levels[0]

  // Passet kan lämnas mitt i ett ljud: audio.stop() löser ut spelens await och de anropar onSolved
  // på en avmonterad skärm. Då bokfördes en uppgift barnet hoppat över, och var det passets sista
  // rycktes barnet från kartan till belöningsskärmen.
  const alive = useRef(true)
  const finished = useRef(false)
  const meta = useRef({ id: newId(), startedAt: Date.now(), completedBefore: selectCompleted(useProgress.getState()), unlockedBefore: selectUnlocked(useProgress.getState()) })
  const [tasks] = useState<Task[]>(
    () =>
      devTask() ??
      buildSession({ level, levels, mastery: useProgress.getState().mastery, words, sightwords, sentences, stories, rhymes, now: Date.now(), count: tasksPerSession, reviewShare: config.reviewShare, availableGames: AVAILABLE_GAMES, difficulty }),
  )
  const [index, setIndex] = useState(0)
  const [wrong, setWrong] = useState(0)
  const [done, setDone] = useState(0)
  const [correct, setCorrect] = useState(0)
  /** Uppgifter lösta med högst ett fel (på svår: felfritt): stjärnorna ska belöna att barnet vågar pröva. */
  const [good, setGood] = useState(0)
  /** Rätt i följd utan fel: efter tre blir det ett alternativ till, och en liten rad syns. */
  const [streak, setStreak] = useState(0)
  const bestStreak = useRef(0)
  /** Antal fel per avklarad uppgift: två uppgifter i rad med fel ger ett alternativ färre. */
  const wrongs = useRef<number[]>([])
  const [celebrating, setCelebrating] = useState(false)
  /** Exempelordet som visas skrivet i berömmet, så att ljud, bokstav och ord knyts ihop visuellt. */
  const [praiseWord, setPraiseWord] = useState<string | null>(null)
  const caseClass = useCaseClass()
  const task = tasks[index]
  // Antalet alternativ bestäms när uppgiften börjar, utifrån raden just då, och byts inte mitt i.
  const shown = useMemo(() => {
    if (!task) return task
    const last = wrongs.current.slice(-2)
    const struggling = last.length === 2 && last.every((w) => w > 0)
    return shownTask(task, optionCount(task.game, difficulty, streak, struggling), seeded(index * 7919 + task.id.length))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, task])
  // Spel som redan fått sin fulla instruktion i detta pass: därefter kort cue.
  const explained = useRef(new Set<string>())
  const seenKey = task ? `${task.game}${task.variant === 'read' ? ':read' : ''}` : ''
  // Full instruktion bara de två första gångerna ett spel möts – sedan räcker den korta cuen.
  const brief = task ? explained.current.has(seenKey) || (useProgress.getState().gamesSeen[seenKey] ?? 0) > 2 : false
  useEffect(() => {
    if (task && !explained.current.has(seenKey)) useProgress.getState().seeGame(seenKey)
    if (task) explained.current.add(seenKey)
  }, [task, seenKey])

  useEffect(() => {
    if (tasks.length === 0) go('map')
    return () => {
      alive.current = false
      audio.stop()
    }
  }, [tasks.length, go])

  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __session?: unknown }).__session = { tasks, index, wrong, correct, good, streak }
  }, [tasks, index, wrong, correct, good, streak])

  const finish = (totalCorrect: number, totalGood: number) => {
    if (finished.current) return
    finished.current = true
    const rating = sessionRating(totalGood, tasks.length)
    const p = useProgress.getState()
    const newlyCompleted = diff(meta.current.completedBefore, selectCompleted(p))
    if (newlyCompleted.length) p.markCompleted(newlyCompleted)
    // Tvillingplaneten slocknar när den spelats: nya förväxlingar får tända den igen.
    if (isSidePath(level)) p.settleContrast(level.id)
    const newParts = useProgress.getState().claimRocketParts()
    const newlyUnlocked = diff(meta.current.unlockedBefore, selectUnlocked(useProgress.getState()))
    let sticker: string | null = null
    if (newlyCompleted.length > 0 || Math.random() < 0.3) {
      sticker = pick(stickers)
      p.addSticker(sticker)
    }
    p.addStars(rating)
    const starsNow = useProgress.getState().stars
    const newOutfit = outfits.find((o) => o.stars <= starsNow && !p.outfits.includes(o.id)) ?? null
    if (newOutfit) p.addOutfit(newOutfit.id)
    p.addSession({ id: meta.current.id, levelId: level.id, startedAt: meta.current.startedAt, endedAt: Date.now(), tasks: tasks.length, correct: totalCorrect, stars: rating, practiced: Array.from(new Set(tasks.map((t) => t.targetId))) })
    finishSession({ levelId: level.id, stars: rating, correct: totalCorrect, tasks: tasks.length, sticker, newlyCompleted, newlyUnlocked, newOutfit: newOutfit?.id ?? null, newParts, bestStreak: bestStreak.current })
  }

  const onSolved = async () => {
    if (celebrating || !task || !alive.current || finished.current) return
    const clean = wrong === 0
    useProgress.getState().recordResult({ taskId: task.id, targetId: task.targetId, kind: task.kind, clean, wrongTaps: wrong, scaffolded: wrong >= 3 }, meta.current.id)
    const totalCorrect = correct + (clean ? 1 : 0)
    // På svår nivå räknas bara felfritt: med fyra alternativ och ett struket efter första felet
    // ger "rätt inom två försök" annars stjärnor åt ren gissning.
    const totalGood = good + ((difficulty === 'hard' ? clean : wrong <= 1) ? 1 : 0)
    const newStreak = clean ? streak + 1 : 0
    bestStreak.current = Math.max(bestStreak.current, newStreak)
    wrongs.current.push(wrong)
    setCorrect(totalCorrect)
    setGood(totalGood)
    setDone(done + 1)
    setStreak(newStreak)
    setCelebrating(true)
    taps.current = []
    sfx.star()
    const example = task.kind === 'letter' ? letterById.get(task.targetId)?.example : undefined
    if (example) setPraiseWord(example)
    const streakPhrase = STREAK_PHRASES[newStreak]
    const praise = phraseId(streakPhrase ?? nextPraise())
    await audio.speak(example ? [praise, wordId(example)] : [praise])
    await wait(250)
    if (!alive.current) return
    if (index + 1 < tasks.length) {
      setIndex(index + 1)
      setWrong(0)
      setPraiseWord(null)
      setCelebrating(false)
    } else finish(totalCorrect, totalGood)
  }

  // Frenetiskt tryckande (fyra tryck på en sekund) ger en kort paus där inga tryck når spelet.
  // Räknaren nollställs vid varje löst uppgift: snabbt men korrekt spel ska inte straffas.
  const taps = useRef<number[]>([])
  const [calm, setCalm] = useState(false)
  const onTap = () => {
    const now = Date.now()
    taps.current = [...taps.current.filter((t) => now - t < 1000), now]
    if (taps.current.length >= 4 && !calm) {
      setCalm(true)
      taps.current = []
      void audio.speak(phraseId('calm_down'))
      window.setTimeout(() => setCalm(false), 4500)
    }
  }

  /**
   * Hjälpen trappas i stället för att peka ut svaret direkt: första felet ger ljudet igen (spelen gör
   * det själva), andra felet stryker ett felaktigt alternativ, tredje felet pekar ut rätt svar.
   * Strykningen gäller bara spel där alternativen är hela svar (inte brickor, vagnar eller memorykort).
   */
  const eliminated = useMemo(() => {
    const pickable: Task['game'][] = ['catch-sound', 'which-word', 'read-word', 'sound-sort', 'sound-riddle', 'sound-band', 'first-sound', 'last-sound', 'count-sounds', 'rhyme-hunt', 'silly-sentences']
    if (!shown || wrong < 2 || !pickable.includes(shown.game)) return []
    const answer = shown.answer ?? shown.targetId
    const wrongOptions = shown.options.filter((o) => o !== answer)
    return wrongOptions.length >= 2 ? [wrongOptions[0]] : []
  }, [shown, wrong])

  /**
   * Räknar felet och vilket bokstavspar som blandades ihop: direkt när rätt svar och valet är
   * bokstäver, och via orden när de skiljer sig i exakt en bokstav (bil läst som pil ger b/p).
   * Loggen tänder tvillingplaneterna, så läsfelen måste räknas, inte bara hörfelen.
   */
  const onWrongAnswer = (picked?: string) => {
    setWrong((w) => w + 1)
    const right = task?.answer ?? task?.targetId
    if (!picked || !right || picked === right) return
    if (letterById.has(picked) && letterById.has(right)) {
      useProgress.getState().recordConfusion(right, picked)
      return
    }
    const text = (id: string) => wordById.get(id)?.text ?? sightwordById.get(id)?.text
    const a = text(right)
    const b = text(picked)
    const pair = a && b ? singleLetterDiff(a.toLowerCase(), b.toLowerCase()) : null
    if (pair && letterById.has(pair[0]) && letterById.has(pair[1])) useProgress.getState().recordConfusion(pair[0], pair[1])
  }

  const Game = shown ? GAMES[shown.game] : null

  return (
    <div className="screen">
      <Starfield count={40} />
      <div className="absolute top-3 right-4 left-4 z-20 flex items-center justify-between">
        <BigButton size="md" icon="🗺️" color="bg-black/40" speakId={phraseId('btn_home')} onPress={() => go('map')} label="Till kartan" />
        <div className="flex items-center gap-3">
          <ProgressTrack total={tasks.length} index={index} />
          {streak >= 3 && (
            <motion.div key={streak} initial={{ scale: 0.6 }} animate={{ scale: [0.6, 1.2, 1] }} transition={{ duration: 0.4 }} className="flex items-center gap-1 rounded-full bg-sun px-3 py-1 text-[22px] font-extrabold text-space" aria-label={`${streak} rätt i rad`}>
              <span>⚡</span>
              <span>{streak}</span>
            </motion.div>
          )}
        </div>
        <StarRating value={sessionRating(good + (tasks.length - done), tasks.length)} />
      </div>
      <div className="absolute inset-0" onPointerDownCapture={onTap}>
        {shown && Game && <Game key={shown.id} task={shown} scaffold={wrong >= 3} eliminated={eliminated} celebrating={celebrating} brief={brief} onWrong={(picked?: string) => onWrongAnswer(picked)} onSolved={() => void onSolved()} />}
      </div>
      {praiseWord && celebrating && task && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-end justify-center pb-24">
          <motion.div initial={{ scale: 0.7, y: 30, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 260 }} className="flex items-center gap-5 rounded-[32px] bg-white/95 px-8 py-4 shadow-2xl">
            <span className="big-emoji text-[64px]">{wordById.get(praiseWord)?.emoji}</span>
            <span className={`text-[56px] leading-none font-extrabold ${caseClass(praiseWord)}`}>
              {(wordById.get(praiseWord)?.text ?? praiseWord).split('').map((c, i) => (
                <span key={i} className={c.toLowerCase() === task.targetId ? 'text-go' : 'text-space'}>
                  {c}
                </span>
              ))}
            </span>
          </motion.div>
        </div>
      )}
      {calm && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60" aria-live="polite">
          <motion.div initial={{ scale: 0.6 }} animate={{ scale: [0.6, 1.1, 1] }} transition={{ duration: 0.4 }} className="flex flex-col items-center gap-3 rounded-[40px] bg-white px-14 py-10 text-space shadow-2xl">
            <span className="text-[110px] leading-none">✋</span>
            <span className="text-[44px] font-extrabold">Lugn!</span>
            <span className="text-[28px] font-bold text-gray-600">Lyssna först, tryck sedan</span>
          </motion.div>
        </div>
      )}
    </div>
  )
}
