import { useMemo } from 'react'

interface Star {
  x: number
  y: number
  s: number
  d: number
  delay: number
}

/** Blinkande stjärnhimmel som bakgrund. Ren CSS, billig på surfplatta. */
export default function Starfield({ count = 70 }: { count?: number }) {
  const stars = useMemo<Star[]>(
    () =>
      Array.from({ length: count }, () => ({
        x: Math.random() * 100,
        y: Math.random() * 100,
        s: 2 + Math.random() * 3,
        d: 2 + Math.random() * 4,
        delay: Math.random() * 4,
      })),
    [count],
  )
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-[radial-gradient(ellipse_at_bottom,_#1b2a6b_0%,_#0b1026_60%)]">
      {stars.map((st, i) => (
        <span
          key={i}
          className="star-dot"
          style={{ left: `${st.x}%`, top: `${st.y}%`, width: st.s, height: st.s, ['--dur' as string]: `${st.d}s`, ['--delay' as string]: `${st.delay}s` }}
        />
      ))}
    </div>
  )
}
