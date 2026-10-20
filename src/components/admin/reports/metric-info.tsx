'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface MetricInfoProps {
  /** The metric's name: "Net sales". */
  term: string
  /** One plain sentence: what it counts. */
  definition: string
  /** How it is worked out: "Gross sales − discounts − refunds". */
  formula?: string
  /** Which edge of the ⓘ the panel lines up with. */
  align?: 'start' | 'end'
  className?: string
}

/**
 * ⓘ next to a metric. A NON-MODAL anchored panel (disclosure / toggletip),
 * not the shared Dialog: the text is two lines the owner reads while looking
 * at the number it explains, so a modal that dims the page and traps focus
 * would hide the very figure being explained. Focus moves into the panel on
 * open (so it is read), Escape closes it and returns focus to the ⓘ, and a
 * tap outside or tabbing away closes it without stealing focus.
 */
export function MetricInfo({ term, definition, formula, align = 'start', className }: MetricInfoProps) {
  const [isOpen, setIsOpen] = useState(false)
  const panelId = useId()
  const titleId = useId()
  const rootRef = useRef<HTMLSpanElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    panelRef.current?.focus()
    const closeOnOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutside)
    return () => document.removeEventListener('pointerdown', closeOnOutside)
  }, [isOpen])

  const closeAndReturnFocus = () => {
    setIsOpen(false)
    buttonRef.current?.focus()
  }

  return (
    <span
      ref={rootRef}
      className={cn('relative inline-flex align-middle', className)}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && isOpen) {
          event.stopPropagation()
          closeAndReturnFocus()
        }
      }}
      onBlur={(event) => {
        if (isOpen && !rootRef.current?.contains(event.relatedTarget as Node | null)) setIsOpen(false)
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-label={`About ${term}`}
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen((open) => !open)}
        className={cn(
          // 20px visible; the ::after pad makes the hit area 44×44 (WCAG 2.5.8).
          'relative inline-flex size-5 items-center justify-center rounded-full text-muted-foreground transition-colors',
          'after:absolute after:-inset-3 after:content-[""] hover:text-foreground',
          'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
          isOpen && 'text-foreground',
        )}
      >
        <Info className="size-4" aria-hidden />
      </button>
      <div
        ref={panelRef}
        id={panelId}
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        tabIndex={-1}
        hidden={!isOpen}
        className={cn(
          'absolute top-full z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl bg-white p-3.5 text-left shadow-lg ring-1 ring-border outline-none',
          align === 'start' ? 'left-0' : 'right-0',
        )}
      >
        <p id={titleId} className="text-[13px] font-bold text-foreground">
          {term}
        </p>
        <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{definition}</p>
        {formula && (
          <p className="mt-2 rounded-md bg-wn-sand px-2 py-1.5 text-[12px] font-medium text-foreground">
            <span className="sr-only">Formula: </span>
            {formula}
          </p>
        )}
      </div>
    </span>
  )
}
