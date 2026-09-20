import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { audio } from '../audio/AudioManager'
import { sfx } from '../audio/sfx'
import { starBurst } from '../components/confetti'
import LetterCard from '../components/LetterCard'
import Mascot from '../components/Mascot'
import { wordById } from '../content'
import { letterSoundId, phraseId, wordId } from '../content/audioIds'
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
 * - Omvänt: bokstaven visas och dess ljud hörs, barnet väljer bland tre bilder den vars ord har ljudet.
 * Ordet visas aldrig skrivet: det är örat som tränas. Fel: ljudet som inte finns i ordet, ordet igen.
 */
export default function SoundSort({ task, scaffold, eliminated = [], celebrating, brief, onWrong, onSolved }: Props) {
  // Omvänt läge (bilder som alternativ) känns igen på att uppgiften bär planetens bokstav.
  const reverse = task.letter !== undefined
  const word = wordById.get(task.targetId)
  const answer = task.answer ?? task.options[0]
  const letter = task.letter ?? answer
  const [solved, setSolved] = useState(false)
  const [wobble, setWobble] = useState<string | null>(null)
  const busy = useRef(false)

  useEffect(() => {
    audio.preload(reverse ? [letterSoundId(letter), ...task.options.map(wordId)] : [wordId(task.targetId), ...task.options.map(letterSoundId)])
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

  const replay = () => void audio.speak(reverse ? letterSoundId(letter) : wordId(task.targetId))

  const tap = async (id: string, e: React.PointerEvent) => {
    if (eliminated.includes(id)) return
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
    else await audio.speak([phraseId('not_in_word'), letterSoundId(id), phraseId('listen_again'), wordId(task.targetId)])
    setWobble(null)
    busy.current = false
  }

  const optionAnim = (id: string) =>
    wobble === id ? { rotate: [0, -10, 10, -6, 6, 0] } : solved && id === answer ? { scale: [1, 1.3, 1.2] } : scaffold && id === answer && !solved ? { scale: [1, 1.08, 1] } : { rotate: 0, scale: 1 }
  const optionClass = (id: string) => `relative ${solved && id !== answer ? 'opacity-30' : ''} ${scaffold && id === answer && !solved ? 'glow' : ''} ${eliminated.includes(id) ? 'pointer-events-none opacity-20' : ''}`
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
            whileTap={{ scale: 0.92 }}
            animate={optionAnim(id)}
            transition={{ duration: 0.5, repeat: scaffold && id === answer && !solved ? Infinity : 0 }}
            className={reverse ? `${optionClass(id)} flex items-center justify-center rounded-[36px] bg-white/90 shadow-[0_8px_0_rgba(0,0,0,0.25)] ${task.options.length > 4 ? 'h-40 w-40' : 'h-44 w-44'}` : optionClass(id)}
          >
            {reverse ? <span className={`big-emoji ${task.options.length > 4 ? 'text-[88px]' : 'text-[100px]'}`}>{wordById.get(id)?.emoji}</span> : <LetterCard letterId={id} size={170} />}
            {pointer(id)}
          </motion.button>
        ))}
      </div>
      <div className="absolute bottom-4 left-4 z-10">
        <Mascot size={110} mood={solved || celebrating ? 'celebrate' : 'think'} pokeable={false} />
      </div>
    </div>
  )
}
