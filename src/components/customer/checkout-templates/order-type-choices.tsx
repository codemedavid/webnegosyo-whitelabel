'use client'

/**
 * The order-type question (dine-in / pickup / delivery) in the designs a
 * Page Designer checkout can pick. Every design is presentation only: the
 * same `orderTypes`, the same `setOrderType`, the same pre-order chip and
 * descriptions — so changing the design can never change what is ordered.
 *
 * `tiles` is the shared OrderTypeSelector (the standard checkouts' look);
 * the others are drawn here from the checkout theme variables (`--co-*`)
 * only, so the store's colours and a block's own colours both apply.
 */

import { CalendarClock, Check } from 'lucide-react'
import type { ReactNode } from 'react'

import type { UseCheckoutReturn } from '@/hooks/useCheckout'
import { cornersClass, type CornersChoice } from '@/lib/page-designer/knobs'
import type { OrderType } from '@/types/database'

import { checkoutThemeStyle } from './checkout-theme'
import { ORDER_TYPE_ICONS, OrderTypeSelector } from './checkout-primitives'

export const ORDER_TYPE_DESIGNS = ['tiles', 'segmented', 'list', 'cards', 'buttons', 'chips', 'photo'] as const
export type OrderTypeDesign = (typeof ORDER_TYPE_DESIGNS)[number]

export type OrderTypeIconStyle = 'circle' | 'plain' | 'none'
export type OrderTypeColumns = 'auto' | '1' | '2' | '3'
export type OrderTypePhotoKind = 'dine_in' | 'pickup' | 'delivery' | 'other'

export interface OrderTypeLook {
  design: OrderTypeDesign
  corners: CornersChoice
  iconStyle: OrderTypeIconStyle
  showDescriptions: boolean
  columns: OrderTypeColumns
  align: 'left' | 'center'
  /** Photo tiles: one picture per kind (blank = an illustrated tile). */
  images: Partial<Record<OrderTypePhotoKind, string>>
}

export const DEFAULT_ORDER_TYPE_LOOK: OrderTypeLook = {
  design: 'tiles',
  corners: 'auto',
  iconStyle: 'circle',
  showDescriptions: true,
  columns: 'auto',
  align: 'left',
  images: {},
}

interface ChoiceProps {
  ot: OrderType
  isSelected: boolean
  look: OrderTypeLook
  onSelect: () => void
}

function PreorderChip({ ot }: { ot: OrderType }) {
  if (!ot.advance_order_enabled) return null
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--co-accent-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[color:var(--co-accent)]">
      <CalendarClock className="h-2.5 w-2.5" aria-hidden="true" /> Pre-order
    </span>
  )
}

function ChoiceIcon({ ot, isSelected, iconStyle, size = 'md' }: { ot: OrderType; isSelected: boolean; iconStyle: OrderTypeIconStyle; size?: 'sm' | 'md' | 'lg' }) {
  if (iconStyle === 'none') return null
  const Icon = ORDER_TYPE_ICONS[ot.type] ?? ORDER_TYPE_ICONS.other
  const glyph = size === 'lg' ? 'h-6 w-6' : size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'
  if (iconStyle === 'plain') {
    return <Icon aria-hidden="true" className={`${glyph} shrink-0 ${isSelected ? 'text-[color:var(--co-accent)]' : 'text-[color:var(--co-muted)]'}`} />
  }
  const circle = size === 'lg' ? 'h-12 w-12' : size === 'sm' ? 'h-7 w-7' : 'h-10 w-10'
  return (
    <span
      aria-hidden="true"
      className={`inline-flex ${circle} shrink-0 items-center justify-center rounded-full ${
        isSelected ? 'bg-[var(--co-accent)] text-[color:var(--co-accent-text)]' : 'bg-[var(--co-subtle-strong)] text-[color:var(--co-muted)]'
      }`}
    >
      <Icon className={glyph} />
    </span>
  )
}

function KindIcon({ ot, className }: { ot: OrderType; className: string }) {
  const Icon = ORDER_TYPE_ICONS[ot.type] ?? ORDER_TYPE_ICONS.other
  return <Icon aria-hidden="true" className={className} />
}

