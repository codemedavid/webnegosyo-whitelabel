'use client'

/**
 * Shared, design-agnostic checkout views.
 *
 * These pieces are intentionally NOT templated: the success/confirmation
 * screen and the payment/QR dialogs are transient, logic-heavy, and identical
 * across every design. The page shell renders them for ALL checkout designs,
 * so each design only re-skins the pre-submit form experience.
 *
 * Markup is preserved verbatim from the original checkout page to guarantee
 * the experience is unchanged.
 */

import { StoreLabel } from '@/components/customer/storefront-labels-provider'
import { addonPriceList } from '@/lib/addon-quantity'
import { ArrowLeft, QrCode, Copy, CheckCircle2, ExternalLink, Package, CalendarClock, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { formatPrice } from '@/lib/cart-utils'
import { computeOrderTotals } from '@/lib/order-totals'
import { isOrderSaveFailed, type OrderSaveNotice } from '@/lib/checkout/order-save-outcome'
import { toast } from 'sonner'
import { kioskReturnPath } from '@/lib/kiosk/kiosk-mode'
import { buildOrderTrackingPath } from '@/lib/checkout/tracking-redirect'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'
import { TenantFlashLoading } from '@/components/customer/flash-screen-loader'
import { checkoutThemeStyle } from './checkout-theme'

/** Rules on the confirmation screen use the checkout border colour. */
const RULE_COLOR = 'bg-[var(--co-border)]'

/**
 * Full-screen loading state (shared across designs).
 *
 * Reuses the tenant's branded flash splash (via TenantFlashLoading, fed by the
 * [tenant] layout's TenantFlashProvider) so the client-side checkout load matches
 * the route-level loading.tsx and the menu. Tenants without the flash feature see
 * a neutral spinner in the app theme (no tenant is known yet, so there is no
 * checkout palette to draw from). Kept propless so it also works
 * as the next/dynamic() `loading` fallback for the lazy design chunks.
 */
export function CheckoutLoading() {
  return <TenantFlashLoading fallback={<CheckoutSpinner />} />
}

function CheckoutSpinner() {
  return (
    <div className="min-h-screen bg-background text-[color:var(--co-muted)] flex items-center justify-center">
      <div className="text-center">
        <div className="h-16 w-16 border-4 border-current border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-[color:var(--co-muted)]">Loading checkout...</p>
      </div>
    </div>
  )
}

/** Restaurant-not-found state (shared across designs). */
export function CheckoutNotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <p className="text-[color:var(--co-muted)]">Restaurant not found</p>
      </div>
    </div>
  )
}

/**
 * Shown when every attempt to save the order failed.
 *
 * The confirmation screen is optimistic: "Order Placed!" and the cleared cart
 * both land before the row is written, so a refused save leaves the customer
 * looking at a green success screen for an order the merchant will never see.
 * This notice used to live inside the Messenger-redirect block, which meant the
 * kiosk screen, a tenant with Messenger off, and a tenant with no page
 * connected all reported success for a lost order. It renders for every design
 * and every configuration now, directly under the hero.
 *
 * The recovery it names has to be one the customer can actually perform: the
 * Messenger message when there is one (it is the merchant's remaining copy of
 * the order), and contacting the store directly when there is not.
 *
 * A REFUSAL is a different event and gets different words. The store said no on
 * purpose — below the minimum, sold out, an address with no coordinates — and
 * `notice.message` is the sentence it wrote for the customer, naming what to
 * change. Nothing is lost, so there is nothing for Messenger to rescue: telling
 * this customer to send the message would deliver the merchant an order the
 * platform just rejected.
 */
function OrderSaveFailedNotice({
  notice,
  hasMessengerFallback,
}: {
  notice: OrderSaveNotice | null
  hasMessengerFallback: boolean
}) {
  // A caller that has not been given a notice yet (an older design, a path
  // that only flipped the boolean) still gets the wording it had before.
  const headline = notice?.message ?? 'We could not confirm your order with the store.'
  const canSendMessenger = (notice?.isMessengerRecoverable ?? true) && hasMessengerFallback

  const recovery = notice?.verdict === 'refused'
    ? 'Nothing has been sent to the store. Please adjust your order and try again.'
    : canSendMessenger
      ? 'Please send the Messenger message below so they receive it.'
      : 'Nothing has been sent yet — please contact the store directly to place this order.'

  return (
    <div
      role="alert"
      className="rounded-2xl border border-[color:var(--co-warning-border)] bg-[var(--co-warning-soft)] p-4 text-left"
    >
      <p className="text-sm font-semibold text-[color:var(--co-text)]">{headline}</p>
      <p className="mt-1 text-sm text-[color:var(--co-muted)]">{recovery}</p>
    </div>
  )
}

