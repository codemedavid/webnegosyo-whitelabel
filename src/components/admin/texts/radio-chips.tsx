'use client'

import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface RadioChipOption<T extends string> {
  value: T
  label: ReactNode
  description?: ReactNode
}

interface RadioChipsProps<T extends string> {
  label: string
  options: readonly RadioChipOption<T>[]
  value: T | null
  onChange: (value: T) => void
  size?: 'chip' | 'card'
  className?: string
  describedBy?: string
}

/**
 * A radiogroup drawn as pill chips (or small cards): arrow keys move and
 * select, one tab stop for the group, 44px tall on a phone.
 */
export function RadioChips<T extends string>({ label, options, value, onChange, size = 'chip', className, describedBy }: RadioChipsProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const selected = options.findIndex((option) => option.value === value)

  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const delta = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
    if (delta === 0) return
    event.preventDefault()
    const next = (index + delta + options.length) % options.length
    onChange(options[next].value)
    refs.current[next]?.focus()
  }

  return (
    <div role="radiogroup" aria-label={label} aria-describedby={describedBy} className={cn('flex flex-wrap gap-2', className)}>
      {options.map((option, index) => {
        const isSelected = option.value === value
        return (
          <button
            key={option.value}
            ref={(node) => { refs.current[index] = node }}
            type="button"
            role="radio"
            aria-checked={isSelected}
            tabIndex={isSelected || (selected === -1 && index === 0) ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => move(event, index)}
            className={cn(
              'border text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
              size === 'chip' ? 'min-h-11 rounded-full px-4 py-2 sm:min-h-9 sm:py-1.5' : 'min-h-11 rounded-xl px-3 py-2',
              isSelected ? 'border-foreground bg-foreground text-background' : 'bg-background hover:border-foreground/40 hover:bg-muted/40'
            )}
          >
            <span className="block font-medium">{option.label}</span>
            {option.description && (
              <span className={cn('block text-xs', isSelected ? 'text-background/80' : 'text-muted-foreground')}>{option.description}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