function SelectedTick({ className = '' }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--co-accent)] text-[color:var(--co-accent-text)] ${className}`}>
      <Check className="h-3 w-3" />
    </span>
  )
}

/** Unselected = card + border; selected = the accent's soft wash + accent border. */
const choiceSurface = (isSelected: boolean) =>
  isSelected
    ? 'border-[color:var(--co-accent)] bg-[var(--co-accent-soft)] shadow-sm'
    : 'border-[color:var(--co-border)] bg-[var(--co-card)] hover:border-[color:var(--co-accent-border)]'

function ListRow({ ot, isSelected, look, onSelect }: ChoiceProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      className={`flex w-full items-center gap-3 border-2 px-4 py-3 text-left transition ${cornersClass(look.corners, 'rounded-xl')} ${choiceSurface(isSelected)}`}
    >
      <ChoiceIcon ot={ot} isSelected={isSelected} iconStyle={look.iconStyle} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold text-[color:var(--co-text)]">{ot.name}</span>
          <PreorderChip ot={ot} />
        </span>
        {look.showDescriptions && ot.description && <span className="mt-0.5 block text-sm text-[color:var(--co-muted)]">{ot.description}</span>}
      </span>
      <span
        aria-hidden="true"
        className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
          isSelected ? 'border-[color:var(--co-accent)]' : 'border-[color:var(--co-border)]'
        }`}
      >
        {isSelected && <span className="h-2.5 w-2.5 rounded-full bg-[var(--co-accent)]" />}
      </span>
    </button>
  )
}

function DetailCard({ ot, isSelected, look, onSelect }: ChoiceProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      className={`relative flex w-full items-start gap-4 border-2 p-4 text-left transition sm:p-5 ${cornersClass(look.corners, 'rounded-2xl')} ${choiceSurface(isSelected)}`}
    >
      <ChoiceIcon ot={ot} isSelected={isSelected} iconStyle={look.iconStyle} size="lg" />
      <span className="min-w-0 flex-1 pr-6">
        <span className="block text-base font-bold leading-tight text-[color:var(--co-text)]">{ot.name}</span>
        {look.showDescriptions && ot.description && <span className="mt-1 block text-sm leading-snug text-[color:var(--co-muted)]">{ot.description}</span>}
        {ot.advance_order_enabled && <span className="mt-2 block"><PreorderChip ot={ot} /></span>}
      </span>
      {isSelected && <SelectedTick className="absolute right-3 top-3" />}
    </button>
  )
}

function BigButton({ ot, isSelected, look, onSelect }: ChoiceProps) {
  const isCentered = look.align === 'center'
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      className={`flex min-h-16 w-full items-center gap-3 border-2 px-5 py-3 transition ${isCentered ? 'justify-center text-center' : 'text-left'} ${cornersClass(look.corners, 'rounded-2xl')} ${
        isSelected
          ? 'border-[color:var(--co-accent)] bg-[var(--co-accent)] text-[color:var(--co-accent-text)] shadow-md'
          : 'border-[color:var(--co-border)] bg-[var(--co-card)] text-[color:var(--co-text)] hover:border-[color:var(--co-accent-border)]'
      }`}
    >
      {look.iconStyle !== 'none' && <KindIcon ot={ot} className="h-6 w-6 shrink-0" />}
      <span className={`min-w-0 ${isCentered ? '' : 'flex-1'}`}>
        <span className="block text-lg font-bold leading-tight">{ot.name}</span>
        {look.showDescriptions && ot.description && (
          <span className={`mt-0.5 block text-sm ${isSelected ? 'opacity-90' : 'text-[color:var(--co-muted)]'}`}>{ot.description}</span>
        )}
        {ot.advance_order_enabled && <span className={`mt-1 block text-xs font-semibold ${isSelected ? 'opacity-90' : 'text-[color:var(--co-accent)]'}`}>Pre-order</span>}
      </span>
    </button>
  )
}

function Chip({ ot, isSelected, look, onSelect }: ChoiceProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      className={`inline-flex items-center gap-1.5 border px-3.5 py-2 text-sm font-semibold transition ${cornersClass(look.corners, 'rounded-full')} ${
        isSelected
          ? 'border-[color:var(--co-accent)] bg-[var(--co-accent)] text-[color:var(--co-accent-text)]'
          : 'border-[color:var(--co-border)] bg-[var(--co-card)] text-[color:var(--co-text)] hover:border-[color:var(--co-accent-border)]'
      }`}
    >
      {look.iconStyle !== 'none' && <KindIcon ot={ot} className="h-4 w-4 shrink-0" />}
      {ot.name}
      {ot.advance_order_enabled && <CalendarClock aria-label="Pre-order" className="h-3.5 w-3.5 shrink-0 opacity-80" />}
    </button>
  )
}

const PHOTO_KINDS: Readonly<Record<string, OrderTypePhotoKind>> = { dine_in: 'dine_in', pickup: 'pickup', delivery: 'delivery' }

