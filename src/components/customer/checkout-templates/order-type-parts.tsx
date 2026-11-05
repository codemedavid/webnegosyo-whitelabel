'use client'

/**
 * The pieces every order-type design shares: the look it is handed, the
 * pre-order chip, the icons (with the owner's per-type pick), the chosen tick
 * and the keyboard rules of a radio group. Colours come from the checkout
 * theme variables (`--co-*`) only.
 */

import { CalendarClock, Check, type LucideIcon } from 'lucide-react'
import type { KeyboardEvent } from 'react'

import type { CornersChoice } from '@/lib/page-designer/knobs'
import {
  EMPTY_ORDER_TYPE_WORDING,
  wordedDescription,
  wordedName,
  type OrderTypeWording,
} from '@/lib/page-designer/order-type-wording'
import type { OrderType } from '@/types/database'

import { ORDER_TYPE_ICONS } from './checkout-primitives'
import { pickedOrderTypeIcon } from './order-type-icons'

export type OrderTypeIconStyle = 'circle' | 'plain' | 'none'
export type OrderTypeColumns = 'auto' | '1' | '2' | '3'
export type OrderTypePhotoKind = 'dine_in' | 'pickup' | 'delivery' | 'other'

export interface OrderTypeLookBase<Design extends string> {
  design: Design
  corners: CornersChoice
  iconStyle: OrderTypeIconStyle
  showDescriptions: boolean
  columns: OrderTypeColumns
  align: 'left' | 'center'
  /** Photo tiles: one picture per kind (blank = an illustrated tile). */
  images: Partial<Record<OrderTypePhotoKind, string>>
  /** The block's own names, details and icons per kind (absent = the store's). */
  wording?: OrderTypeWording
}

/** The icon for this order type: the owner's pick, else the kind's own. */
export function iconOf(ot: Pick<OrderType, 'type'>, wording?: OrderTypeWording): LucideIcon {
  return pickedOrderTypeIcon(ot, wording) ?? ORDER_TYPE_ICONS[ot.type] ?? ORDER_TYPE_ICONS.other
}

export const nameOf = (ot: OrderType, wording: OrderTypeWording = EMPTY_ORDER_TYPE_WORDING): string => wordedName(ot, wording)
export const descriptionOf = (ot: OrderType, wording: OrderTypeWording = EMPTY_ORDER_TYPE_WORDING): string | undefined =>
  wordedDescription(ot, wording)

/** An order type the store switched off cannot be picked (the hook normally leaves them out). */
export const isOrderTypeDisabled = (ot: OrderType): boolean => ot.is_enabled === false

export function PreorderChip({ ot }: { ot: OrderType }) {
  if (!ot.advance_order_enabled) return null
  return (
    <span data-part="badge" className="inline-flex items-center gap-1 rounded-full bg-[var(--co-accent-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[color:var(--co-accent)]">
      <CalendarClock className="h-2.5 w-2.5" aria-hidden="true" /> Pre-order
    </span>
  )
}

/** A small calendar mark for tight designs; its label keeps "Pre-order" readable. */
export function PreorderMark({ ot }: { ot: OrderType }) {
  if (!ot.advance_order_enabled) return null
  return <CalendarClock aria-label="Pre-order" className="h-3.5 w-3.5 shrink-0 opacity-80" />
}

interface ChoiceIconProps {
  ot: OrderType
  isSelected: boolean
  iconStyle: OrderTypeIconStyle
  wording?: OrderTypeWording
  size?: 'sm' | 'md' | 'lg'
}

