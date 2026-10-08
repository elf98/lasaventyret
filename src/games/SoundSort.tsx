import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { audio } from '../audio/AudioManager'
import { sfx } from '../audio/sfx'
import { starBurst } from '../components/confetti'
import LetterCard from '../components/LetterCard'
import Mascot from '../components/Mascot'
import { letterById, wordById } from '../content'
import { letterHintId, letterSoundId, phraseId, wordId } from '../content/audioIds'
import type { Task } from '../engine/types'

interface Props {
  task: Task
  scaffold: boolean
  /** Alternativ som strukits som hjälp efter två fel: nedtonade och otryckbara. */
  eliminated?: string[]
  celebrating: boolean
  brief?: boolean
  /** Vad barnet valde: används för att se vilka par som förväxlas. */
  onWrong: (picked?: string) => void
  onSolved: () => void
}

/**
 * Ljudsortering (Tvillingplaneten). Två lägen:
 * - Ordet hörs och bilden syns, barnet trycker på den av två bokstäver (m/n) som finns i ordet.
 * - Omvänt: bokstaven visas och dess ljud hörs, barnet väljer bland bilder den vars ord har ljudet.
 * Ordet visas aldrig skrivet: det är örat som tränas.
 *
 * Med två bokstäver är andra trycket gratis, så lärandet måste ske MELLAN felet och nästa tryck:
 * knapparna låses, det felaktiga ljudet och det rätta hörs i ordet, munhjälpen sägs ("Läpparna ihop")
 * och barnet måste trycka på örat och höra ordet en gång till innan det får välja. Passet lägger
 * dessutom in ordet igen senare (SessionScreen), så att det syns om momentet gav något.
 */
