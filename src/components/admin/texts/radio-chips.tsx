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
  size?: 'chip' | 'card' | 'segmented'
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
    <div
      role="radiogroup"
      aria-label={label}
      aria-describedby={describedBy}
      className={cn(size === 'segmented' ? 'inline-flex max-w-full gap-1 overflow-x-auto rounded-full border bg-card p-1 shadow-[0_1px_2px_rgba(29,24,21,0.04)]' : 'flex flex-wrap gap-2', className)}
    >
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
              'text-left text-sm transition-[color,background-color,border-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
              size === 'segmented'
                ? cn('min-h-11 shrink-0 rounded-full px-4 py-1.5 font-medium sm:min-h-8', isSelected ? 'bg-wn-ink text-white shadow-sm' : 'text-wn-stone hover:bg-wn-sand hover:text-foreground')
                : cn(
                    'border',
                    size === 'chip' ? 'min-h-11 rounded-full px-4 py-2 sm:min-h-9 sm:py-1.5' : 'min-h-11 rounded-xl px-3.5 py-2.5',
                    isSelected ? 'border-wn-ink bg-wn-ink text-white shadow-sm' : 'border-border bg-card hover:border-stone-400 hover:bg-wn-sand/60'
                  )
            )}
          >
            <span className="block font-medium">{option.label}</span>
            {option.description && (
              <span className={cn('mt-0.5 block text-xs', isSelected ? 'text-white/75' : 'text-wn-stone')}>{option.description}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
