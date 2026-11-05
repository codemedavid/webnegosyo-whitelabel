'use client'

import { useMemo, useRef } from 'react'

import { formatPrice } from '@/lib/cart-utils'
import type { HeroDesignV5 } from '@/lib/hero-builder/types'
import { preparePageDesign } from '@/lib/page-designer/rules'
import type { PageNeeds } from '@/lib/page-designer/types'
import { readStorefrontLabels } from '@/lib/storefront-labels'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'
import type { PageRuntime } from '@/components/hero-builder/renderer/page-runtime'
import { DesignedPage } from '@/components/page-designer/storefront/designed-page'

import { CHECKOUT_BUILDER_BRIDGE } from './checkout-builder-theme'
import { CheckoutBlocksProvider } from './checkout-blocks-context'
import { CHECKOUT_LIVE_BLOCKS } from './checkout-live-blocks'
import { checkoutStepProblem } from './checkout-step-problem'

interface DesignedCheckoutProps {
  /** Already prepared for checkout (resolvePageDesign): every required block is in it. */
  design: HeroDesignV5
  checkout: UseCheckoutReturn
}

/**
 * The owner's published checkout design. Rendered by the checkout shell in
 * place of the standard design, inside the same `--co-*` theme root, labels
 * provider and dialogs; the blocks present `checkout` and never submit on
 * their own — only the place-order block's button, through the hook.
 */
export function DesignedCheckout({ design, checkout }: DesignedCheckoutProps) {
  const { tenant, tenantSlug, grandTotal } = checkout
  const labels = useMemo(() => readStorefrontLabels(tenant as unknown as Record<string, unknown> | null), [tenant])
  const storeName = tenant?.name ?? 'this store'
  const total = formatPrice(grandTotal)
  // Steps ask at tap time, so they read the latest checkout without re-creating the runtime.
  const latest = useRef(checkout)
  latest.current = checkout
  const runtime = useMemo<PageRuntime>(
    () => ({
      page: 'checkout',
      state: null,
      tokens: { store: storeName, total },
      labels,
      blocks: CHECKOUT_LIVE_BLOCKS,
      stepProblem: (blockIds) => {
        const problem = checkoutStepProblem(latest.current, blockIds)
        // A step with the questions on it shows each mistake beside its box too.
        if (problem && blockIds.includes('checkout.customer')) latest.current.revealFieldErrors?.()
        return problem
      },
    }),
    [storeName, total, labels],
  )
  const blocks = useMemo(() => ({ checkout }), [checkout])
  // Blocks the owner removed come back when this store's order can't go through without them.
  const { order_choice, scheduling, questions, payment, gov_claims } = checkoutNeeds(checkout)
  const shown = useMemo(
    () => preparePageDesign(design, 'checkout', { order_choice, scheduling, questions, payment, gov_claims }),
    [design, order_choice, scheduling, questions, payment, gov_claims],
  )

  return (
    <div className="min-h-screen bg-[var(--co-bg)] text-[color:var(--co-text)]" style={CHECKOUT_BUILDER_BRIDGE}>
      <CheckoutBlocksProvider value={blocks}>
        <DesignedPage design={shown} runtime={runtime} tenantSlug={tenantSlug} />
      </CheckoutBlocksProvider>
    </div>
  )
}

/** What this store needs on its checkout right now (see PageNeed). */
export function checkoutNeeds(
  checkout: Pick<UseCheckoutReturn, 'shouldAskFulfillment' | 'advanceConfig' | 'formFields' | 'paymentMethods' | 'tenant' | 'govSetup'>,
): PageNeeds {
  return {
    order_choice: checkout.shouldAskFulfillment,
    scheduling: checkout.advanceConfig.enabled,
    questions: checkout.formFields.some((field) => field.is_required),
    payment: checkout.paymentMethods.length > 0 && !checkout.tenant?.qr_handoff_enabled,
    gov_claims: !!checkout.govSetup && checkout.govSetup.kinds.length > 0,
  }
}