export default function SoundSort({ task, scaffold, eliminated = [], celebrating, brief, onWrong, onSolved }: Props) {
  // Omvänt läge (bilder som alternativ) känns igen på att uppgiften bär planetens bokstav.
  const reverse = task.letter !== undefined
  const word = wordById.get(task.targetId)
  const answer = task.answer ?? task.options[0]
  const letter = task.letter ?? answer
  const hint = letterById.get(answer)?.hint
  const [solved, setSolved] = useState(false)
  const [wobble, setWobble] = useState<string | null>(null)
  /** Bokstaven som just nu förklaras (lyser) under lyssningsmomentet. */
  const [focus, setFocus] = useState<string | null>(null)
  /** Knapparna låsta tills örat tryckts. */
  const [locked, setLocked] = useState(false)
  const [needEar, setNeedEar] = useState(false)
  const busy = useRef(false)

  useEffect(() => {
    audio.preload(reverse ? [letterSoundId(letter), ...task.options.map(wordId)] : [wordId(task.targetId), ...task.options.map(letterSoundId), ...(hint ? [letterHintId(answer)] : [])])
    // Frasen namnger inte bokstäverna: de två ljuden spelas ur uppgiften, så samma spel funkar för
    // m/n på Tvillingplaneten och b/d på Spegelplaneten ("Hör du mmm eller nnn? – mus").
    const [a, b] = task.options
    void audio.speak(
      reverse
        ? [phraseId(brief ? 'cue_sort_reverse' : 'sort_reverse_intro'), letterSoundId(letter)]
        : [phraseId(brief ? 'cue_sort' : 'sort_intro'), letterSoundId(a), phraseId('or'), letterSoundId(b), wordId(task.targetId)],
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.targetId])

  useEffect(() => {
    if (!scaffold || solved) return
    void audio.speak(reverse ? [letterSoundId(letter), wordId(task.targetId), phraseId('tap_it')] : [letterSoundId(answer), wordId(task.targetId), phraseId('tap_it')])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scaffold])

  const replay = () => {
    if (locked) return
    void audio.speak(reverse ? letterSoundId(letter) : wordId(task.targetId))
  }

  /** Lyssningsmomentet efter fel med två bokstäver. */
  const explain = async (picked: string) => {
    setLocked(true)
    setFocus(picked)
    // "Nej, i ordet finns inget nnn" – det valda ljudet, sedan ordet.
    let ok = await audio.speak([phraseId('not_in_word'), letterSoundId(picked), wordId(task.targetId)])
    if (!ok) return
    setFocus(answer)
    // Rätt ljud i sitt sammanhang och munhjälpen: ljudet, ordet, ljudet, hur munnen gör, ordet.
    ok = await audio.speak([phraseId('sort_listen_close'), letterSoundId(answer), wordId(task.targetId), letterSoundId(answer), ...(hint ? [letterHintId(answer)] : []), wordId(task.targetId)])
    if (!ok) return
    setFocus(null)
    setNeedEar(true)
    await audio.speak([phraseId('sort_tap_ear'), phraseId('sort_comes_back')])
  }

  const ear = async () => {
    if (!needEar || busy.current) return
    busy.current = true
    sfx.pop()
    await audio.speak([letterSoundId(answer), wordId(task.targetId)])
    setNeedEar(false)
    setLocked(false)
    busy.current = false
  }

  const tap = async (id: string, e: React.PointerEvent) => {
    if (eliminated.includes(id) || locked) return
    if (solved) return
    if (id === answer) {
      setSolved(true)
      sfx.tada()
      starBurst(e.clientX / window.innerWidth, e.clientY / window.innerHeight)
      // Bekräfta kopplingen: ljudet och sedan ordet, så att barnet hör ljudet inne i ordet.
      // Måste inväntas, annars avbryter berömmet den direkt.
      await audio.speak([letterSoundId(letter), wordId(task.targetId)])
      onSolved()
      return
    }
    if (busy.current) return
    busy.current = true
    sfx.soft()
    setWobble(id)
    onWrong(id)
    if (reverse) await audio.speak([wordId(id), phraseId('not_in_word'), letterSoundId(letter)])
    else await explain(id)
    setWobble(null)
    busy.current = false
  }

  const optionAnim = (id: string) =>
    wobble === id ? { rotate: [0, -10, 10, -6, 6, 0] } : solved && id === answer ? { scale: [1, 1.3, 1.2] } : (scaffold && id === answer && !solved) || focus === id ? { scale: [1, 1.08, 1] } : { rotate: 0, scale: 1 }
  const optionClass = (id: string) =>
    `relative ${solved && id !== answer ? 'opacity-30' : ''} ${(scaffold && id === answer && !solved) || focus === id ? 'glow' : ''} ${eliminated.includes(id) ? 'pointer-events-none opacity-20' : ''} ${locked && focus !== id ? 'opacity-40' : ''}`
  const pointer = (id: string) =>
    scaffold && id === answer && !solved ? (
      <motion.span animate={{ y: [0, -16, 0] }} transition={{ duration: 0.7, repeat: Infinity }} className="big-emoji absolute -right-10 -bottom-12 text-[72px]">
        👆
      </motion.span>
    ) : null

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-10">
      {reverse ? (
        <motion.button type="button" aria-label={letter} onPointerDown={replay} whileTap={{ scale: 0.94 }}>
          <LetterCard letterId={letter} size={170} />
        </motion.button>
      ) : (
        <motion.button type="button" aria-label={word?.text ?? task.targetId} onPointerDown={replay} whileTap={{ scale: 0.94 }} className="flex h-52 w-52 items-center justify-center rounded-[40px] bg-white/90 shadow-[0_10px_0_rgba(0,0,0,0.25)]">
          <span className="big-emoji text-[130px]">{word?.emoji}</span>
        </motion.button>
      )}
      <div className={`flex items-center ${reverse ? (task.options.length > 4 ? 'gap-5' : 'gap-10') : 'gap-16'}`}>
        {task.options.map((id) => (
          <motion.button
            key={id}
            type="button"
            aria-label={reverse ? (wordById.get(id)?.text ?? id) : id}
            onPointerDown={(e) => void tap(id, e)}
            whileTap={{ scale: locked ? 1 : 0.92 }}
            animate={optionAnim(id)}
            transition={{ duration: 0.5, repeat: (scaffold && id === answer && !solved) || focus === id ? Infinity : 0 }}
            className={reverse ? `${optionClass(id)} flex items-center justify-center rounded-[36px] bg-white/90 shadow-[0_8px_0_rgba(0,0,0,0.25)] ${task.options.length > 4 ? 'h-40 w-40' : 'h-44 w-44'}` : optionClass(id)}
          >
            {reverse ? <span className={`big-emoji ${task.options.length > 4 ? 'text-[88px]' : 'text-[100px]'}`}>{wordById.get(id)?.emoji}</span> : <LetterCard letterId={id} size={170} />}
            {pointer(id)}
            {/* Munhjälpen står under bokstaven som förklaras: för den vuxne som sitter med. */}
            {!reverse && focus === id && letterById.get(id)?.hint && (
              <span className="absolute top-full left-1/2 mt-3 w-64 -translate-x-1/2 rounded-2xl bg-white/90 px-3 py-1 text-[18px] font-bold text-space">{letterById.get(id)?.hint}</span>
            )}
          </motion.button>
        ))}
      </div>
      {/* Örat: det som måste tryckas efter ett fel innan bokstäverna går att välja igen. */}
      {needEar && (
        <motion.button
          type="button"
          aria-label="Lyssna en gång till"
          onPointerDown={() => void ear()}
          initial={{ scale: 0 }}
          animate={{ scale: [1, 1.15, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
          className="glow absolute top-1/2 left-1/2 z-20 flex h-40 w-40 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-sun shadow-[0_10px_0_rgba(0,0,0,0.3)]"
        >
          <span className="big-emoji text-[96px]">👂</span>
        </motion.button>
      )}
      <div className="absolute bottom-4 left-4 z-10">
        <Mascot size={110} mood={solved || celebrating ? 'celebrate' : 'think'} pokeable={false} />
      </div>
    </div>
  )
}
