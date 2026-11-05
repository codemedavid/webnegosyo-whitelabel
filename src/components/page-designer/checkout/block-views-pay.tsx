'use client'

/**
 * The checkout's money blocks — summary, voucher, Senior/PWD, payment and the
 * place-order button — as pure views over a useCheckout() value. The ONLY
 * way a designed checkout submits is the place-order block's CheckoutCTA,
 * which calls the hook's handleProceedToPayment exactly as every standard
 * design does. A block's design and colours change how it looks, never what
 * it does.
 */

import { formatPrice } from '@/lib/cart-utils'
import { getCheckoutPalette } from '@/lib/branding-utils'
import {
  BUTTON_SHAPES,
  BUTTON_SIZES,
  BUTTON_WIDTHS,
  PAYMENT_DESIGNS,
  SUMMARY_DESIGNS,
  TOTAL_TONES,
  VOUCHER_DESIGNS,
  type SummaryDesign,
} from '@/lib/page-designer/checkout-block-options'
import {
  CheckoutCTA,
  MinimumOrderNotice,
  OrderSummaryLines,
  type OrderSummaryVariant,
} from '@/components/customer/checkout-templates/checkout-primitives'
import { GovClaimField } from '@/components/customer/checkout-templates/gov-claim-field'
import { PaymentChoices } from '@/components/customer/checkout-templates/payment-choices'

import { BlockCard } from './block-card'
import { blockChoice, cornersOf } from './block-looks'
import { BlockColors, blockCheckout } from './block-theme'
import { cardOf, subtitleOf, type CheckoutBlockViewProps } from './block-views-details'
import { VoucherBlockField } from './voucher-block-field'

const SUMMARY_SKIN: Record<SummaryDesign, OrderSummaryVariant> = { standard: 'default', receipt: 'receipt', compact: 'compact' }

export function SummaryView({ checkout, block }: CheckoutBlockViewProps) {
  const themed = blockCheckout(checkout, block)
  return (
    <BlockColors checkout={checkout} themed={themed}>
      <BlockCard scope="checkout/summary" isCard={cardOf(block)} corners={cornersOf(block)} title={block.text('title')} subtitle={subtitleOf(block)}>
        {/* Voucher and Senior/PWD are blocks of their own on a designed page;
            their discount rows stay here, so the total always adds up. */}
        <OrderSummaryLines
          checkout={themed}
          variant={SUMMARY_SKIN[blockChoice(block, 'variant', SUMMARY_DESIGNS)]}
          totalTone={blockChoice(block, 'total_color', TOTAL_TONES)}
          showItems={block.option('show_items') !== false}
          showVoucher={false}
          showGovClaim={false}
          labels={{
            subtotal: block.text('subtotal'),
            deliveryFee: block.text('delivery_fee'),
            serviceCharge: block.text('service_charge'),
            discount: block.text('discount'),
            total: block.text('total'),
          }}
        />
      </BlockCard>
    </BlockColors>
  )
}

export function VoucherView({ checkout, block }: CheckoutBlockViewProps) {
  const themed = blockCheckout(checkout, block)
  return (
    <BlockColors checkout={checkout} themed={themed}>
      <BlockCard isCard={cardOf(block)} corners={cornersOf(block)}>
        <VoucherBlockField checkout={themed} label={block.text('label')} design={blockChoice(block, 'variant', VOUCHER_DESIGNS)} />
      </BlockCard>
    </BlockColors>
  )
}

export function GovDiscountView({ checkout, block }: CheckoutBlockViewProps) {
  // No Senior/PWD set up: nothing to claim and no note to show.
  if (!checkout.govSetup || checkout.govSetup.kinds.length === 0) return null
  const themed = blockCheckout(checkout, block)
  const { accent } = getCheckoutPalette(themed.tenant, themed.branding)
  return (
    <BlockColors checkout={checkout} themed={themed}>
      <BlockCard isCard={cardOf(block)} corners={cornersOf(block)}>
        <GovClaimField state={themed} formatPrice={formatPrice} accent={accent} />
      </BlockCard>
    </BlockColors>
  )
}

export function PaymentView({ checkout, block }: CheckoutBlockViewProps) {
  // Same rule as the standard designs: the picker (or its "none yet" note)
  // shows once there are methods or an order type is chosen.
  if (checkout.paymentMethods.length === 0 && !(checkout.orderType && checkout.tenant)) return null
  const themed = blockCheckout(checkout, block)
  return (
    <BlockColors checkout={checkout} themed={themed}>
      <BlockCard isCard={cardOf(block)} title={block.text('title')} subtitle={subtitleOf(block)}>
        <PaymentChoices checkout={themed} look={{ design: blockChoice(block, 'variant', PAYMENT_DESIGNS), corners: cornersOf(block) }} />
      </BlockCard>
    </BlockColors>
  )
}

export function PlaceOrderView({ checkout, block }: CheckoutBlockViewProps) {
  const footer = block.text('footer')
  const themed = blockCheckout(checkout, block)
  const look = {
    shape: blockChoice(block, 'variant', BUTTON_SHAPES),
    size: blockChoice(block, 'size', BUTTON_SIZES),
    width: blockChoice(block, 'width', BUTTON_WIDTHS),
  }
  const cta = (
    <>
      <MinimumOrderNotice checkout={themed} className="mb-3 text-center" />
      <CheckoutCTA
        checkout={themed}
        showTotal={block.option('show_total') !== false}
        processingLabel={block.text('processing')}
        look={look}
      />
    </>
  )
  return (
    <BlockColors checkout={checkout} themed={themed}>
      <BlockCard isCard={cardOf(block)}>
        {/* A button that fits its words sits in the middle. */}
        {look.width === 'auto' ? <div className="flex flex-col items-center">{cta}</div> : cta}
        {footer && <p className="mt-3 text-center text-sm text-[color:var(--co-muted)]">{footer}</p>}
      </BlockCard>
    </BlockColors>
  )
}
