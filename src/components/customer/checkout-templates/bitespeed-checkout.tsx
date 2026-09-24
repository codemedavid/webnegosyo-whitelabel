'use client'

/**
 * BiteSpeed checkout design — a one-page fast-food checkout, and the checkout of
 * the BiteSpeed storefront pack (selectable by any tenant on its own).
 *
 * One centered column: Your Order → how you want it → your details → payment →
 * summary, with a sticky bottom bar holding the total and the place-order
 * button. Cards are white with a soft shadow and the pack's radius; headings use
 * the pack's display font; colors are the `--bs-*` tokens derived from the
 * tenant's branding.
 *
 * Pure presentation: every value and handler comes from useCheckout(), and the
 * tricky pieces (fields, fulfillment, scheduling, payment methods, vouchers,
 * totals) are the same shared primitives the other designs compose, under the
 * same conditions as Express. The confirmation screen, branch picker and the
 * payment-details / QR dialogs (proof upload, reference number) are rendered by
 * the page shell. PaymentMethodList + AdvanceOrderScheduler stay mounted in the
 * normal flow so the hook's scroll-to-error anchors work.
 */

import { isCheckoutCartEmpty } from '@/lib/cart-utils'
import { MapPin, Receipt, ShoppingBag, UtensilsCrossed, Wallet } from 'lucide-react'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'
import { bitespeedRootStyle } from '@/storefront/packs/bitespeed/tokens'
import { BiteSpeedFonts } from '@/storefront/packs/bitespeed/fonts'
import {
  OrderTypeSelector,
  AdvanceOrderScheduler,
  CheckoutFields,
  OrderSummaryLines,
  PaymentMethodList,
} from './checkout-primitives'
import {
  AddMoreLink,
  BiteSpeedHeader,
  BiteSpeedSection,
  EmptyOrder,
  OrderLines,
  PlaceOrderBar,
} from './bitespeed-checkout-parts'

function OrderSection({ checkout }: { checkout: UseCheckoutReturn }) {
  const { items, bundleItems, tenantSlug } = checkout
  const hasItems = !isCheckoutCartEmpty(items, bundleItems)
  return (
    <BiteSpeedSection
      title="Your Order"
      icon={ShoppingBag}
      action={hasItems ? <AddMoreLink tenantSlug={tenantSlug} /> : undefined}
    >
      {hasItems ? <OrderLines items={items} bundleItems={bundleItems} /> : <EmptyOrder tenantSlug={tenantSlug} />}
    </BiteSpeedSection>
  )
}

function FulfillmentSection({ checkout }: { checkout: UseCheckoutReturn }) {
  if (!checkout.shouldAskFulfillment) return null
  return (
    <BiteSpeedSection title="How do you want it?" icon={UtensilsCrossed}>
      <OrderTypeSelector checkout={checkout} compact />
      {checkout.advanceConfig.enabled && (
        <div className="mt-5 border-t border-[var(--bs-outline)] pt-5">
          <AdvanceOrderScheduler checkout={checkout} />
        </div>
      )}
    </BiteSpeedSection>
  )
}

function DetailsSection({ checkout }: { checkout: UseCheckoutReturn }) {
  const { orderType, formFields, selectedOrderTypeData } = checkout
  if (!orderType || formFields.length === 0) return null
  const title = selectedOrderTypeData?.type === 'delivery' ? 'Delivery Details' : 'Your Details'
  return (
    <BiteSpeedSection title={title} icon={MapPin}>
      <CheckoutFields checkout={checkout} columns={1} />
    </BiteSpeedSection>
  )
}

/** Everything after the order lines — only meaningful once there is an order. */
function CheckoutBody({ checkout }: { checkout: UseCheckoutReturn }) {
  return (
    <>
      <FulfillmentSection checkout={checkout} />
      <DetailsSection checkout={checkout} />

      {/* Always mounted: the hook scrolls here when no method is chosen. */}
      <BiteSpeedSection title="Payment" icon={Wallet}>
        <PaymentMethodList checkout={checkout} />
      </BiteSpeedSection>

      {/* The lines are already listed under "Your Order". */}
      <BiteSpeedSection title="Summary" icon={Receipt}>
        <OrderSummaryLines checkout={checkout} showItems={false} />
      </BiteSpeedSection>

      <p className="px-1 text-center text-xs text-[var(--bs-text-muted)]">
        Your order is sent to the restaurant for confirmation.
      </p>
    </>
  )
}

export function BiteSpeedCheckout({ checkout }: { checkout: UseCheckoutReturn }) {
  const { tenant, tenantSlug, branding, items, bundleItems } = checkout

  if (!tenant) return null

  const hasItems = !isCheckoutCartEmpty(items, bundleItems)

  return (
    <div className="min-h-screen" style={bitespeedRootStyle(branding)}>
      <BiteSpeedFonts />
      <BiteSpeedHeader tenantSlug={tenantSlug} storeName={tenant.name} />
      <h1 className="sr-only">{`${tenant.name} checkout`}</h1>

      {/* Extra bottom padding so the place-order bar never covers the summary. */}
      <main className={`mx-auto max-w-[640px] space-y-5 px-4 pt-5 ${hasItems ? 'pb-40' : 'pb-10'}`}>
        <OrderSection checkout={checkout} />
        {hasItems && <CheckoutBody checkout={checkout} />}
      </main>

      {hasItems && <PlaceOrderBar checkout={checkout} />}
    </div>
  )
}
