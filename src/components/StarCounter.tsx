import { motion } from 'framer-motion'

export default function StarCounter({ value, className = '' }: { value: number; className?: string }) {
  return (
    <div className={`flex items-center gap-2 rounded-full bg-black/40 px-4 py-2 ${className}`}>
      <motion.span key={value} initial={{ scale: 1.6, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} className="big-emoji text-[36px]">
        ⭐
      </motion.span>
      <motion.span key={`n${value}`} initial={{ scale: 1.4 }} animate={{ scale: 1 }} className="text-[36px] font-extrabold tabular-nums">
        {value}
      </motion.span>
    </div>
  )
}
