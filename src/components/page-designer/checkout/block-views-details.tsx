'use client'

/**
 * The checkout's "about you" blocks — header, closed notice, order type,
 * schedule, customer details, stamp card, texts tick box — as pure views over
 * a useCheckout() value. The storefront feeds them the live hook; the Page
 * Designer feeds them a sample. Each required block that does not apply to
 * this store renders nothing.
 */

import { ArrowLeft, Clock, Sparkles } from 'lucide-react'

import type { UseCheckoutReturn } from '@/hooks/useCheckout'
import type { PageBlockRenderProps } from '@/components/hero-builder/renderer/page-runtime'
import {
  AdvanceOrderScheduler,
  CheckoutFields,
  OrderTypeSelector,
  SmsOptInCheckbox,
} from '@/components/customer/checkout-templates/checkout-primitives'
import { CheckoutLoyaltyProgress } from '@/components/customer/checkout-templates/checkout-loyalty-progress'

import { BlockCard } from './block-card'

export interface CheckoutBlockViewProps {
  checkout: UseCheckoutReturn
  block: PageBlockRenderProps
}

const isOn = (block: PageBlockRenderProps, key: string): boolean => block.option(key) !== false

/** The section subtitle, unless the owner switched it off. */
export function subtitleOf(block: PageBlockRenderProps): string | undefined {
  return isOn(block, 'show_subtitle') ? block.text('subtitle') : undefined
}

export function cardOf(block: PageBlockRenderProps): boolean {
  return isOn(block, 'card')
}

export function HeaderView({ checkout, block }: CheckoutBlockViewProps) {
  const subtitle = subtitleOf(block)
  return (
    // Senior mode has its own step bar with a back button.
    <header data-senior-hidden className="flex items-center gap-3 text-[color:var(--co-text)]">
      {isOn(block, 'show_back') && (
        <button
          type="button"
          onClick={() => checkout.router.push(`/${checkout.tenantSlug}/cart`)}
          aria-label="Back to cart"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[var(--co-subtle-strong)]"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
      )}
      <div className="min-w-0">
        <h1 className="text-2xl font-bold leading-tight text-[color:var(--co-text)]">{block.text('title')}</h1>
        {subtitle && <p className="text-sm text-[color:var(--co-muted)]">{subtitle}</p>}
      </div>
    </header>
  )
}

export function StoreClosedView({ checkout, block }: CheckoutBlockViewProps) {
  const status = checkout.openStatus
  if (!status?.isOrderingBlocked) return null
  const isPrelaunch = status.reason === 'prelaunch'
  const Icon = isPrelaunch ? Sparkles : Clock
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-2xl border border-[color:var(--co-warning-border)] bg-[var(--co-warning-soft)] p-4 text-sm text-[color:var(--co-text)]"
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--co-warning)]" aria-hidden="true" />
      <div className="min-w-0">
        <p className="font-semibold">{isPrelaunch ? block.text('prelaunch') : block.text('closed')}</p>
        {isPrelaunch && <p className="text-[color:var(--co-muted)]">{block.text('prelaunch_detail')}</p>}
        {!isPrelaunch && status.nextOpenLabel && <p className="text-[color:var(--co-muted)]">Opens {status.nextOpenLabel}</p>}
      </div>
    </div>
  )
}

export function OrderTypeView({ checkout, block }: CheckoutBlockViewProps) {
  // A sole order type is already chosen: asking would be a step made of an answer.
  if (!checkout.shouldAskFulfillment || checkout.orderTypes.length === 0) return null
  return (
    <BlockCard isCard={cardOf(block)} title={block.text('title')} subtitle={subtitleOf(block)}>
      <OrderTypeSelector checkout={checkout} />
    </BlockCard>
  )
}

export function ScheduleView({ checkout, block }: CheckoutBlockViewProps) {
  if (!checkout.advanceConfig.enabled) return null
  return (
    <BlockCard isCard={cardOf(block)}>
      <AdvanceOrderScheduler
        checkout={checkout}
        copy={{
          title: block.text('title'),
          asapTitle: block.text('asap_title'),
          asapSubtitle: block.text('asap_subtitle'),
          laterTitle: block.text('later_title'),
          laterSubtitle: block.text('later_subtitle'),
          laterRequired: block.text('later_required'),
        }}
      />
    </BlockCard>
  )
}

/** The details form shows once an order type is chosen and the store asks anything. */
function asksForDetails(checkout: UseCheckoutReturn): boolean {
  return !!checkout.orderType && checkout.formFields.length > 0
}

export function CustomerView({ checkout, block }: CheckoutBlockViewProps) {
  if (!asksForDetails(checkout)) return null
  return (
    <BlockCard isCard={cardOf(block)} title={block.text('title')} subtitle={subtitleOf(block)}>
      {/* The stamp card and the tick box are blocks of their own here. */}
      <CheckoutFields checkout={checkout} columns={2} showLoyalty={false} showSmsOptIn={false} />
    </BlockCard>
  )
}

export function LoyaltyView({ checkout }: CheckoutBlockViewProps) {
  return <CheckoutLoyaltyProgress checkout={checkout} />
}

export function SmsOptInView({ checkout, block }: CheckoutBlockViewProps) {
  // Consent belongs with the details it is about; no form, no question.
  if (!asksForDetails(checkout)) return null
  return <SmsOptInCheckbox checkout={checkout} label={block.text('label')} />
}