function PhotoTile({ ot, isSelected, look, onSelect }: ChoiceProps) {
  const photo = look.images[PHOTO_KINDS[ot.type] ?? 'other']
  const Icon = ORDER_TYPE_ICONS[ot.type] ?? ORDER_TYPE_ICONS.other
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      className={`relative aspect-[4/3] w-full overflow-hidden text-left transition ${cornersClass(look.corners, 'rounded-2xl')} ${
        isSelected ? 'ring-[3px] ring-[color:var(--co-accent)] ring-offset-2 ring-offset-[color:var(--co-card)]' : 'ring-1 ring-[color:var(--co-border)]'
      }`}
    >
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded photo on any image host
        <img src={photo} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center bg-[var(--co-accent-soft)] text-[color:var(--co-accent)]">
          <Icon className="h-12 w-12 opacity-70" />
        </span>
      )}
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/40 to-transparent px-3 pb-2.5 pt-8 text-white">
        <span className="block text-base font-bold leading-tight">{ot.name}</span>
        {look.showDescriptions && ot.description && <span className="mt-0.5 line-clamp-2 block text-xs text-white/85">{ot.description}</span>}
        {ot.advance_order_enabled && <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold"><CalendarClock className="h-3 w-3" aria-hidden="true" /> Pre-order</span>}
      </span>
      {isSelected && <SelectedTick className="absolute right-2 top-2" />}
    </button>
  )
}

function Segmented({ checkout, look }: { checkout: UseCheckoutReturn; look: OrderTypeLook }) {
  const { orderTypes, orderType, setOrderType, selectedOrderTypeData } = checkout
  const track = cornersClass(look.corners, 'rounded-full')
  return (
    <div>
      <div className={`flex gap-1 bg-[var(--co-subtle-strong)] p-1 ${track}`}>
        {orderTypes.map((ot) => {
          const isSelected = orderType === ot.id
          return (
            <button
              key={ot.id}
              type="button"
              onClick={() => setOrderType(ot.id)}
              aria-pressed={isSelected}
              className={`flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 px-2 py-2 text-sm font-semibold transition ${track} ${
                isSelected ? 'bg-[var(--co-accent)] text-[color:var(--co-accent-text)] shadow-sm' : 'text-[color:var(--co-text)] hover:bg-[var(--co-subtle)]'
              }`}
            >
              {look.iconStyle !== 'none' && <KindIcon ot={ot} className="h-4 w-4 shrink-0" />}
              <span className="truncate">{ot.name}</span>
              {ot.advance_order_enabled && <CalendarClock aria-label="Pre-order" className="h-3.5 w-3.5 shrink-0 opacity-80" />}
            </button>
          )
        })}
      </div>
      {/* The chosen way's details, under the bar (never hidden on phones). */}
      {look.showDescriptions && selectedOrderTypeData?.description && (
        <p className="mt-2 px-1 text-sm text-[color:var(--co-muted)]">{selectedOrderTypeData.description}</p>
      )}
    </div>
  )
}

const GRID_COLUMNS: Record<'1' | '2' | '3', string> = { '1': 'grid-cols-1', '2': 'grid-cols-2', '3': 'grid-cols-3' }

/** Photo tiles: two across unless there is only one, or the owner chose. */
function photoColumns(columns: OrderTypeColumns, count: number): string {
  if (columns !== 'auto') return GRID_COLUMNS[columns]
  return count === 1 ? GRID_COLUMNS['1'] : GRID_COLUMNS['2']
}

const LAYOUT: Record<Exclude<OrderTypeDesign, 'tiles' | 'segmented'>, { Choice: (props: ChoiceProps) => ReactNode; wrap: (look: OrderTypeLook, count: number) => string }> = {
  list: { Choice: ListRow, wrap: () => 'flex flex-col gap-2' },
  cards: { Choice: DetailCard, wrap: () => 'flex flex-col gap-3' },
  buttons: { Choice: BigButton, wrap: () => 'flex flex-col gap-3' },
  chips: { Choice: Chip, wrap: () => 'flex flex-wrap gap-2' },
  photo: { Choice: PhotoTile, wrap: (look, count) => `grid gap-3 ${photoColumns(look.columns, count)}` },
}

/** The order-type question in the block's chosen design. */
export function OrderTypeChoices({ checkout, look = DEFAULT_ORDER_TYPE_LOOK }: { checkout: UseCheckoutReturn; look?: OrderTypeLook }) {
  const { orderTypes, orderType, setOrderType } = checkout
  if (!orderTypes.length) return null
  if (look.design === 'tiles') return <OrderTypeSelector checkout={checkout} look={look} />
  if (look.design === 'segmented') {
    return (
      <div style={checkoutThemeStyle(checkout)} data-branding-scope="checkout/choice">
        <Segmented checkout={checkout} look={look} />
      </div>
    )
  }
  const { Choice, wrap } = LAYOUT[look.design]
  return (
    <div className={wrap(look, orderTypes.length)} style={checkoutThemeStyle(checkout)} data-branding-scope="checkout/choice">
      {orderTypes.map((ot) => (
        <Choice key={ot.id} ot={ot} isSelected={orderType === ot.id} look={look} onSelect={() => setOrderType(ot.id)} />
      ))}
    </div>
  )
}
