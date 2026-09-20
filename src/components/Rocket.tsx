/**
 * Raketen: kroppen finns alltid, delarna tänds när områdena klaras. Motorn (låga), styrspaken
 * (i fönstret) och lampan (i nosen). Ritad som SVG i en kvadrat, delarna som emoji ovanpå.
 */
export default function Rocket({ parts, size = 420, className = '' }: { parts: string[]; size?: number; className?: string }) {
  const has = (p: string) => parts.includes(p)
  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }} aria-label="raketen">
      <svg viewBox="0 0 100 100" className="h-full w-full" role="img">
        {/* fenor */}
        <path d="M34 62 L20 84 L36 80 Z" fill="#ff5d73" />
        <path d="M66 62 L80 84 L64 80 Z" fill="#ff5d73" />
        {/* kropp */}
        <path d="M50 6 C62 16 66 34 66 52 L66 80 L34 80 L34 52 C34 34 38 16 50 6 Z" fill="#f4f6fb" stroke="#c9d1e4" strokeWidth="1.5" />
        {/* nos */}
        <path d="M50 6 C56 11 60 19 62 28 L38 28 C40 19 44 11 50 6 Z" fill="#ff5d73" />
        {/* fönster */}
        <circle cx="50" cy="46" r="10" fill="#17204a" stroke="#3b82f6" strokeWidth="2.5" />
        {/* munstycke */}
        <rect x="40" y="80" width="20" height="7" rx="2" fill="#5b6470" />
        {/* låga när motorn sitter fast */}
        {has('motor') && (
          <g>
            <path d="M42 87 C44 96 48 99 50 100 C52 99 56 96 58 87 Z" fill="#ffcc33" />
            <path d="M46 87 C47 93 49 96 50 97 C51 96 53 93 54 87 Z" fill="#ff5d73" />
          </g>
        )}
      </svg>
      {has('stick') && (
        <span className="big-emoji absolute" style={{ left: '50%', top: '40%', transform: 'translate(-50%, -50%)', fontSize: size * 0.11 }}>
          🕹️
        </span>
      )}
      {has('lamp') && (
        <span className="big-emoji absolute" style={{ left: '50%', top: '9%', transform: 'translate(-50%, -50%)', fontSize: size * 0.1 }}>
          🔦
        </span>
      )}
      {has('lamp') && <span className="absolute rounded-full bg-sun/30" style={{ left: '50%', top: '9%', width: size * 0.3, height: size * 0.3, transform: 'translate(-50%, -50%)', filter: 'blur(14px)' }} />}
    </div>
  )
}
