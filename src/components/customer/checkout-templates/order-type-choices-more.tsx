'use client'

/**
 * The order-type designs added in v3 — underline tabs, a two-way switch,
 * expanding cards, swipe cards, ticket stubs and kiosk "doors". Like the
 * first seven they are presentation only (same `orderTypes`, same
 * `setOrderType`, same pre-order chip), and every one is a real radio group:
 * one tab stop, arrows move the choice, `aria-checked` on the chosen one.
 */

import { Check } from 'lucide-react'
import type { ReactNode } from 'react'

import type { UseCheckoutReturn } from '@/hooks/useCheckout'
import { cornersClass } from '@/lib/page-designer/knobs'
import type { OrderType } from '@/types/database'

import {
  ChoiceIcon,
  KindIcon,
  PreorderChip,
  PreorderMark,
  SelectedTick,
  choiceSurface,
  descriptionOf,
  handleRadioKeys,
  nameOf,
  radioProps,
  type OrderTypeLookBase,
} from './order-type-parts'

export const MORE_ORDER_TYPE_DESIGNS = ['tabs', 'switch', 'expanding', 'swipe', 'ticket', 'doors'] as const
export type MoreOrderTypeDesign = (typeof MORE_ORDER_TYPE_DESIGNS)[number]

interface DesignProps {
  checkout: UseCheckoutReturn
  look: OrderTypeLookBase<string>
}

/** The radio group wrapper: arrows / Home / End move the choice. */
function RadioGroup({ checkout, className, children }: { checkout: UseCheckoutReturn; className: string; children: ReactNode }) {
  const { orderTypes, orderType, setOrderType } = checkout
  return (
    <div role="radiogroup" aria-label="Order type" className={className} onKeyDown={(e) => handleRadioKeys(e, orderTypes, orderType, setOrderType)}>
      {children}
    </div>
  )
}

/** The chosen way's details, under a bar of choices (never hidden on phones). */
function ChosenDetails({ checkout, look }: DesignProps) {
  const chosen = checkout.orderTypes.find((ot) => ot.id === checkout.orderType)
  const description = chosen ? descriptionOf(chosen, look.wording) : undefined
  if (!look.showDescriptions || !description) return null
  return <p data-part="option-desc" className="mt-2 px-1 text-sm text-[color:var(--co-muted)]">{description}</p>
}

// ── Underline tabs ─────────────────────────────────────────────────────────

function Tabs({ checkout, look }: DesignProps) {
  const { orderTypes, orderType, setOrderType } = checkout
  const index = orderTypes.findIndex((ot) => ot.id === orderType)
  const share = 100 / orderTypes.length
  return (
    <div>
      <RadioGroup checkout={checkout} className="relative flex border-b-2 border-[color:var(--co-border)]">
        {orderTypes.map((ot) => {
          const isSelected = ot.id === orderType
          return (
            <button
              key={ot.id}
              {...radioProps(ot, orderTypes, orderType)}
              onClick={() => setOrderType(ot.id)}
              className={`flex min-h-12 min-w-0 flex-1 items-center justify-center gap-1.5 px-2 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--co-accent)] disabled:cursor-not-allowed disabled:opacity-50 ${
                isSelected ? 'text-[color:var(--co-accent)]' : 'text-[color:var(--co-muted)] hover:text-[color:var(--co-text)]'
              }`}
            >
              {look.iconStyle !== 'none' && <KindIcon ot={ot} wording={look.wording} className="h-4 w-4 shrink-0" />}
              <span data-part="option-label" className="truncate">{nameOf(ot, look.wording)}</span>
              <PreorderMark ot={ot} />
            </button>
          )
        })}
        {/* The accent underline slides to the chosen tab. */}
        {index >= 0 && (
          <span
            aria-hidden="true"
            data-part="tick"
            className="pointer-events-none absolute -bottom-0.5 h-[3px] rounded-full bg-[var(--co-accent)] motion-safe:transition-[left] motion-safe:duration-300"
            style={{ left: `${index * share}%`, width: `${share}%` }}
          />
        )}
      </RadioGroup>
      <ChosenDetails checkout={checkout} look={look} />
    </div>
  )
}

// ── Two-way switch ─────────────────────────────────────────────────────────