const COPIED_TO_MESSENGER = 'Order message copied! Paste it in Messenger.'

/** Copy the order message, telling the customer whether it worked. */
async function copyOrderMessage(message: string, successText: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(message)
    toast.success(successText)
  } catch {
    toast.error('Failed to copy message')
  }
}

/** Order confirmation / thank-you screen (shared across designs). */
export function CheckoutConfirmation({ checkout }: { checkout: UseCheckoutReturn }) {
  const {
    tenant, completedOrderData, redirectCountdown, trackingOrderId, trackingToken,
    messageExpanded, setMessageExpanded, router, tenantSlug, messengerEnabled,
    isKiosk, kioskCountdown, orderSaveFailed, orderSaveNotice,
  } = checkout

  if (!tenant || !completedOrderData) return null

  // One source of truth for "this screen is lying". `orderSaveNotice` carries
  // the detail; the boolean is kept because designs and tests predate it, and
  // the two must never be able to disagree about whether to warn at all.
  const hasOrderSaveFailed = isOrderSaveFailed({ orderSaveFailed, orderSaveNotice })

  // The Messenger message is only a recovery when there is somewhere to send
  // it: the tenant has Messenger on AND a page resolved to redirect to.
  const hasMessengerFallback = Boolean(messengerEnabled && completedOrderData.messengerUrl)

  return (
    <div className="min-h-screen bg-[var(--co-bg)] text-[color:var(--co-text)]" style={checkoutThemeStyle(checkout)}>
      <main className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-2xl space-y-6">

          {/* Hero. A failed save must not be crowned with a green checkmark —
              the headline is the loudest thing on this screen, and leaving it
              intact reads as a minor hiccup rather than a lost sale. */}
          <div className="text-center py-8">
            <div
              className={`inline-flex items-center justify-center w-24 h-24 rounded-full mb-5 ${
                hasOrderSaveFailed ? 'bg-[var(--co-warning-soft)]' : 'bg-[var(--co-success-soft)]'
              }`}
            >
              {hasOrderSaveFailed ? (
                <AlertTriangle className="h-14 w-14 text-[color:var(--co-warning)]" />
              ) : (
                <CheckCircle2 className="h-14 w-14 text-[color:var(--co-success)] animate-[scale-in_0.4s_ease-out]" />
              )}
            </div>
            <h1 className="text-3xl font-bold text-[color:var(--co-text)] mb-2">
              {hasOrderSaveFailed ? 'Order Not Confirmed' : <StoreLabel name="confirmation.title" fallback="Order Placed!" />}
            </h1>
            <p className="text-[color:var(--co-muted)] text-lg">
              {hasOrderSaveFailed
                ? `We could not reach ${tenant.name} with this order.`
                : `Your order has been sent to ${tenant.name}`}
            </p>
          </div>

          {hasOrderSaveFailed && (
            <OrderSaveFailedNotice notice={orderSaveNotice ?? null} hasMessengerFallback={hasMessengerFallback} />
          )}

          {/* Order Summary */}
          <div data-branding-scope="checkout/card" className="rounded-2xl bg-[var(--co-card)] p-6 shadow-sm border border-[color:var(--co-border)]">
            <h2 className="text-lg font-bold text-[color:var(--co-text)] mb-1"><StoreLabel name="checkout.summary" fallback="Order Summary" /></h2>
            {completedOrderData.orderTypeName && (
              <p className={`text-sm text-[color:var(--co-muted)] ${completedOrderData.scheduledForLabel ? 'mb-2' : 'mb-4'}`}>{completedOrderData.orderTypeName}</p>
            )}
            {completedOrderData.scheduledForLabel && (
              <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-[var(--co-accent-soft)] border border-[color:var(--co-accent-border)] px-3 py-1 text-sm font-medium text-[color:var(--co-accent)]">
                <CalendarClock className="h-3.5 w-3.5" />
                Scheduled for {completedOrderData.scheduledForLabel}
              </div>
            )}

            <div className="space-y-3">
              {completedOrderData.items.map((item, index) => (
                <div key={item.id}>
                  {index > 0 && <Separator className={`my-3 ${RULE_COLOR}`} />}
                  <div className="flex justify-between">
                    <div className="flex-1 mr-4">
                      <span className="font-medium text-sm">{item.menu_item.name}</span>
                      {item.selected_variation && (
                        <span className="text-xs text-[color:var(--co-muted)]"> ({item.selected_variation.name})</span>
                      )}
                      {item.selected_variations && Object.keys(item.selected_variations).length > 0 && (
                        <span className="text-xs text-[color:var(--co-muted)]">
                          {' '}({Object.values(item.selected_variations).map(opt => opt.name).join(', ')})
                        </span>
                      )}
                      <span className="text-xs text-[color:var(--co-muted)]"> x{item.quantity}</span>
                      {item.selected_addons.length > 0 && (
                        <p className="text-xs text-[color:var(--co-muted)] mt-0.5">
                          Add-ons: {addonPriceList(item.selected_addons, formatPrice)}
                        </p>
                      )}
                      {item.special_instructions && (
                        <p className="text-xs italic text-[color:var(--co-muted)] mt-0.5">
                          Note: {item.special_instructions}
                        </p>
                      )}
                    </div>
                    <span className="font-semibold text-sm flex-shrink-0">{formatPrice(item.subtotal)}</span>
                  </div>
                </div>
              ))}

              <Separator className={`my-3 ${RULE_COLOR}`} />

              <div className="flex justify-between text-sm">
                <span className="text-[color:var(--co-muted)]">Subtotal</span>
                <span className="font-medium">{formatPrice(completedOrderData.total)}</span>
              </div>

              {completedOrderData.deliveryFee !== null && completedOrderData.deliveryFee > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-[color:var(--co-muted)]">Delivery Fee</span>
                  <span className="font-medium">{formatPrice(completedOrderData.deliveryFee)}</span>
                </div>
              )}

              {completedOrderData.serviceChargeAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-[color:var(--co-muted)]">Service Charge</span>
                  <span className="font-medium">{formatPrice(completedOrderData.serviceChargeAmount)}</span>
                </div>
              )}

              {/* Every deduction the customer actually received, named. The
                  total below is derived from the same lines, so the two can
                  never disagree about what a voucher was worth. */}
              {(completedOrderData.discounts ?? []).map(discount => (
                <div key={discount.code ?? discount.label} className="flex justify-between text-sm">
                  <span className="text-[color:var(--co-muted)]">{discount.label}</span>
                  <span className="font-medium text-[color:var(--co-success)]">-{formatPrice(discount.amount)}</span>
                </div>
              ))}

              <Separator className={`my-2 ${RULE_COLOR}`} />

              <div className="flex justify-between text-lg font-bold">
                <span>Total</span>
                <span className="text-[color:var(--co-accent)]">
                  {formatPrice(computeOrderTotals({
                    subtotal: completedOrderData.total,
                    deliveryFee: completedOrderData.deliveryFee,
                    serviceCharge: completedOrderData.serviceChargeAmount,
                    discounts: completedOrderData.discounts,
                  }).grandTotal)}
                </span>
              </div>
            </div>
          </div>

          {/* Customer Information */}
          {completedOrderData.formFields.length > 0 && (
            <div data-branding-scope="checkout/card" className="rounded-2xl bg-[var(--co-card)] p-6 shadow-sm border border-[color:var(--co-border)]">
              <h2 className="text-lg font-bold text-[color:var(--co-text)] mb-4"><StoreLabel name="checkout.customer" fallback="Customer Information" /></h2>
              <div className="space-y-2">
                {completedOrderData.formFields.map(field => {
                  const value = completedOrderData.customerData[field.field_name]
                  if (!value) return null
                  return (
                    <div key={field.field_name} className="flex justify-between text-sm">
                      <span className="text-[color:var(--co-muted)]">{field.field_label}</span>
                      <span className="font-medium text-right ml-4 max-w-[60%] break-words">{value}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Payment Method */}
          {completedOrderData.paymentMethodName && (
            <div data-branding-scope="checkout/card" className="rounded-2xl bg-[var(--co-card)] p-6 shadow-sm border border-[color:var(--co-border)]">
              <h2 className="text-lg font-bold text-[color:var(--co-text)] mb-2"><StoreLabel name="checkout.payment" fallback="Payment Method" /></h2>
              <p className="font-medium text-[color:var(--co-text)]">{completedOrderData.paymentMethodName}</p>
              {completedOrderData.paymentMethodDetails && (
                <p className="text-sm text-[color:var(--co-muted)] mt-1">{completedOrderData.paymentMethodDetails}</p>
              )}
            </div>
          )}

          {/* Kiosk: say what is about to happen, and offer a way to skip the wait. */}
          {isKiosk ? (
            <div data-branding-scope="checkout/card" className="rounded-2xl bg-[var(--co-card)] p-6 shadow-sm border border-[color:var(--co-border)]">
              <div className="space-y-4 text-center">
                <p className="text-sm font-medium text-[color:var(--co-text)]">
                  {hasOrderSaveFailed
                    ? `This order did not reach ${tenant.name}. Please tell a staff member.`
                    : `Your order has been sent to ${tenant.name}.`}
                </p>
                <div className="flex items-center justify-center gap-2">
                  <div className="inline-flex items-center justify-center w-8 h-8 border-2 border-[color:var(--co-accent)] border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-[color:var(--co-muted)]" aria-live="polite">
                    Returning to the menu
                    {kioskCountdown !== null && kioskCountdown > 0 && (
                      <> in <span className="font-bold text-[color:var(--co-accent)]">{kioskCountdown}s</span></>
                    )}
                    ...
                  </p>
                </div>
                <Button
                  size="lg"
                  className="w-full h-12 bg-[var(--co-button)] hover:bg-[var(--co-button)] hover:opacity-90 text-[color:var(--co-accent-text)] font-semibold rounded-full"
                  onClick={() => router.push(kioskReturnPath(tenantSlug))}
                >
                  <ArrowLeft className="mr-2 h-5 w-5" />
                  Start a New Order
                </Button>
              </div>
            </div>
          ) : (
          <>
          {/* Messenger Redirect Section — skipped when the order type has Messenger turned off */}
          <div data-branding-scope="checkout/card" className="rounded-2xl bg-[var(--co-card)] p-6 shadow-sm border border-[color:var(--co-border)]">
            {!messengerEnabled ? (
              <div className="space-y-2 text-center">
                {hasOrderSaveFailed ? (
                  <p className="text-sm font-medium text-[color:var(--co-text)]">
                    This order did not reach {tenant.name}. Please contact them directly.
                  </p>
                ) : (
                  <>
                    <p className="text-sm font-medium text-[color:var(--co-text)]">Your order has been sent to {tenant.name}.</p>
                    <p className="text-sm text-[color:var(--co-muted)]">They&apos;ll confirm it shortly — no further action needed.</p>
                  </>
                )}
              </div>
            ) : completedOrderData.messengerUrl ? (
              <div className="space-y-4">
                {/* Countdown redirect indicator */}
                <div className="text-center space-y-2">
                  {redirectCountdown !== null && redirectCountdown > 0 ? (
                    <>
                      <div className="inline-flex items-center justify-center w-10 h-10 border-2 border-[color:var(--co-accent)] border-t-transparent rounded-full animate-spin mx-auto" />
                      <p className="text-sm text-[color:var(--co-muted)]">
                        Redirecting to Messenger in <span className="font-bold text-[color:var(--co-accent)]">{redirectCountdown}s</span>...
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-[color:var(--co-muted)]">
                      Messenger should have opened in a new tab.
                    </p>
                  )}
                </div>

                {/* Go to Messenger button */}
                <Button
                  size="lg"
                  className="w-full h-12 bg-[var(--co-button)] hover:bg-[var(--co-button)] hover:opacity-90 text-[color:var(--co-accent-text)] font-semibold rounded-full"
                  onClick={() => window.open(completedOrderData.messengerUrl, '_blank', 'noopener,noreferrer')}
                >
                  <ExternalLink className="mr-2 h-5 w-5" />
                  Go to Messenger
                </Button>

                {/* Copy fallback */}
                <div className="relative text-center">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-[color:var(--co-border)]" />
                  </div>
                  <span className="relative bg-[var(--co-card)] px-3 text-xs text-[color:var(--co-muted)]">or</span>
                </div>

                <button
                  className="w-full text-sm text-[color:var(--co-accent)] hover:underline py-1"
                  onClick={() => copyOrderMessage(completedOrderData.messengerMessage, COPIED_TO_MESSENGER)}
                >
                  <Copy className="inline mr-1.5 h-3.5 w-3.5" />
                  Copy order text and paste it directly on Messenger
                </button>
              </div>
            ) : (
              <div className="space-y-3 text-center">
                <p className="text-sm text-[color:var(--co-muted)]">
                  Copy the order message and send it to the restaurant.
                </p>
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full h-12 rounded-full border-[color:var(--co-accent-border)] bg-transparent text-[color:var(--co-accent)] hover:bg-[var(--co-accent-softer)] hover:text-[color:var(--co-accent)]"
                  onClick={() => copyOrderMessage(completedOrderData.messengerMessage, COPIED_TO_MESSENGER)}
                >
                  <Copy className="mr-2 h-5 w-5" />
                  Copy Order Message
                </Button>
              </div>
            )}
          </div>

          {/* Order Message Box (collapsible) */}
          <div data-branding-scope="checkout/card" className="rounded-2xl bg-[var(--co-card)] shadow-sm border border-[color:var(--co-border)] overflow-hidden">
            <button
              onClick={() => setMessageExpanded(!messageExpanded)}
              aria-expanded={messageExpanded}
              className="w-full flex items-center justify-between p-6 text-left hover:bg-[var(--co-subtle)] transition-colors"
            >
              <h2 className="text-lg font-bold text-[color:var(--co-text)]">Order Message</h2>
              <span className="text-sm text-[color:var(--co-muted)]">{messageExpanded ? 'Hide' : 'Show'}</span>
            </button>

            {messageExpanded && (
              <div className="px-6 pb-6 space-y-3">
                <div className="bg-[var(--co-subtle)] rounded-xl p-4 max-h-64 overflow-y-auto">
                  <pre className="text-sm text-[color:var(--co-text)] whitespace-pre-wrap font-sans leading-relaxed">
                    {completedOrderData.messengerMessage}
                  </pre>
                </div>

                <Button
                  size="lg"
                  variant="outline"
                  className="w-full h-12 rounded-full border-[color:var(--co-accent-border)] bg-transparent text-[color:var(--co-accent)] hover:bg-[var(--co-accent-softer)] hover:text-[color:var(--co-accent)]"
                  onClick={() => copyOrderMessage(completedOrderData.messengerMessage, 'Order message copied to clipboard!')}
                >
                  <Copy className="mr-2 h-5 w-5" />
                  Copy Order Message
                </Button>

                <p className="text-xs text-[color:var(--co-muted)] text-center">
                  {messengerEnabled ? 'Paste this in Messenger or any chat app' : 'A copy of your order for your records'}
                </p>
              </div>
            )}
          </div>

          {/* Track Order + Back to Menu */}
          <div className="pb-8 space-y-3">
            {trackingOrderId && trackingToken && (
              <Button
                size="lg"
                className="w-full h-12 bg-[var(--co-button)] hover:bg-[var(--co-button)] hover:opacity-90 text-[color:var(--co-accent-text)] font-semibold rounded-full"
                onClick={() => router.push(buildOrderTrackingPath(tenantSlug, trackingOrderId, trackingToken))}
              >
                <Package className="mr-2 h-5 w-5" />
                Track Your Order
              </Button>
            )}
            <Button
              size="lg"
              variant="ghost"
              className="w-full h-12 rounded-full text-[color:var(--co-muted)] hover:bg-[var(--co-subtle)] hover:text-[color:var(--co-text)]"
              onClick={() => router.push(`/${tenantSlug}/menu`)}
            >
              <ArrowLeft className="mr-2 h-5 w-5" />
              Back to Menu
            </Button>
          </div>
          </>
          )}

        </div>
      </main>
    </div>
  )
}

/**
 * Payment-details sheet shown after "Proceed to Payment". Lives in its own
 * module; re-exported here so the page shell's import path is unchanged.
 */
export { PaymentDetailsDialog } from './payment-details-dialog'

/** Full-size payment QR dialog (shared across designs). */
export function QrCodeDialog({ checkout }: { checkout: UseCheckoutReturn }) {
  const { qrDialogOpen, selectedQrCode, setQrDialogOpen } = checkout
  const themeStyle = checkoutThemeStyle(checkout)

  if (!qrDialogOpen || !selectedQrCode) return null

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"
      style={themeStyle}
      onClick={() => setQrDialogOpen(false)}
    >
      <div
        className="bg-[var(--co-card)] rounded-lg p-6 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold text-[color:var(--co-text)]">Payment QR Code</h3>
          <button
            onClick={() => setQrDialogOpen(false)}
            className="text-[color:var(--co-muted)] hover:text-[color:var(--co-text)]"
          >
            <span className="sr-only">Close</span>
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={selectedQrCode}
          alt="Payment QR Code"
          className="w-full h-auto object-contain rounded bg-white"
        />
        <p className="text-sm text-[color:var(--co-muted)] text-center mt-4">
          Scan this QR code with your payment app
        </p>
      </div>
    </div>
  )
}

// QrCode icon re-used by design payment selectors that render a QR thumbnail.
export { QrCode }
