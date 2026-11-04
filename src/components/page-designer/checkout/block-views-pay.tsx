'use client'

/**
 * The checkout's money blocks — summary, voucher, Senior/PWD, payment and the
 * place-order button — as pure views over a useCheckout() value. The ONLY
 * way a designed checkout submits is the place-order block's CheckoutCTA,
 * which calls the hook's handleProceedToPayment exactly as every standard
 * design does.
 */

import { formatPrice } from '@/lib/cart-utils'
import { getCheckoutPalette } from '@/lib/branding-utils'
import {
  CheckoutCTA,
  MinimumOrderNotice,
  OrderSummaryLines,
  PaymentMethodList,
} from '@/components/customer/checkout-templates/checkout-primitives'
import { GovClaimField } from '@/components/customer/checkout-templates/gov-claim-field'
import { VoucherField } from '@/components/customer/checkout-templates/voucher-field'

import { BlockCard } from './block-card'
import { cardOf, subtitleOf, type CheckoutBlockViewProps } from './block-views-details'

export function SummaryView({ checkout, block }: CheckoutBlockViewProps) {
  return (
    <BlockCard scope="checkout/summary" isCard={cardOf(block)} title={block.text('title')} subtitle={subtitleOf(block)}>
      {/* Voucher and Senior/PWD are blocks of their own on a designed page;
          their discount rows stay here, so the total always adds up. */}
      <OrderSummaryLines
        checkout={checkout}
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
  )
}

export function VoucherView({ checkout, block }: CheckoutBlockViewProps) {
  return (
    <BlockCard isCard={cardOf(block)}>
      <VoucherField
        codes={checkout.voucherCodes}
        preview={checkout.voucherPreview}
        isChecking={checkout.isCheckingVoucher}
        onApply={checkout.applyVoucherCode}
        onRemove={checkout.removeVoucherCode}
        formatPrice={formatPrice}
        lineNames={checkout.voucherLineNames}
        onChooseUnits={checkout.setVoucherUnitPicks}
        label={block.text('label')}
      />
    </BlockCard>
  )
}

export function GovDiscountView({ checkout, block }: CheckoutBlockViewProps) {
  // No Senior/PWD set up: nothing to claim and no note to show.
  if (!checkout.govSetup || checkout.govSetup.kinds.length === 0) return null
  const { accent } = getCheckoutPalette(checkout.tenant, checkout.branding)
  return (
    <BlockCard isCard={cardOf(block)}>
      <GovClaimField state={checkout} formatPrice={formatPrice} accent={accent} />
    </BlockCard>
  )
}

export function PaymentView({ checkout, block }: CheckoutBlockViewProps) {
  // Same rule as the standard designs: the picker (or its "none yet" note)
  // shows once there are methods or an order type is chosen.
  if (checkout.paymentMethods.length === 0 && !(checkout.orderType && checkout.tenant)) return null
  return (
    <BlockCard isCard={cardOf(block)} title={block.text('title')} subtitle={subtitleOf(block)}>
      <PaymentMethodList checkout={checkout} />
    </BlockCard>
  )
}

export function PlaceOrderView({ checkout, block }: CheckoutBlockViewProps) {
  const footer = block.text('footer')
  return (
    <BlockCard isCard={cardOf(block)}>
      <MinimumOrderNotice checkout={checkout} className="mb-3 text-center" />
      <CheckoutCTA
        checkout={checkout}
        showTotal={block.option('show_total') !== false}
        processingLabel={block.text('processing')}
      />
      {footer && <p className="mt-3 text-center text-sm text-[color:var(--co-muted)]">{footer}</p>}
    </BlockCard>
  )
}
