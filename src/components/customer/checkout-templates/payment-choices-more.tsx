'use client'

/**
 * The payment designs added in v3. Like the first three, only the chooser
 * changes: the same `paymentMethods` / `setSelectedPaymentMethod`, the same
 * hidden native radios (the browser handles the keyboard), the same ticket.
 *
 * - `chosen`: just the chosen method, with "Change" opening the full list
 *   in the page (no pop-up to lose on a phone).
 * - `accordion`: one row per method; the chosen row opens its QR and
 *   account details inside it.
 * - `split`: "Pay now" (online) or "Pay at the counter / on delivery"
 *   first, then that group's methods (payment-groups.ts). With only one
 *   kind of method there is nothing to split and the plain list shows.
 */

import { ChevronDown, HandCoins, Smartphone } from 'lucide-react'
import { useId, useRef, useState, type ReactNode } from 'react'

import type { UseCheckoutReturn } from '@/hooks/useCheckout'
import { getCheckoutPalette } from '@/lib/branding-utils'
import { canSplitPayments, paymentGroupOf, splitPaymentMethods, type PaymentGroup } from '@/lib/checkout/payment-groups'
import { cornersClass } from '@/lib/page-designer/knobs'
import type { PaymentMethod } from '@/types/database'

import type { PaymentLook } from './payment-choices'
import { FOCUS_RING, ProofLine, Radio, RadioTick, Row, SmallMark, surface } from './payment-choice-parts'
import { PaymentTicket, SHOW_ALL_PAYMENT_PARTS, type PaymentShow } from './payment-method-list'

export const MORE_PAYMENT_DESIGNS = ['chosen', 'accordion', 'split'] as const
export type MorePaymentDesign = (typeof MORE_PAYMENT_DESIGNS)[number]

export function isMorePaymentDesign(design: string): design is MorePaymentDesign {
  return (MORE_PAYMENT_DESIGNS as readonly string[]).includes(design)
}

/** The names of the two split choices; blank `inPerson` = worded for the order type. */
export interface SplitLabels {
  now: string
  inPerson: string
}

interface DesignProps {
  checkout: UseCheckoutReturn
  look: PaymentLook
}

function useTicket(checkout: UseCheckoutReturn, show: PaymentShow) {
  const { paymentMethods, selectedPaymentMethod, openQrDialog, handleCopyText, copiedText, tenant, branding } = checkout
  const { accent } = getCheckoutPalette(tenant, branding)
  const selected = paymentMethods.find((m) => m.id === selectedPaymentMethod) ?? null
  const ticket = (method: PaymentMethod, isInline = false) => (
    <PaymentTicket key={method.id} method={method} accent={accent} copiedText={copiedText} onCopy={handleCopyText} onEnlargeQr={openQrDialog} show={show} isInline={isInline} />
  )
  return { selected, ticket }
}

function MethodRows({ checkout, look, methods, onPicked }: DesignProps & { methods: readonly PaymentMethod[]; onPicked?: () => void }) {
  const { selectedPaymentMethod, setSelectedPaymentMethod } = checkout
  return (
    <div className="flex flex-col gap-2">
      {methods.map((method) => (
        <Row
          key={method.id}
          method={method}
          isSelected={method.id === selectedPaymentMethod}
          corners={look.corners}
          show={look.show}
          onSelect={() => {
            setSelectedPaymentMethod(method.id)
            onPicked?.()
          }}
        />
      ))}
    </div>
  )
}

// ── Chosen + Change ────────────────────────────────────────────────────────

function ChosenAndChange({ checkout, look }: DesignProps) {
  const show = look.show ?? SHOW_ALL_PAYMENT_PARTS
  const { selected, ticket } = useTicket(checkout, show)
  const [isOpen, setIsOpen] = useState(false)
  // A pick by finger or mouse closes the list; arrow keys only move the choice (the list stays open).
  const isPointerPick = useRef(false)
  const listId = useId()
  const isListShown = isOpen || !selected

  return (
    <div>
      {selected && (
        <div
          data-branding-scope="checkout/choice"
          data-part="option"
          data-on=""
          className={`flex min-h-14 w-full items-center gap-3 border-2 px-3 py-2.5 ${cornersClass(look.corners, 'rounded-xl')} ${surface(true)}`}
        >
          {show.icons && <SmallMark method={selected} />}
          <span className="min-w-0 flex-1">
            <span data-part="option-label" className="block truncate text-sm font-semibold text-[color:var(--co-text)]">{selected.name}</span>
            {show.proof && <ProofLine method={selected} />}
          </span>
          <button
            type="button"
            data-part="link"
            aria-expanded={isListShown}
            aria-controls={listId}
            onClick={() => setIsOpen((open) => !open)}
            className="inline-flex min-h-11 shrink-0 items-center rounded-md px-2 text-sm font-semibold text-[color:var(--co-accent)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--co-accent)]"
          >
            {isOpen ? 'Done' : 'Change'}
          </button>
        </div>
      )}
      {isListShown && (
        <div id={listId} onPointerDown={() => (isPointerPick.current = true)} className={selected ? 'mt-2 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150' : ''}>
          <MethodRows
            checkout={checkout}
            look={look}
            methods={checkout.paymentMethods}
            onPicked={() => {
              if (isPointerPick.current) setIsOpen(false)
              isPointerPick.current = false
            }}
          />
        </div>
      )}
      {selected && ticket(selected)}
    </div>
  )
}

// ── Accordion ──────────────────────────────────────────────────────────────

