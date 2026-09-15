import { motion, useAnimationControls } from 'framer-motion'
import { useEffect, useRef } from 'react'
import { audio } from '../audio/AudioManager'
import { sfx } from '../audio/sfx'
import { mascots, outfits, phrases, pokeKeys } from '../content'
import { phraseId } from '../content/audioIds'
import { bag, pick } from '../engine/random'
import { useProgress } from '../store/progress'

export type Mood = 'idle' | 'happy' | 'celebrate' | 'sleep' | 'think'

interface Props {
  size?: number
  mood?: Mood
  pokeable?: boolean
  className?: string
}

const moodAnim = {
  idle: { y: [0, -8, 0], rotate: 0, scale: 1, transition: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' as const } },
  happy: { y: [0, -18, 0], rotate: [0, -6, 6, 0], scale: 1.05, transition: { duration: 0.7, repeat: Infinity } },
  celebrate: { y: [0, -30, 0], rotate: [0, -15, 15, 0], scale: [1, 1.15, 1], transition: { duration: 0.6, repeat: Infinity } },
  sleep: { y: [0, 4, 0], rotate: 12, scale: 0.95, transition: { duration: 3.5, repeat: Infinity, ease: 'easeInOut' as const } },
  think: { y: 0, rotate: [-4, 4, -4], scale: 1, transition: { duration: 1.6, repeat: Infinity } },
}

/**
 * Maskoten: emoji + upplåsta kläder. Växer lite för varje plagg.
 * Petar man på den gör den något fånigt och säger något.
 */
const nextPoke = bag(pokeKeys.filter((k) => k !== 'poke_2'))

export default function Mascot({ size = 140, mood = 'idle', pokeable = true, className = '' }: Props) {
  const type = useProgress((s) => s.mascotType)
  const owned = useProgress((s) => s.outfits)
  const controls = useAnimationControls()
  const busy = useRef(false)
  const m = mascots.find((x) => x.id === type) ?? mascots[0]
  const worn = outfits.filter((o) => owned.includes(o.id))
  const scale = 1 + worn.length * 0.06
  const px = size * scale

  useEffect(() => {
    void controls.start(moodAnim[mood])
  }, [mood, controls])

  const poke = async () => {
    if (!pokeable || busy.current) return
    busy.current = true
    const kind = pick(['spin', 'jump', 'wiggle', 'sneeze'] as const)
    const key = kind === 'sneeze' ? 'poke_2' : nextPoke()
    if (kind === 'spin') sfx.spin()
    else if (kind === 'sneeze') sfx.sneeze()
    else sfx.boing()
    void audio.speak(phraseId(key))
    const anims = {
      spin: { rotate: [0, 360], scale: [1, 1.2, 1], transition: { duration: 0.7 } },
      jump: { y: [0, -70, 0, -25, 0], transition: { duration: 0.8 } },
      wiggle: { rotate: [0, -20, 20, -20, 20, 0], transition: { duration: 0.6 } },
      sneeze: { scale: [1, 1.25, 0.8, 1], x: [0, 0, 25, 0], transition: { duration: 0.6 } },
    }
    await controls.start(anims[kind])
    await controls.start(moodAnim[mood])
    busy.current = false
  }

  const hat = worn.find((o) => o.slot === 'hat')
  const eyes = worn.find((o) => o.slot === 'eyes')
  const wings = worn.find((o) => o.slot === 'wings')
  const hand = worn.find((o) => o.slot === 'hand')

  return (
    <motion.div
      role={pokeable ? 'button' : undefined}
      aria-label={phrases.poke_5}
      animate={controls}
      onPointerDown={() => void poke()}
      className={`relative inline-flex select-none items-center justify-center overflow-visible ${className}`}
      style={{ width: px, height: px, cursor: pokeable ? 'pointer' : 'default' }}
    >
      {wings && (
        <span className="big-emoji absolute" style={{ fontSize: px * 0.55, left: -px * 0.28, top: px * 0.12, transform: 'scaleX(-1)' }}>
          {wings.emoji}
        </span>
      )}
      {wings && (
        <span className="big-emoji absolute" style={{ fontSize: px * 0.55, right: -px * 0.28, top: px * 0.12 }}>
          {wings.emoji}
        </span>
      )}
      <span className="big-emoji" style={{ fontSize: px * 0.82 }}>
        {mood === 'sleep' ? '😴' : m.emoji}
      </span>
      {hat && (
        <span className="big-emoji absolute" style={{ fontSize: px * 0.42, top: -px * 0.22, left: '50%', transform: 'translateX(-50%) rotate(-8deg)' }}>
          {hat.emoji}
        </span>
      )}
      {eyes && (
        <span className="big-emoji absolute" style={{ fontSize: px * 0.36, top: px * 0.2, left: '50%', transform: 'translateX(-50%)' }}>
          {eyes.emoji}
        </span>
      )}
      {hand && (
        <span className="big-emoji absolute" style={{ fontSize: px * 0.34, right: -px * 0.12, bottom: px * 0.05 }}>
          {hand.emoji}
        </span>
      )}
    </motion.div>
  )
}