/** Exactly two ways: a labelled toggle with a sliding thumb. */
function Switch({ checkout, look }: DesignProps) {
  const { orderTypes, orderType, setOrderType } = checkout
  const index = orderTypes.findIndex((ot) => ot.id === orderType)
  const round = cornersClass(look.corners, 'rounded-full')
  return (
    <div>
      <RadioGroup checkout={checkout} className={`relative grid grid-cols-2 bg-[var(--co-subtle-strong)] p-1 ${round}`}>
        {index >= 0 && (
          <span
            aria-hidden="true"
            data-part="tick"
            className={`pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] bg-[var(--co-accent)] shadow-sm motion-safe:transition-transform motion-safe:duration-300 ${round}`}
            style={{ transform: index === 1 ? 'translateX(100%)' : undefined }}
          />
        )}
        {orderTypes.map((ot) => {
          const isSelected = ot.id === orderType
          return (
            <button
              key={ot.id}
              {...radioProps(ot, orderTypes, orderType)}
              onClick={() => setOrderType(ot.id)}
              className={`relative z-10 flex min-h-12 min-w-0 items-center justify-center gap-2 px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--co-accent)] disabled:cursor-not-allowed disabled:opacity-50 ${round} ${
                isSelected ? 'text-[color:var(--co-accent-text)]' : 'text-[color:var(--co-text)]'
              }`}
            >
              {look.iconStyle !== 'none' && <KindIcon ot={ot} wording={look.wording} className="h-4 w-4 shrink-0" />}
              <span data-part="option-label" className="truncate">{nameOf(ot, look.wording)}</span>
              <PreorderMark ot={ot} />
            </button>
          )
        })}
      </RadioGroup>
      <ChosenDetails checkout={checkout} look={look} />
    </div>
  )
}

// ── Expanding cards ────────────────────────────────────────────────────────

function RadioDot({ isSelected }: { isSelected: boolean }) {
  return (
    <span
      aria-hidden="true"
      data-part="tick"
      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${isSelected ? 'border-[color:var(--co-accent)]' : 'border-[color:var(--co-border)]'}`}
    >
      {isSelected && <span className="h-2.5 w-2.5 rounded-full bg-[var(--co-accent)]" />}
    </span>
  )
}

/** Radio cards; the chosen one opens to show its details. */
function Expanding({ checkout, look }: DesignProps) {
  const { orderTypes, orderType, setOrderType } = checkout
  return (
    <RadioGroup checkout={checkout} className="flex flex-col gap-2">
      {orderTypes.map((ot) => {
        const isSelected = ot.id === orderType
        const description = look.showDescriptions ? descriptionOf(ot, look.wording) : undefined
        return (
          <button
            key={ot.id}
            {...radioProps(ot, orderTypes, orderType)}
            onClick={() => setOrderType(ot.id)}
            className={`w-full border-2 px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--co-accent)] disabled:cursor-not-allowed disabled:opacity-50 ${cornersClass(look.corners, 'rounded-xl')} ${choiceSurface(isSelected)}`}
          >
            <span className="flex items-center gap-3">
              <ChoiceIcon ot={ot} isSelected={isSelected} iconStyle={look.iconStyle} wording={look.wording} size="sm" />
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                <span data-part="option-label" className="font-semibold text-[color:var(--co-text)]">{nameOf(ot, look.wording)}</span>
                <PreorderChip ot={ot} />
              </span>
              <RadioDot isSelected={isSelected} />
            </span>
            {isSelected && description && (
              <span
                data-part="option-desc"
                className="mt-2 block border-t border-[color:var(--co-accent-border)] pt-2 text-sm leading-snug text-[color:var(--co-muted)] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-200"
              >
                {description}
              </span>
            )}
          </button>
        )
      })}
    </RadioGroup>
  )
}

// ── Swipe cards ────────────────────────────────────────────────────────────

/** Large cards in a row that snaps as it is swiped, with page dots. */
function Swipe({ checkout, look }: DesignProps) {
  const { orderTypes, orderType, setOrderType } = checkout
  const isSingle = orderTypes.length === 1
  return (
    <div>
      <RadioGroup
        checkout={checkout}
        className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {orderTypes.map((ot) => {
          const isSelected = ot.id === orderType
          const description = look.showDescriptions ? descriptionOf(ot, look.wording) : undefined
          return (
            <button
              key={ot.id}
              {...radioProps(ot, orderTypes, orderType)}
              onClick={(e) => {
                setOrderType(ot.id)
                e.currentTarget.scrollIntoView?.({ block: 'nearest', inline: 'center', behavior: 'smooth' })
              }}
              className={`relative flex min-h-40 shrink-0 snap-center flex-col justify-between gap-6 border-2 p-5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--co-accent)] disabled:cursor-not-allowed disabled:opacity-50 ${
                isSingle ? 'w-full' : 'w-[78%] sm:w-[60%]'
              } ${cornersClass(look.corners, 'rounded-3xl')} ${choiceSurface(isSelected)}`}
            >
              <ChoiceIcon ot={ot} isSelected={isSelected} iconStyle={look.iconStyle} wording={look.wording} size="lg" />
              <span className="block">
                <span data-part="option-label" className="block text-xl font-bold leading-tight text-[color:var(--co-text)]">{nameOf(ot, look.wording)}</span>
                {description && <span data-part="option-desc" className="mt-1 block text-sm leading-snug text-[color:var(--co-muted)]">{description}</span>}
                {ot.advance_order_enabled && <span className="mt-2 block"><PreorderChip ot={ot} /></span>}
              </span>
              {isSelected && <SelectedTick className="absolute right-4 top-4" />}
            </button>
          )
        })}
      </RadioGroup>
      {!isSingle && (
        <div aria-hidden="true" className="mt-1 flex justify-center gap-1.5">
          {orderTypes.map((ot) => (
            <span
              key={ot.id}
              className={`h-1.5 rounded-full transition-all ${ot.id === orderType ? 'w-5 bg-[var(--co-accent)]' : 'w-1.5 bg-[var(--co-border)]'}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Ticket stubs ───────────────────────────────────────────────────────────

