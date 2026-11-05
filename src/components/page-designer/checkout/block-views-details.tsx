'use client'

/**
 * The checkout's "about you" blocks — order type, schedule, customer
 * details, stamp card, texts tick box — as pure views over
 * a useCheckout() value. The storefront feeds them the live hook; the Page
 * Designer feeds them a sample. Each required block that does not apply to
 * this store renders nothing.
 */

import type { UseCheckoutReturn } from '@/hooks/useCheckout'
import type { PageBlockRenderProps } from '@/components/hero-builder/renderer/page-runtime'
import {
  AdvanceOrderScheduler,
  CheckoutFields,
  SmsOptInCheckbox,
} from '@/components/customer/checkout-templates/checkout-primitives'
import { CheckoutLoyaltyProgress } from '@/components/customer/checkout-templates/checkout-loyalty-progress'
import {
  DEFAULT_ORDER_TYPE_LOOK,
  OrderTypeChoices,
  type OrderTypeLook,
} from '@/components/customer/checkout-templates/order-type-choices'
import { FIELD_COLUMNS, FIELD_STYLES, SCHEDULE_DESIGNS } from '@/lib/page-designer/checkout-block-options'

import { BlockCard } from './block-card'
import { blockChoice, cornersOf, isOn } from './block-looks'
import { BlockColors, blockCheckout } from './block-theme'

export interface CheckoutBlockViewProps {
  checkout: UseCheckoutReturn
  block: PageBlockRenderProps
}

/** The section subtitle, unless the owner switched it off. */
export function subtitleOf(block: PageBlockRenderProps): string | undefined {
  return isOn(block, 'show_subtitle') ? block.text('subtitle') : undefined
}

export function cardOf(block: PageBlockRenderProps): boolean {
  return isOn(block, 'card')
}

/** The block's order-type design and its settings (invalid stored values already read as defaults). */
export function orderTypeLook(block: PageBlockRenderProps): OrderTypeLook {
  const text = (key: string) => {
    const value = block.option(key)
    return typeof value === 'string' ? value : ''
  }
  const pick = <T extends string>(key: string, fallback: T): T => (text(key) || fallback) as T
  const images = Object.fromEntries(
    (['dine_in', 'pickup', 'delivery', 'other'] as const).map((kind) => [kind, text(`image_${kind}`)]).filter(([, url]) => url),
  )
  return {
    design: pick('variant', DEFAULT_ORDER_TYPE_LOOK.design),
    corners: pick('corners', DEFAULT_ORDER_TYPE_LOOK.corners),
    iconStyle: pick('icon_style', DEFAULT_ORDER_TYPE_LOOK.iconStyle),
    showDescriptions: isOn(block, 'show_descriptions'),
    columns: pick('columns', DEFAULT_ORDER_TYPE_LOOK.columns),
    align: pick('align', DEFAULT_ORDER_TYPE_LOOK.align),
    images,
  }
}

export function OrderTypeView({ checkout, block }: CheckoutBlockViewProps) {
  // A sole order type is already chosen: asking would be a step made of an answer.
  if (!checkout.shouldAskFulfillment || checkout.orderTypes.length === 0) return null
  const themed = blockCheckout(checkout, block)
  return (
    <BlockColors checkout={checkout} themed={themed}>
      <BlockCard isCard={cardOf(block)} title={block.text('title')} subtitle={subtitleOf(block)}>
        <OrderTypeChoices checkout={themed} look={orderTypeLook(block)} />
      </BlockCard>
    </BlockColors>
  )
}

export function ScheduleView({ checkout, block }: CheckoutBlockViewProps) {
  if (!checkout.advanceConfig.enabled) return null
  const themed = blockCheckout(checkout, block)
  return (
    <BlockColors checkout={checkout} themed={themed}>
      <BlockCard isCard={cardOf(block)}>
        <AdvanceOrderScheduler
          checkout={themed}
          look={{ design: blockChoice(block, 'variant', SCHEDULE_DESIGNS), corners: cornersOf(block) }}
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
    </BlockColors>
  )
}

/** The details form shows once an order type is chosen and the store asks anything. */
function asksForDetails(checkout: UseCheckoutReturn): boolean {
  return !!checkout.orderType && checkout.formFields.length > 0
}

export function CustomerView({ checkout, block }: CheckoutBlockViewProps) {
  if (!asksForDetails(checkout)) return null
  const themed = blockCheckout(checkout, block)
  const look = { style: blockChoice(block, 'variant', FIELD_STYLES), corners: cornersOf(block) }
  return (
    <BlockColors checkout={checkout} themed={themed}>
      <BlockCard isCard={cardOf(block)} title={block.text('title')} subtitle={subtitleOf(block)}>
        {/* The stamp card and the tick box are blocks of their own here. */}
        <CheckoutFields
          checkout={themed}
          columns={blockChoice(block, 'columns', FIELD_COLUMNS) === '1' ? 1 : 2}
          showLoyalty={false}
          showSmsOptIn={false}
          look={look}
        />
      </BlockCard>
    </BlockColors>
  )
}

export function LoyaltyView({ checkout }: CheckoutBlockViewProps) {
  return <CheckoutLoyaltyProgress checkout={checkout} />
}

export function SmsOptInView({ checkout, block }: CheckoutBlockViewProps) {
  // Consent belongs with the details it is about; no form, no question.
  if (!asksForDetails(checkout)) return null
  const themed = blockCheckout(checkout, block)
  return (
    <BlockColors checkout={checkout} themed={themed}>
      <SmsOptInCheckbox checkout={themed} label={block.text('label')} />
    </BlockColors>
  )
}
