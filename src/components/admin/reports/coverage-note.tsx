import type { ReactNode } from 'react'
import { Info, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface CoverageNoteProps {
  /** info = how far the figures reach; warning = they leave something out. */
  tone: 'info' | 'warning'
  children: ReactNode
  className?: string
}

const TONES = {
  info: { classes: 'bg-wn-sand text-wn-ink ring-wn-line', icon: Info, iconClass: 'text-wn-stone' },
  warning: { classes: 'bg-amber-50 text-amber-950 ring-amber-200', icon: TriangleAlert, iconClass: 'text-amber-700' },
} as const

/**
 * Sits ABOVE the figures it qualifies: "Profit counts 41 of 58 dishes — 17
 * have no recipe yet." The icon differs per tone so colour isn't the signal.
 */
export function CoverageNote({ tone, children, className }: CoverageNoteProps) {
  const { classes, icon: Icon, iconClass } = TONES[tone]
  return (
    <div
      role="note"
      data-tone={tone}
      className={cn('flex items-start gap-2.5 rounded-xl px-3.5 py-2.5 text-[13.5px] leading-snug ring-1', classes, className)}
    >
      <Icon className={cn('mt-0.5 size-4 shrink-0', iconClass)} aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  )
}
