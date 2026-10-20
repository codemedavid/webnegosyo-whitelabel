import { cn } from '@/lib/utils'

const SIZE = 64
const STROKE = 6
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/** A small ring for a send in progress; the number in the middle, no motion when reduced. */
export function ProgressRing({ ratio, tone }: { ratio: number; tone: 'emerald' | 'amber' }) {
  const pct = Math.max(0, Math.min(1, ratio))
  return (
    <span className="relative inline-flex h-16 w-16 shrink-0 items-center justify-center" aria-hidden="true">
      <svg width={SIZE} height={SIZE} className="-rotate-90">
        <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" strokeWidth={STROKE} className="stroke-stone-200/80" />
        <circle
          cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" strokeWidth={STROKE} strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE} strokeDashoffset={CIRCUMFERENCE * (1 - pct)}
          className={cn('transition-[stroke-dashoffset] duration-300 ease-out motion-reduce:transition-none', tone === 'amber' ? 'stroke-amber-500' : 'stroke-emerald-500')}
        />
      </svg>
      <span className="absolute text-sm font-semibold tabular-nums">{Math.round(pct * 100)}%</span>
    </span>
  )
}
