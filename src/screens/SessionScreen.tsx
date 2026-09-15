import { useEffect, useRef, useState } from 'react'
import { audio } from '../audio/AudioManager'
import { sfx } from '../audio/sfx'
import { wait } from '../audio/useSpeech'
import BigButton from '../components/BigButton'
import StarCounter from '../components/StarCounter'
import Starfield from '../components/Starfield'
import { config, letterById, levelById, levels, outfits, praiseKeys, rhymes, sentenceById, sentences, sightwords, stickers, stories, storyById, words } from '../content'
import { phraseId, wordId } from '../content/audioIds'
import { bag, newId, pick } from '../engine/random'
import { buildSession } from '../engine/sessionBuilder'
import type { Task } from '../engine/types'
import { diff } from '../engine/unlock'
import { AVAILABLE_GAMES } from '../games'
import BuildWord from '../games/BuildWord'
import CatchSound from '../games/CatchSound'
import RhymeHunt from '../games/RhymeHunt'
import SightMemory from '../games/SightMemory'
import SillySentences from '../games/SillySentences'
import SoundTrain from '../games/SoundTrain'
import StoryReader from '../games/StoryReader'
import WhichWord from '../games/WhichWord'
import { useApp } from '../store/app'
import { selectCompleted, selectUnlocked, useProgress } from '../store/progress'
import { useSettings } from '../store/settings'

/** Beröm i slumpad ordning utan upprepning, hela leken innan någon fras återkommer. */
const nextPraise = bag(praiseKeys)

const GAMES = { 'catch-sound': CatchSound, 'sound-train': SoundTrain, 'build-word': BuildWord, 'which-word': WhichWord, 'sight-memory': SightMemory, 'rhyme-hunt': RhymeHunt, 'silly-sentences': SillySentences, story: StoryReader }

