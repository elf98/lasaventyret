import { letterById } from '../content'

interface Props {
  letterId: string
  /** Kortets bredd/höjd i px. */
  size?: number
  className?: string
}

/** Visar alltid versal och gemen tillsammans ("S s"). */
export default function LetterCard({ letterId, size = 120, className = '' }: Props) {
  const l = letterById.get(letterId)
  const type = l?.type ?? 'consonant'
  return (
    <div className={`letter-card ${type} ${className}`} style={{ width: size, height: size, fontSize: size * 0.5 }}>
      <span>{letterId.toUpperCase()}</span>
      <span style={{ fontSize: size * 0.42 }}>{letterId}</span>
    </div>
  )
}
