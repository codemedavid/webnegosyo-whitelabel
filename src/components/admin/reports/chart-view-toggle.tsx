'use client'

import { ChartColumn, Table2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ChartViewToggleProps {
  isTable: boolean
  onToggle: () => void
  /** The chart being swapped, for the accessible name: "sales trend". */
  subject: string
  className?: string
}

/** "Show as table" ⇄ "Show as chart". Every report chart has one (plan §4). */
export function ChartViewToggle({ isTable, onToggle, subject, className }: ChartViewToggleProps) {
  const Icon = isTable ? ChartColumn : Table2
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={`${isTable ? 'Show as chart' : 'Show as table'}: ${subject}`}
      className={cn(
        'inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-wn-stone transition-colors',
        'hover:bg-wn-sand hover:text-wn-ink outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <Icon className="size-4" aria-hidden />
      {isTable ? 'Show as chart' : 'Show as table'}
    </button>
  )
}