/** Dev-genväg: ?task=<spel>:<mål> ger ett pass med exakt en uppgift. */
function devTask(): Task[] | null {
  if (!import.meta.env.DEV) return null
  const spec = new URLSearchParams(window.location.search).get('task')
  if (!spec) return null
  const [game, targetId] = spec.split(':') as [Task['game'], string]
  const word = words.find((w) => w.id === targetId)
  const all = ['s', 'o', 'l', 'a', 'm', 'i', 'r', 'e']
  const t: Task = { id: `dev-${spec}`, game, targetId, kind: 'word', options: [], isReview: false }
  if (game === 'catch-sound') Object.assign(t, { kind: 'letter', options: [targetId, ...all.filter((x) => x !== targetId).slice(0, 3)] })
  else if (game === 'build-word' && word) t.options = [...word.sounds, ...all.filter((x) => !word.sounds.includes(x)).slice(0, 2)].sort(() => Math.random() - 0.5)
  else if (game === 'sound-train' && word?.emoji) t.options = [targetId, ...words.filter((w) => w.emoji && w.id !== targetId).slice(0, 2).map((w) => w.id)]
  else if (game === 'which-word' || game === 'sight-memory') {
    const sight = sightwords.some((s) => s.id === targetId)
    const pool = sight ? sightwords.map((s) => s.id) : words.map((w) => w.id)
    Object.assign(t, { kind: sight ? 'sightword' : 'word', options: [targetId, ...pool.filter((x) => x !== targetId).slice(0, 2)] })
  } else if (game === 'rhyme-hunt') {
    const pair = rhymes.find((p) => p.includes(targetId)) ?? [targetId, targetId]
    const partner = pair.find((x) => x !== targetId) ?? targetId
    Object.assign(t, { options: [partner, ...words.filter((w) => w.emoji && !pair.includes(w.id)).slice(0, 2).map((w) => w.id)], answer: partner })
  } else if (game === 'silly-sentences') {
    const s = sentenceById.get(targetId)
    if (s) Object.assign(t, { kind: 'sentence', options: [s.picture, ...s.distractors], answer: s.picture })
  } else if (game === 'story') {
    const s = storyById.get(targetId)
    if (s) Object.assign(t, { kind: 'story', options: s.options, answer: String(s.answer) })
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

/** Kör ett pass: bygger uppgifter, växlar spel, bokför resultat och skickar till belöningen. */
export default function SessionScreen() {
  const levelId = useApp((s) => s.levelId)
  const finishSession = useApp((s) => s.finishSession)
  const go = useApp((s) => s.go)
  const tasksPerSession = useSettings((s) => s.tasksPerSession)
  const difficulty = useSettings((s) => s.difficulty)
  const level = levelById.get(levelId ?? '') ?? levels[0]

  const meta = useRef({ id: newId(), startedAt: Date.now(), completedBefore: selectCompleted(useProgress.getState()), unlockedBefore: selectUnlocked(useProgress.getState()) })
  const [tasks] = useState<Task[]>(
    () =>
      devTask() ??
      buildSession({ level, levels, mastery: useProgress.getState().mastery, words, sightwords, sentences, stories, rhymes, now: Date.now(), count: tasksPerSession, reviewShare: config.reviewShare, availableGames: AVAILABLE_GAMES, difficulty }),
  )
  const [index, setIndex] = useState(0)
  const [wrong, setWrong] = useState(0)
  const [stars, setStars] = useState(0)
  const [correct, setCorrect] = useState(0)
  const [celebrating, setCelebrating] = useState(false)
  const task = tasks[index]
  // Spel som redan fått sin fulla instruktion i detta pass: därefter kort cue.
  const explained = useRef(new Set<string>())
  const brief = task ? explained.current.has(task.game) : false
  useEffect(() => {
    if (task) explained.current.add(task.game)
  }, [task])

  useEffect(() => {
    if (tasks.length === 0) go('map')
    return () => audio.stop()
  }, [tasks.length, go])

  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __session?: unknown }).__session = { tasks, index, wrong, stars }
  }, [tasks, index, wrong, stars])

  const finish = (totalStars: number, totalCorrect: number) => {
    const p = useProgress.getState()
    const newlyCompleted = diff(meta.current.completedBefore, selectCompleted(p))
    if (newlyCompleted.length) p.markCompleted(newlyCompleted)
    const newlyUnlocked = diff(meta.current.unlockedBefore, selectUnlocked(useProgress.getState()))
    let sticker: string | null = null
    if (newlyCompleted.length > 0 || Math.random() < 0.3) {
      sticker = pick(stickers)
      p.addSticker(sticker)
    }
    p.addStars(totalStars)
    const starsNow = useProgress.getState().stars
    const newOutfit = outfits.find((o) => o.stars <= starsNow && !p.outfits.includes(o.id)) ?? null
    if (newOutfit) p.addOutfit(newOutfit.id)
    p.addSession({ id: meta.current.id, levelId: level.id, startedAt: meta.current.startedAt, endedAt: Date.now(), tasks: tasks.length, correct: totalCorrect, stars: totalStars, practiced: Array.from(new Set(tasks.map((t) => t.targetId))) })
    finishSession({ levelId: level.id, stars: totalStars, correct: totalCorrect, tasks: tasks.length, sticker, newlyCompleted, newlyUnlocked, newOutfit: newOutfit?.id ?? null })
  }

  const onSolved = async () => {
    if (celebrating || !task) return
    const clean = wrong === 0
    useProgress.getState().recordResult({ taskId: task.id, targetId: task.targetId, kind: task.kind, clean, wrongTaps: wrong, scaffolded: wrong >= 2 }, meta.current.id)
    const gained = clean ? 2 : 1
    const totalStars = stars + gained
    const totalCorrect = correct + (clean ? 1 : 0)
    setStars(totalStars)
    setCorrect(totalCorrect)
    setCelebrating(true)
    sfx.star()
    const example = task.kind === 'letter' ? letterById.get(task.targetId)?.example : undefined
    const praise = phraseId(nextPraise())
    await audio.speak(example ? [praise, wordId(example)] : [praise])
    await wait(250)
    if (index + 1 < tasks.length) {
      setIndex(index + 1)
      setWrong(0)
      setCelebrating(false)
    } else finish(totalStars, totalCorrect)
  }

  const Game = task ? GAMES[task.game] : null

  return (
    <div className="screen">
      <Starfield count={40} />
      <div className="absolute top-3 right-4 left-4 z-20 flex items-center justify-between">
        <BigButton size="md" icon="🗺️" color="bg-black/40" speakId={phraseId('btn_home')} onPress={() => go('map')} label="Till kartan" />
        <ProgressTrack total={tasks.length} index={index} />
        <StarCounter value={stars} />
      </div>
      {task && Game && <Game key={task.id} task={task} scaffold={wrong >= 2} celebrating={celebrating} brief={brief} onWrong={() => setWrong((w) => w + 1)} onSolved={() => void onSolved()} />}
    </div>
  )
}