export function ChoiceIcon({ ot, isSelected, iconStyle, wording, size = 'md' }: ChoiceIconProps) {
  if (iconStyle === 'none') return null
  const Icon = iconOf(ot, wording)
  const glyph = size === 'lg' ? 'h-6 w-6' : size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'
  if (iconStyle === 'plain') {
    return <Icon aria-hidden="true" data-part="icon" data-on={isSelected ? '' : undefined} className={`${glyph} shrink-0 ${isSelected ? 'text-[color:var(--co-accent)]' : 'text-[color:var(--co-muted)]'}`} />
  }
  const circle = size === 'lg' ? 'h-12 w-12' : size === 'sm' ? 'h-7 w-7' : 'h-10 w-10'
  return (
    <span
      aria-hidden="true"
      data-part="icon"
      data-on={isSelected ? '' : undefined}
      className={`inline-flex ${circle} shrink-0 items-center justify-center rounded-full ${
        isSelected ? 'bg-[var(--co-accent)] text-[color:var(--co-accent-text)]' : 'bg-[var(--co-subtle-strong)] text-[color:var(--co-muted)]'
      }`}
    >
      <Icon className={glyph} />
    </span>
  )
}

export function KindIcon({ ot, wording, className }: { ot: OrderType; wording?: OrderTypeWording; className: string }) {
  const Icon = iconOf(ot, wording)
  return <Icon aria-hidden="true" data-part="icon" className={className} />
}

export function SelectedTick({ className = '' }: { className?: string }) {
  return (
    <span aria-hidden="true" data-part="tick" className={`inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--co-accent)] text-[color:var(--co-accent-text)] ${className}`}>
      <Check className="h-3 w-3" />
    </span>
  )
}

/** Unselected = card + border; selected = the accent's soft wash + accent border. */
export const choiceSurface = (isSelected: boolean) =>
  isSelected
    ? 'border-[color:var(--co-accent)] bg-[var(--co-accent-soft)] shadow-sm'
    : 'border-[color:var(--co-border)] bg-[var(--co-card)] hover:border-[color:var(--co-accent-border)]'

// ── Radio groups (the designs added in v3) ─────────────────────────────────

const NEXT_KEYS: Readonly<Record<string, 1 | -1>> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }

/** The id an arrow / Home / End key moves to (skipping disabled choices), or null. */
export function radioKeyTarget(key: string, ids: readonly string[], disabled: ReadonlySet<string>, current: string | null): string | null {
  const enabled = ids.filter((id) => !disabled.has(id))
  if (!enabled.length) return null
  if (key === 'Home') return enabled[0]
  if (key === 'End') return enabled[enabled.length - 1]
  const step = NEXT_KEYS[key]
  if (!step) return null
  const at = current ? enabled.indexOf(current) : -1
  if (at < 0) return enabled[step === 1 ? 0 : enabled.length - 1]
  return enabled[(at + step + enabled.length) % enabled.length]
}

/**
 * Keyboard handling for a group of `role="radio"` buttons marked with
 * `data-radio-id`: arrows / Home / End choose and focus the next choice
 * (the WAI-ARIA radio group pattern).
 */
export function handleRadioKeys(event: KeyboardEvent<HTMLElement>, types: readonly OrderType[], current: string | null, onSelect: (id: string) => void): void {
  const ids = types.map((ot) => ot.id)
  const disabled = new Set(types.filter(isOrderTypeDisabled).map((ot) => ot.id))
  const target = radioKeyTarget(event.key, ids, disabled, current)
  if (!target) return
  event.preventDefault()
  onSelect(target)
  const element = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-radio-id]')].find((el) => el.dataset.radioId === target)
  element?.focus()
  element?.scrollIntoView?.({ block: 'nearest', inline: 'center' })
}

/** The roving tab stop: the chosen choice, else the first one that can be picked. */
export function isTabStop(ot: OrderType, types: readonly OrderType[], current: string | null): boolean {
  if (current && types.some((t) => t.id === current)) return ot.id === current
  return types.find((t) => !isOrderTypeDisabled(t))?.id === ot.id
}

/** The attributes of one choice in a radio group. */
export function radioProps(ot: OrderType, types: readonly OrderType[], current: string | null) {
  const isSelected = current === ot.id
  const isDisabled = isOrderTypeDisabled(ot)
  return {
    type: 'button' as const,
    role: 'radio' as const,
    'aria-checked': isSelected,
    disabled: isDisabled,
    tabIndex: isTabStop(ot, types, current) ? 0 : -1,
    'data-radio-id': ot.id,
    'data-part': 'option',
    'data-on': isSelected ? '' : undefined,
  }
}
