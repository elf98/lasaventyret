import { motion } from 'framer-motion'

/**
 * Passbetyg 0–3 stjärnor: tända för det som är intjänat (eller fortfarande går att få),
 * tonade för resten. `animate` låter de tända stjärnorna hoppa in en i taget (belöningen).
 */
export default function StarRating({ value, size = 36, animate = false, className = '' }: { value: number; size?: number; animate?: boolean; className?: string }) {
  return (
    <div className={`flex items-center gap-1 ${className}`} role="img" aria-label={`${value} av 3 stjärnor`}>
      {[0, 1, 2].map((i) => {
        const lit = i < value
        return (
          <motion.span
            key={i}
            initial={animate && lit ? { scale: 0, rotate: -90 } : false}
            animate={animate && lit ? { scale: 1, rotate: 0 } : undefined}
            transition={{ delay: 0.3 + i * 0.35, type: 'spring', stiffness: 260 }}
            className={`big-emoji transition-opacity duration-500 ${lit ? '' : 'opacity-25 grayscale'}`}
            style={{ fontSize: size }}
          >
            ⭐
          </motion.span>
        )
      })}
    </div>
  )
}
