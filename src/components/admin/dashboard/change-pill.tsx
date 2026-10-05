import { ArrowDown, ArrowUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ChangeNote } from './dashboard-copy'

const TONES = {
  up: 'bg-emerald-50 text-emerald-700',
  down: 'bg-red-50 text-red-700',
  flat: 'bg-muted text-muted-foreground',
  none: 'bg-muted text-muted-foreground',
} as const

/** "+12%" in a small pill; the arrow carries the direction, not just the colour. */
export function ChangePill({ change, className }: { change: ChangeNote; className?: string }) {
  const Icon = change.direction === 'up' ? ArrowUp : change.direction === 'down' ? ArrowDown : null
  const spoken = change.direction === 'up' ? 'Up' : change.direction === 'down' ? 'Down' : 'Change:'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11.5px] font-bold tabular-nums',
        TONES[change.direction],
        className,
      )}
    >
      {Icon && <Icon className="h-3 w-3" aria-hidden />}
      <span className="sr-only">{spoken} </span>
      {change.text}
    </span>
  )
}