/** A half-circle cut into the ticket's top or bottom edge, on the perforation. */
function Notch({ edge, isSelected }: { edge: 'top' | 'bottom'; isSelected: boolean }) {
  const place = edge === 'top' ? '-top-0.5 -translate-y-1/2 [clip-path:inset(50%_0_0_0)]' : '-bottom-0.5 translate-y-1/2 [clip-path:inset(0_0_50%_0)]'
  return (
    <span
      aria-hidden="true"
      className={`absolute left-0 h-4 w-4 -translate-x-1/2 rounded-full border-2 bg-[var(--co-card)] ${place} ${isSelected ? 'border-[color:var(--co-accent)]' : 'border-[color:var(--co-border)]'}`}
    />
  )
}

function Ticket({ ot, isSelected, look, checkout }: { ot: OrderType; isSelected: boolean } & DesignProps) {
  const { orderTypes, orderType, setOrderType } = checkout
  const description = look.showDescriptions ? descriptionOf(ot, look.wording) : undefined
  return (
    <button
      {...radioProps(ot, orderTypes, orderType)}
      onClick={() => setOrderType(ot.id)}
      className={`relative flex w-full items-stretch border-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[color:var(--co-accent)] focus-visible:ring-offset-[color:var(--co-card)] disabled:cursor-not-allowed disabled:opacity-50 ${cornersClass(look.corners, 'rounded-2xl')} ${choiceSurface(isSelected)}`}
    >
      <span className="flex w-16 shrink-0 items-center justify-center py-4 sm:w-20">
        <ChoiceIcon ot={ot} isSelected={isSelected} iconStyle={look.iconStyle} wording={look.wording} />
      </span>
      {/* The perforation between the stub and the ticket. */}
      <span aria-hidden="true" data-part="divider" className="relative w-0 border-l-2 border-dashed border-[color:var(--co-border)]">
        <Notch edge="top" isSelected={isSelected} />
        <Notch edge="bottom" isSelected={isSelected} />
      </span>
      <span className="min-w-0 flex-1 py-3.5 pl-4 pr-16">
        <span className="flex flex-wrap items-center gap-1.5">
          <span data-part="option-label" className="text-base font-bold leading-tight text-[color:var(--co-text)]">{nameOf(ot, look.wording)}</span>
          <PreorderChip ot={ot} />
        </span>
        {description && <span data-part="option-desc" className="mt-0.5 block text-sm leading-snug text-[color:var(--co-muted)]">{description}</span>}
      </span>
      {/* The chosen ticket is stamped. */}
      {isSelected && (
        <span
          aria-hidden="true"
          data-part="tick"
          className="absolute right-3 top-1/2 flex h-12 w-12 -translate-y-1/2 -rotate-12 flex-col items-center justify-center rounded-full border-2 border-[color:var(--co-accent)] text-[color:var(--co-accent)] motion-safe:animate-in motion-safe:zoom-in-75 motion-safe:duration-200"
        >
          <Check className="h-4 w-4" strokeWidth={3} />
          <span className="text-[8px] font-black uppercase tracking-wider">Picked</span>
        </span>
      )}
    </button>
  )
}

