'use client'

import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ChoiceOption<T extends string> {
  value: T
  title: string
  hint?: ReactNode
  /** Extra lines under the hint — a worked example, a badge. */
  detail?: ReactNode
}

interface ChoiceCardsProps<T extends string> {
  name: string
  labelledBy: string
  options: readonly ChoiceOption<T>[]
  value: T | undefined
  onChange: (value: T) => void
  columns?: 2 | 3
  isInvalid?: boolean
  describedBy?: string
}

/**
 * A few choices drawn as tappable cards. Native radios underneath, so arrow
 * keys, a disabled fieldset and screen readers behave like any radio group.
 */
export function ChoiceCards<T extends string>({
  name,
  labelledBy,
  options,
  value,
  onChange,
  columns = 2,
  isInvalid = false,
  describedBy,
}: ChoiceCardsProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-invalid={isInvalid || undefined}
      className={cn('grid gap-2.5', columns === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}
    >
      {options.map((option) => {
        const isSelected = option.value === value
        return (
          <label
            key={option.value}
            className={cn(
              'relative flex min-w-0 cursor-pointer flex-col gap-1 rounded-xl border bg-background p-4 text-left transition-colors',
              'hover:border-foreground/30 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50',
              'has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-70',
              isSelected && 'border-foreground bg-foreground/[0.03] shadow-xs',
              isInvalid && !value && 'border-destructive/60'
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
            <span className="flex items-start justify-between gap-3">
              <span className="text-sm font-semibold leading-snug">{option.title}</span>
              <span
                aria-hidden
                className={cn(
                  'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                  isSelected ? 'border-foreground bg-foreground text-background' : 'border-muted-foreground/40'
                )}
              >
                {isSelected && <Check className="h-3 w-3" strokeWidth={3} />}
              </span>
            </span>
            {option.hint && <span className="text-sm leading-snug text-muted-foreground">{option.hint}</span>}
            {option.detail}
          </label>
        )
      })}
    </div>
  )
}
