'use client'

import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface AmountInputProps {
  value: number | null
  onChange: (value: number | null) => void
  ariaLabel: string
  placeholder?: string
  isInvalid?: boolean
  className?: string
}

function parseAmount(text: string): number | null {
  const trimmed = text.trim().replace(',', '.')
  if (trimmed === '') return null
  const value = Number(trimmed)
  return Number.isFinite(value) && value > 0 ? value : null
}

/**
 * A recipe amount. Keeps what the owner is typing ("0." on the way to "0.5")
 * and reports the number; an outside change (Same for all, Count it once)
 * replaces the text only when it means a different number.
 */
export function AmountInput({ value, onChange, ariaLabel, placeholder = '—', isInvalid, className }: AmountInputProps) {
  const [text, setText] = useState(value === null ? '' : String(value))

  useEffect(() => {
    setText((current) => (parseAmount(current) === value ? current : value === null ? '' : String(value)))
  }, [value])

  return (
    <Input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      aria-label={ariaLabel}
      aria-invalid={isInvalid || undefined}
      placeholder={placeholder}
      value={text}
      onChange={(event) => {
        const next = event.target.value
        if (!/^\d*[.,]?\d*$/.test(next.trim())) return
        setText(next)
        onChange(parseAmount(next))
      }}
      className={cn('h-9 w-full min-w-16 text-right tabular-nums max-sm:h-11', className)}
    />
  )
}