function Tickets({ checkout, look }: DesignProps) {
  return (
    <RadioGroup checkout={checkout} className="flex flex-col gap-3">
      {checkout.orderTypes.map((ot) => (
        <Ticket key={ot.id} ot={ot} isSelected={ot.id === checkout.orderType} checkout={checkout} look={look} />
      ))}
    </RadioGroup>
  )
}

// ── Doors (kiosk) ──────────────────────────────────────────────────────────

const DOOR_COLUMNS: Readonly<Record<number, string>> = { 1: 'grid-cols-1', 2: 'grid-cols-2' }

/** Two or three tall halves side by side, sized for a thumb or a kiosk. */
function Doors({ checkout, look }: DesignProps) {
  const { orderTypes, orderType, setOrderType } = checkout
  return (
    <RadioGroup checkout={checkout} className={`grid gap-3 ${DOOR_COLUMNS[orderTypes.length] ?? 'grid-cols-3'}`}>
      {orderTypes.map((ot) => {
        const isSelected = ot.id === orderType
        const description = look.showDescriptions ? descriptionOf(ot, look.wording) : undefined
        return (
          <button
            key={ot.id}
            {...radioProps(ot, orderTypes, orderType)}
            onClick={() => setOrderType(ot.id)}
            className={`flex min-h-44 min-w-0 flex-col items-center justify-center gap-3 border-2 px-2 py-5 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[color:var(--co-accent)] focus-visible:ring-offset-[color:var(--co-card)] disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-56 ${cornersClass(look.corners, 'rounded-3xl')} ${
              isSelected
                ? 'border-[color:var(--co-accent)] bg-[var(--co-accent)] text-[color:var(--co-accent-text)] shadow-md'
                : 'border-[color:var(--co-border)] bg-[var(--co-card)] text-[color:var(--co-text)] hover:border-[color:var(--co-accent-border)]'
            }`}
          >
            {look.iconStyle !== 'none' && <KindIcon ot={ot} wording={look.wording} className="h-10 w-10 shrink-0 sm:h-12 sm:w-12" />}
            <span data-part="option-label" className="block break-words text-lg font-extrabold leading-tight sm:text-2xl">{nameOf(ot, look.wording)}</span>
            {description && (
              <span data-part="option-desc" className={`line-clamp-3 block text-xs sm:text-sm ${isSelected ? 'opacity-90' : 'text-[color:var(--co-muted)]'}`}>{description}</span>
            )}
            {ot.advance_order_enabled && (
              <span data-part="badge" className={`block text-xs font-semibold ${isSelected ? 'opacity-90' : 'text-[color:var(--co-accent)]'}`}>Pre-order</span>
            )}
          </button>
        )
      })}
    </RadioGroup>
  )
}

const DESIGNS: Readonly<Record<MoreOrderTypeDesign, (props: DesignProps) => ReactNode>> = {
  tabs: Tabs,
  switch: Switch,
  expanding: Expanding,
  swipe: Swipe,
  ticket: Tickets,
  doors: Doors,
}

export function isMoreOrderTypeDesign(design: string): design is MoreOrderTypeDesign {
  return (MORE_ORDER_TYPE_DESIGNS as readonly string[]).includes(design)
}

/** The switch only fits exactly two ways; with any other count the standard tiles stand in. */
export function switchFits(checkout: UseCheckoutReturn): boolean {
  return checkout.orderTypes.length === 2
}

export function MoreOrderTypeChoices({ checkout, look, design }: DesignProps & { design: MoreOrderTypeDesign }) {
  const Design = DESIGNS[design]
  return <Design checkout={checkout} look={look} />
}
