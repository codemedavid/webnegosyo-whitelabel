'use client'

/**
 * "Note for the kitchen" — the optional per-dish note box on the item page,
 * the item sheet and the cart's "Edit item" dialog. It never hard-codes a
 * colour: each host passes the store's own (CSS variables or branding hex),
 * and the wording is the owner's (`item.note_title` / `item.note_placeholder`).
 */

import { useId, type CSSProperties, type FocusEvent } from 'react'
import { StoreLabel, useStorefrontLabel } from '@/components/customer/storefront-labels-provider'
import { ITEM_NOTE_MAX_LENGTH } from '@/lib/item-note'

export const ITEM_NOTE_TITLE_FALLBACK = 'Note for the kitchen'
export const ITEM_NOTE_PLACEHOLDER_FALLBACK = 'e.g. no onions, less ice'

/**
 * On a phone the item page's fixed "Add to cart" bar sits over the fold, and
 * the open keyboard shrinks the view further: bring the whole field (box and
 * counter) to the middle instead of leaving the counter under the bar.
 */
function revealField(event: FocusEvent<HTMLTextAreaElement>) {
  const field = event.currentTarget.parentElement
  if (typeof field?.scrollIntoView !== 'function') return
  field.scrollIntoView({ block: 'center', behavior: 'smooth' })
}

/** Every colour the box paints with, from the host's theme. */
export interface ItemNoteColors {
  title: string
  muted: string
  text: string
  background: string
  border: string
  focus: string
}

interface ItemNoteFieldProps {
  value: string
  onChange: (value: string) => void
  colors: ItemNoteColors
  /** Extra heading style (the item page's heading font and size). */
  titleStyle?: CSSProperties
  className?: string
  /** Branding Studio element scope for the box, when the host has one. */
  brandingScope?: string
}

export function ItemNoteField({ value, onChange, colors, titleStyle, className = '', brandingScope }: ItemNoteFieldProps) {
  const fieldId = useId()
  const counterId = `${fieldId}-count`
  const placeholder = useStorefrontLabel('item.note_placeholder', ITEM_NOTE_PLACEHOLDER_FALLBACK)
  const vars = { '--note-placeholder': colors.muted, '--note-focus': colors.focus } as CSSProperties

  return (
    <div className={`scroll-mb-28 ${className}`} data-branding-scope={brandingScope} style={vars}>
      <label htmlFor={fieldId} className="mb-2 block text-base font-semibold" style={{ color: colors.title, ...titleStyle }}>
        <StoreLabel name="item.note_title" fallback={ITEM_NOTE_TITLE_FALLBACK} />{' '}
        <span className="text-xs font-normal" style={{ color: colors.muted }}>(Optional)</span>
      </label>
      <textarea
        id={fieldId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={revealField}
        maxLength={ITEM_NOTE_MAX_LENGTH}
        rows={2}
        placeholder={placeholder}
        aria-describedby={counterId}
        className="block w-full resize-none rounded-xl border px-3 py-2.5 text-base outline-none transition-shadow placeholder:text-[var(--note-placeholder)] focus-visible:ring-2 focus-visible:ring-[var(--note-focus)]"
        style={{ backgroundColor: colors.background, borderColor: colors.border, color: colors.text }}
      />
      <p id={counterId} className="mt-1 text-right text-xs tabular-nums" style={{ color: colors.muted }}>
        {value.length}/{ITEM_NOTE_MAX_LENGTH}
      </p>
    </div>
  )
}
