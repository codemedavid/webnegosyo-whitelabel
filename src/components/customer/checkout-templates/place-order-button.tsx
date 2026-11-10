'use client'

/**
 * The place-order button and the unmet-minimum notice beside it, shared by
 * every checkout design (re-exported from checkout-primitives).
 */

import { CreditCard } from 'lucide-react'
import { formatPrice } from '@/lib/cart-utils'
import { getCheckoutPalette } from '@/lib/branding-utils'
import { resolvePlaceOrderLabel } from '@/lib/checkout/checkout-cta'
import { formatOrderMinimumMessage } from '@/lib/order-minimum'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'
import { CO, checkoutThemeStyle } from './checkout-theme'

/**
 * The unmet-minimum notice. Renders nothing when the cart clears its order type's
 * minimum, so designs can drop it in unconditionally beside the submit button.
 */
export function MinimumOrderNotice({
  checkout,
  className = '',
}: {
  checkout: UseCheckoutReturn
  className?: string
}) {
  const message = checkout.orderMinimum
    ? formatOrderMinimumMessage(checkout.orderMinimum, checkout.selectedOrderTypeData?.name)
    : null
  if (!message) return null

  return (
    <p
      data-part="error"
      className={`text-sm font-medium ${CO.error} ${className}`}
      style={checkoutThemeStyle(checkout)}
      role="alert"
    >
      {message}
    </p>
  )
}

/** Page Designer settings for the button; absent = the standard full-width pill. */
export interface PlaceOrderLook {
  shape: 'pill' | 'rounded' | 'square'
  size: 'regular' | 'large'
  width: 'full' | 'auto'
}

const SHAPE_CLASS: Record<PlaceOrderLook['shape'], string> = { pill: 'rounded-full', rounded: 'rounded-xl', square: 'rounded-none' }
const SIZE_CLASS: Record<PlaceOrderLook['size'], string> = { regular: 'h-14', large: 'h-16 text-lg' }
const WIDTH_CLASS: Record<PlaceOrderLook['width'], string> = { full: 'w-full', auto: 'w-auto max-w-full min-w-[14rem] px-8' }

function buttonFrame(look: PlaceOrderLook | undefined): string {
  if (!look) return 'w-full h-14 inline-flex items-center justify-center gap-3 font-semibold rounded-full'
  return `${WIDTH_CLASS[look.width]} ${SIZE_CLASS[look.size]} inline-flex items-center justify-center gap-3 font-semibold ${SHAPE_CLASS[look.shape]}`
}

interface CheckoutCTAProps {
  checkout: UseCheckoutReturn
  className?: string
  /** Off hides the "· ₱total" after the label (Page Designer). */
  showTotal?: boolean
  processingLabel?: string
  /** Shape, size and width (Page Designer only); the click and disabled rules never change. */
  look?: PlaceOrderLook
}

export function CheckoutCTA({ checkout, className = '', showTotal = true, processingLabel = 'Processing Order...', look }: CheckoutCTAProps) {
  const { paymentMethods, isProcessing, handleProceedToPayment, grandTotal, orderMinimum } = checkout
  const { accent, accentText, button } = getCheckoutPalette(checkout.tenant, checkout.branding)
  const ctaLabel = resolvePlaceOrderLabel(checkout)

  return (
    <button
      data-branding-scope="checkout/place-order"
      data-part="button"
      data-place-order
      type="button"
      onClick={handleProceedToPayment}
      disabled={isProcessing || orderMinimum?.meets === false}
      className={`${buttonFrame(look)} disabled:opacity-50 disabled:cursor-not-allowed transition-opacity ${className}`}
      style={{ backgroundColor: button ?? accent, color: accentText }}
    >
      {isProcessing ? (
        <>
          <div className="h-5 w-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          {processingLabel}
        </>
      ) : paymentMethods.length > 0 ? (
        <>
          <CreditCard className="h-5 w-5" />
          <span>{ctaLabel}{showTotal && ` · ${formatPrice(grandTotal)}`}</span>
        </>
      ) : (
        <span>{ctaLabel}{showTotal && ` · ${formatPrice(grandTotal)}`}</span>
      )}
    </button>
  )
}