function Accordion({ checkout, look }: DesignProps) {
  const show = look.show ?? SHOW_ALL_PAYMENT_PARTS
  const { ticket } = useTicket(checkout, show)
  const { paymentMethods, selectedPaymentMethod, setSelectedPaymentMethod } = checkout
  return (
    <div className="flex flex-col gap-2">
      {paymentMethods.map((method) => {
        const isSelected = method.id === selectedPaymentMethod
        return (
          <div
            key={method.id}
            data-branding-scope="checkout/choice"
            data-part="option"
            data-on={isSelected ? '' : undefined}
            className={`overflow-hidden border-2 transition-[border-color,background-color] ${cornersClass(look.corners, 'rounded-xl')} ${surface(isSelected)}`}
          >
            <label className={`flex min-h-14 w-full cursor-pointer items-center gap-3 px-3 py-2.5 ${cornersClass(look.corners, 'rounded-xl')} ${FOCUS_RING}`}>
              <Radio method={method} isSelected={isSelected} onSelect={() => setSelectedPaymentMethod(method.id)} />
              <RadioTick isSelected={isSelected} />
              {show.icons && <SmallMark method={method} />}
              <span className="min-w-0 flex-1">
                <span data-part="option-label" className="block truncate text-sm font-semibold text-[color:var(--co-text)]">{method.name}</span>
                {show.proof && <ProofLine method={method} />}
              </span>
              <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 text-[color:var(--co-muted)] motion-safe:transition-transform ${isSelected ? 'rotate-180' : ''}`} />
            </label>
            {isSelected && <div className="px-3 pb-3">{ticket(method, true)}</div>}
          </div>
        )
      })}
    </div>
  )
}

// ── Pay now / pay in person ────────────────────────────────────────────────

const GROUP_ICON = { now: Smartphone, in_person: HandCoins } as const

function inPersonLabel(checkout: UseCheckoutReturn, own: string | undefined): string {
  if (own?.trim()) return own.trim()
  return checkout.selectedOrderTypeData?.type === 'delivery' ? 'Pay on delivery' : 'Pay at the counter'
}

function GroupChoice({ group, label, methods, isSelected, look, onSelect }: { group: PaymentGroup; label: string; methods: readonly PaymentMethod[]; isSelected: boolean; look: PaymentLook; onSelect: () => void }) {
  const Icon = GROUP_ICON[group]
  return (
    <label
      data-branding-scope="checkout/choice"
      data-part="option"
      data-on={isSelected ? '' : undefined}
      className={`flex min-h-20 w-full cursor-pointer flex-col items-start gap-2 border-2 p-3 text-left transition-[border-color,background-color] ${cornersClass(look.corners, 'rounded-2xl')} ${FOCUS_RING} ${surface(isSelected)}`}
    >
      <input type="radio" name="payment-group" value={group} checked={isSelected} onChange={onSelect} className="sr-only" />
      <span
        aria-hidden="true"
        data-part="icon"
        data-on={isSelected ? '' : undefined}
        className={`inline-flex h-9 w-9 items-center justify-center rounded-full ${isSelected ? 'bg-[var(--co-accent)] text-[color:var(--co-accent-text)]' : 'bg-[var(--co-subtle-strong)] text-[color:var(--co-muted)]'}`}
      >
        <Icon className="h-4.5 w-4.5" />
      </span>
      <span className="block min-w-0">
        <span data-part="option-label" className="block text-sm font-bold leading-tight text-[color:var(--co-text)]">{label}</span>
        <span data-part="option-desc" className="mt-0.5 line-clamp-2 block text-xs text-[color:var(--co-muted)]">{methods.map((m) => m.name).join(', ')}</span>
      </span>
    </label>
  )
}

function Split({ checkout, look }: DesignProps) {
  const show = look.show ?? SHOW_ALL_PAYMENT_PARTS
  const { selected, ticket } = useTicket(checkout, show)
  const groups = splitPaymentMethods(checkout.paymentMethods)
  const [picked, setPicked] = useState<PaymentGroup | null>(null)
  // The chosen method's group wins, so the choice always matches what is chosen.
  const group = selected ? paymentGroupOf(selected) : picked

  const choose = (next: PaymentGroup) => {
    setPicked(next)
    if (selected && paymentGroupOf(selected) === next) return
    const methods = groups[next]
    // One method in the group: it is the answer. Several: the customer picks.
    checkout.setSelectedPaymentMethod(methods.length === 1 ? methods[0].id : null)
  }

  if (!canSplitPayments(groups)) {
    return (
      <div>
        <MethodRows checkout={checkout} look={look} methods={checkout.paymentMethods} />
        {selected && ticket(selected)}
      </div>
    )
  }

  const labels: SplitLabels = { now: look.splitLabels?.now?.trim() || 'Pay now', inPerson: inPersonLabel(checkout, look.splitLabels?.inPerson) }
  return (
    <div>
      <div role="radiogroup" aria-label="When to pay" className="grid grid-cols-2 gap-3">
        <GroupChoice group="now" label={labels.now} methods={groups.now} isSelected={group === 'now'} look={look} onSelect={() => choose('now')} />
        <GroupChoice group="in_person" label={labels.inPerson} methods={groups.in_person} isSelected={group === 'in_person'} look={look} onSelect={() => choose('in_person')} />
      </div>
      {group && groups[group].length > 1 && (
        <div className="mt-3">
          <MethodRows checkout={checkout} look={look} methods={groups[group]} />
        </div>
      )}
      {selected && ticket(selected)}
    </div>
  )
}

const DESIGNS: Readonly<Record<MorePaymentDesign, (props: DesignProps) => ReactNode>> = {
  chosen: ChosenAndChange,
  accordion: Accordion,
  split: Split,
}

export function MoreHowToPay({ checkout, look, design }: DesignProps & { design: MorePaymentDesign }) {
  const Design = DESIGNS[design]
  return <Design checkout={checkout} look={look} />
}
