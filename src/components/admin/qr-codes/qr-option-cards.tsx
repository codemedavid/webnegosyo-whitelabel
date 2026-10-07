'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface QrOption<T extends string> {
  value: T
  title: string
  hint?: string
  icon?: ReactNode
}

interface QrOptionCardsProps<T extends string> {
  name: string
  labelledBy: string
  options: readonly QrOption<T>[]
  value: T
  onChange: (value: T) => void
  columns?: 2 | 3
}

/**
 * A short list of choices drawn as tappable cards — native radios underneath,
 * so arrow keys and screen readers behave like any radio group.
 */
export function QrOptionCards<T extends string>({
  name,
  labelledBy,
  options,
  value,
  onChange,
  columns = 2,
}: QrOptionCardsProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      className={cn('grid gap-2', columns === 3 ? 'grid-cols-3' : 'grid-cols-2')}
    >
      {options.map((option) => {
        const isSelected = option.value === value
        return (
          <label
            key={option.value}
            className={cn(
              'relative flex min-w-0 cursor-pointer flex-col gap-1 rounded-lg border bg-background p-3 text-left transition-colors',
              'hover:border-foreground/30 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50',
              isSelected && 'border-foreground bg-foreground/[0.03] shadow-xs'
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={isSelected}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.icon && <span className="text-muted-foreground">{option.icon}</span>}
            <span className="text-sm font-medium leading-tight">{option.title}</span>
            {option.hint && <span className="text-xs leading-snug text-muted-foreground">{option.hint}</span>}
          </label>
        )
      })}
    </div>
  )
}
