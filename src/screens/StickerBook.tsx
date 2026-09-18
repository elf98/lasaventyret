import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { audio } from '../audio/AudioManager'
import { sfx } from '../audio/sfx'
import BigButton from '../components/BigButton'
import Mascot from '../components/Mascot'
import Starfield from '../components/Starfield'
import { phraseId } from '../content/audioIds'
import { useApp } from '../store/app'
import { useProgress } from '../store/progress'

/** Klistermärkesboken: allt barnet samlat, på en anteckningsbokssida. */
export default function StickerBook() {
  const go = useApp((s) => s.go)
  const stickers = useProgress((s) => s.stickers)
  const [wiggle, setWiggle] = useState<number | null>(null)

  useEffect(() => {
    void audio.speak(phraseId(stickers.length ? 'sticker_book' : 'sticker_book_empty'))
    return () => audio.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const poke = (i: number) => {
    sfx.pop()
    setWiggle(i)
    setTimeout(() => setWiggle(null), 500)
  }

  return (
    <div className="screen flex items-center justify-center gap-8" onPointerDown={(e) => !(e.target as HTMLElement).closest('[data-keep]') && go('map')} role="presentation">
      <Starfield count={40} />
      <div className="absolute top-4 left-4 z-10" data-keep>
        <BigButton size="md" icon="🗺️" color="bg-black/40" speakId={phraseId('btn_home')} onPress={() => go('map')} label="Till kartan" />
      </div>
      {/* Tryck utanför boken stänger den; boken, knappen och maskoten är märkta data-keep. */}
      <div data-keep className="relative z-10 flex h-[78vh] w-[70vw] max-w-[900px] flex-wrap content-start gap-4 overflow-y-auto rounded-3xl bg-[#fff8e6] p-8 shadow-[0_12px_40px_rgba(0,0,0,0.5)] no-scrollbar" style={{ backgroundImage: 'repeating-linear-gradient(transparent 0 46px, #e6d9b8 46px 48px)' }}>
        {stickers.length === 0 && (
          <div className="flex h-full w-full items-center justify-center">
            <span className="big-emoji text-[140px] opacity-40">📒</span>
          </div>
        )}
        {stickers.map((s, i) => (
          <motion.button
            key={i}
            type="button"
            aria-label={`klistermärke ${i + 1}`}
            onPointerDown={() => poke(i)}
            initial={{ scale: 0, rotate: -30 }}
            animate={wiggle === i ? { scale: [1, 1.3, 1], rotate: [0, -15, 15, 0] } : { scale: 1, rotate: (i * 37) % 21 - 10 }}
            transition={{ delay: wiggle === i ? 0 : Math.min(i * 0.06, 2), type: 'spring', stiffness: 260, damping: 14 }}
            // ingen big-emoji (drop-shadow-filter) här: Safari lämnade flera klistermärken vita
            className="flex h-28 w-28 items-center justify-center rounded-2xl bg-white/70 text-[80px] leading-none shadow-md"
          >
            {s}
          </motion.button>
        ))}
      </div>
      <div className="relative z-10" data-keep>
        <Mascot size={180} mood={stickers.length ? 'happy' : 'think'} />
      </div>
    </div>
  )
}
