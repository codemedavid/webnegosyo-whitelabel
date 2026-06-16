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

import { ArrowLeft, MessageCircle, CreditCard, QrCode, Copy, Check, CheckCircle2, ExternalLink, Package, CalendarClock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { formatPrice } from '@/lib/cart-utils'
import { toast } from 'sonner'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'

/** Full-screen loading state (shared across designs). */
export function CheckoutLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50/30 to-orange-100/20 flex items-center justify-center">
      <div className="text-center">
        <div className="h-16 w-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-gray-600">Loading checkout...</p>
      </div>
    </div>
  )
}

/** Restaurant-not-found state (shared across designs). */
export function CheckoutNotFound() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50/30 to-orange-100/20 flex items-center justify-center">
      <div className="text-center">
        <p className="text-gray-600">Restaurant not found</p>
      </div>
    </div>
  )
}

/** Order confirmation / thank-you screen (shared across designs). */
export function CheckoutConfirmation({ checkout }: { checkout: UseCheckoutReturn }) {
  const {
    tenant, completedOrderData, redirectCountdown, trackingOrderId, trackingToken,
    messageExpanded, setMessageExpanded, router, tenantSlug,
  } = checkout

  if (!tenant || !completedOrderData) return null

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50/40 to-white">
      <main className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-2xl space-y-6">

          {/* Success Hero */}
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center w-24 h-24 bg-green-100 rounded-full mb-5">
              <CheckCircle2 className="h-14 w-14 text-green-600 animate-[scale-in_0.4s_ease-out]" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Order Placed!</h1>
            <p className="text-gray-500 text-lg">Your order has been sent to {tenant.name}</p>
          </div>

          {/* Order Summary */}
          <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Order Summary</h2>
            {completedOrderData.orderTypeName && (
              <p className={`text-sm text-gray-500 ${completedOrderData.scheduledForLabel ? 'mb-2' : 'mb-4'}`}>{completedOrderData.orderTypeName}</p>
            )}
            {completedOrderData.scheduledForLabel && (
              <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-orange-50 border border-orange-200 px-3 py-1 text-sm font-medium text-orange-700">
                <CalendarClock className="h-3.5 w-3.5" />
                Scheduled for {completedOrderData.scheduledForLabel}
              </div>
            )}

            <div className="space-y-3">
              {completedOrderData.items.map((item, index) => (
                <div key={item.id}>
                  {index > 0 && <Separator className="my-3" />}
                  <div className="flex justify-between">
                    <div className="flex-1 mr-4">
                      <span className="font-medium text-sm">{item.menu_item.name}</span>
                      {item.selected_variation && (
                        <span className="text-xs text-muted-foreground"> ({item.selected_variation.name})</span>
                      )}
                      {item.selected_variations && Object.keys(item.selected_variations).length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {' '}({Object.values(item.selected_variations).map(opt => opt.name).join(', ')})
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground"> x{item.quantity}</span>
                      {item.selected_addons.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Add-ons: {item.selected_addons.map(a => a.name).join(', ')}
                        </p>
                      )}
                      {item.special_instructions && (
                        <p className="text-xs italic text-muted-foreground mt-0.5">
                          Note: {item.special_instructions}
                        </p>
                      )}
                    </div>
                    <span className="font-semibold text-sm flex-shrink-0">{formatPrice(item.subtotal)}</span>
                  </div>
                </div>
              ))}

              <Separator className="my-3" />

              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-medium">{formatPrice(completedOrderData.total)}</span>
              </div>

              {completedOrderData.deliveryFee !== null && completedOrderData.deliveryFee > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Delivery Fee</span>
                  <span className="font-medium">{formatPrice(completedOrderData.deliveryFee)}</span>
                </div>
              )}

              {completedOrderData.serviceChargeAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Service Charge</span>
                  <span className="font-medium">{formatPrice(completedOrderData.serviceChargeAmount)}</span>
                </div>
              )}

              <Separator className="my-2" />

              <div className="flex justify-between text-lg font-bold">
                <span>Total</span>
                <span className="text-green-700">
                  {formatPrice(completedOrderData.total + (completedOrderData.deliveryFee ?? 0) + completedOrderData.serviceChargeAmount)}
                </span>
              </div>
            </div>
          </div>

          {/* Customer Information */}
          {completedOrderData.formFields.length > 0 && (
            <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Customer Information</h2>
              <div className="space-y-2">
                {completedOrderData.formFields.map(field => {
                  const value = completedOrderData.customerData[field.field_name]
                  if (!value) return null
                  return (
                    <div key={field.field_name} className="flex justify-between text-sm">
                      <span className="text-gray-600">{field.field_label}</span>
                      <span className="font-medium text-right ml-4 max-w-[60%] break-words">{value}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Payment Method */}
          {completedOrderData.paymentMethodName && (
            <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
              <h2 className="text-lg font-bold text-gray-900 mb-2">Payment Method</h2>
              <p className="font-medium text-gray-900">{completedOrderData.paymentMethodName}</p>
              {completedOrderData.paymentMethodDetails && (
                <p className="text-sm text-gray-600 mt-1">{completedOrderData.paymentMethodDetails}</p>
              )}
            </div>
          )}

          {/* Messenger Redirect Section */}
          <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
            {completedOrderData.messengerUrl ? (
              <div className="space-y-4">
                {/* Countdown redirect indicator */}
                <div className="text-center space-y-2">
                  {redirectCountdown !== null && redirectCountdown > 0 ? (
                    <>
                      <div className="inline-flex items-center justify-center w-10 h-10 border-2 border-green-500 border-t-transparent rounded-full animate-spin mx-auto" />
                      <p className="text-sm text-gray-600">
                        Redirecting to Messenger in <span className="font-bold text-green-700">{redirectCountdown}s</span>...
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-gray-500">
                      Messenger should have opened in a new tab.
                    </p>
                  )}
                </div>

                {/* Go to Messenger button */}
                <Button
                  size="lg"
                  className="w-full h-12 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-full"
                  onClick={() => window.open(completedOrderData.messengerUrl, '_blank', 'noopener,noreferrer')}
                >
                  <ExternalLink className="mr-2 h-5 w-5" />
                  Go to Messenger
                </Button>

                {/* Copy fallback */}
                <div className="relative text-center">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-gray-200" />
                  </div>
                  <span className="relative bg-white px-3 text-xs text-gray-400">or</span>
                </div>

                <button
                  className="w-full text-sm text-green-700 hover:text-green-800 hover:underline py-1"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(completedOrderData.messengerMessage)
                      toast.success('Order message copied! Paste it in Messenger.')
                    } catch {
                      toast.error('Failed to copy message')
                    }
                  }}
                >
                  <Copy className="inline mr-1.5 h-3.5 w-3.5" />
                  Copy order text and paste it directly on Messenger
                </button>
              </div>
            ) : (
              <div className="space-y-3 text-center">
                <p className="text-sm text-gray-600">
                  Copy the order message and send it to the restaurant.
                </p>
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full h-12 rounded-full border-green-300 text-green-700 hover:bg-green-50"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(completedOrderData.messengerMessage)
                      toast.success('Order message copied! Paste it in Messenger.')
                    } catch {
                      toast.error('Failed to copy message')
                    }
                  }}
                >
                  <Copy className="mr-2 h-5 w-5" />
                  Copy Order Message
                </Button>
              </div>
            )}
          </div>

          {/* Order Message Box (collapsible) */}
          <div className="rounded-2xl bg-white shadow-sm border border-gray-100 overflow-hidden">
            <button
              onClick={() => setMessageExpanded(!messageExpanded)}
              aria-expanded={messageExpanded}
              className="w-full flex items-center justify-between p-6 text-left hover:bg-gray-50 transition-colors"
            >
              <h2 className="text-lg font-bold text-gray-900">Order Message</h2>
              <span className="text-sm text-gray-400">{messageExpanded ? 'Hide' : 'Show'}</span>
            </button>

            {messageExpanded && (
              <div className="px-6 pb-6 space-y-3">
                <div className="bg-gray-50 rounded-xl p-4 max-h-64 overflow-y-auto">
                  <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
                    {completedOrderData.messengerMessage}
                  </pre>
                </div>

                <Button
                  size="lg"
                  variant="outline"
                  className="w-full h-12 rounded-full border-green-300 text-green-700 hover:bg-green-50"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(completedOrderData.messengerMessage)
                      toast.success('Order message copied to clipboard!')
                    } catch {
                      toast.error('Failed to copy message')
                    }
                  }}
                >
                  <Copy className="mr-2 h-5 w-5" />
                  Copy Order Message
                </Button>

                <p className="text-xs text-gray-400 text-center">
                  Paste this in Messenger or any chat app
                </p>
              </div>
            )}
          </div>

          {/* Track Order + Back to Menu */}
          <div className="pb-8 space-y-3">
            {trackingOrderId && trackingToken && (
              <Button
                size="lg"
                className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-full"
                onClick={() => router.push(`/${tenantSlug}/order/${trackingOrderId}?t=${trackingToken}`)}
              >
                <Package className="mr-2 h-5 w-5" />
                Track Your Order
              </Button>
            )}
            <Button
              size="lg"
              variant="ghost"
              className="w-full h-12 rounded-full text-gray-600 hover:text-gray-900"
              onClick={() => router.push(`/${tenantSlug}/menu`)}
            >
              <ArrowLeft className="mr-2 h-5 w-5" />
              Back to Menu
            </Button>
          </div>

        </div>
      </main>
    </div>
  )
}

/** Payment-details dialog shown after "Proceed to Payment" (shared across designs). */
export function PaymentDetailsDialog({ checkout }: { checkout: UseCheckoutReturn }) {
  const {
    showPaymentDetails, selectedPaymentMethod, paymentMethods, total, deliveryFee,
    serviceChargeAmount, isProcessing, handleCheckout, setShowPaymentDetails,
    handleCopyText, copiedText,
  } = checkout

  if (!showPaymentDetails || !selectedPaymentMethod) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-orange-100 rounded-full mb-4">
            <CreditCard className="h-8 w-8 text-orange-600" />
          </div>
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Complete Payment</h2>
          <p className="text-gray-600">
            Please complete payment using the details below
          </p>
        </div>

        {/* Payment Method Details */}
        <div className="space-y-6">
          {/* Payment Method Name */}
          <div className="text-center">
            <p className="text-sm text-gray-500 mb-1">Payment Method</p>
            <h3 className="text-2xl font-bold text-gray-900">
              {paymentMethods.find(m => m.id === selectedPaymentMethod)?.name}
            </h3>
          </div>

          {/* QR Code - Centered and Large */}
          {(() => {
            const qrUrl = paymentMethods.find(m => m.id === selectedPaymentMethod)?.qr_code_url
            if (!qrUrl) return null

            return (
              <div className="flex flex-col items-center gap-4 py-4 bg-gray-50 rounded-xl">
                <p className="text-sm font-medium text-gray-700">Scan QR Code to Pay</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrUrl}
                  alt="Payment QR Code"
                  className="w-64 h-64 object-contain border-4 border-white rounded-xl shadow-lg"
                />
                <p className="text-xs text-gray-500">Scan with your payment app</p>
              </div>
            )
          })()}

          {/* Payment Details */}
          {paymentMethods.find(m => m.id === selectedPaymentMethod)?.details && (
            <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-6">
              <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <span className="inline-block w-2 h-2 bg-orange-500 rounded-full"></span>
                Payment Instructions
              </h4>
              <div className="bg-white p-4 rounded-lg border border-orange-200">
                <div className="space-y-2">
                  {paymentMethods.find(m => m.id === selectedPaymentMethod)?.details?.split('\n').map((line, index) => {
                    const trimmedLine = line.trim()
                    if (!trimmedLine) return null
                    return (
                      <button
                        key={index}
                        type="button"
                        onClick={() => handleCopyText(trimmedLine, 'Details')}
                        className="w-full flex items-center justify-between gap-3 p-3 rounded-lg bg-gray-50 hover:bg-orange-100 transition-colors text-left group"
                      >
                        <span className="text-sm text-gray-700 break-all leading-relaxed">{trimmedLine}</span>
                        {copiedText === trimmedLine ? (
                          <Check className="h-5 w-5 text-green-500 shrink-0" />
                        ) : (
                          <Copy className="h-5 w-5 text-gray-400 group-hover:text-orange-500 shrink-0" />
                        )}
                      </button>
                    )
                  })}
                </div>
                <p className="text-xs text-gray-500 mt-3 flex items-center justify-center gap-1 pt-2 border-t border-gray-100">
                  <Copy className="h-3 w-3" /> Tap on any line to copy
                </p>
              </div>
            </div>
          )}

          {/* Order Summary */}
          <div className="bg-gray-50 rounded-xl p-6">
            <h4 className="font-semibold text-gray-900 mb-4">Order Summary</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-medium">{formatPrice(total)}</span>
              </div>
              {deliveryFee !== null && deliveryFee > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Delivery Fee</span>
                  <span className="font-medium">{formatPrice(deliveryFee)}</span>
                </div>
              )}
              {serviceChargeAmount > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Service Charge</span>
                  <span className="font-medium">{formatPrice(serviceChargeAmount)}</span>
                </div>
              )}
              <Separator className="my-2" />
              <div className="flex justify-between text-lg font-bold">
                <span>Total Amount to Pay</span>
                <span className="text-orange-600">{formatPrice(total + (deliveryFee || 0) + serviceChargeAmount)}</span>
              </div>
            </div>
          </div>

          {/* Important Note */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="text-blue-600 mt-0.5">
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex-1 text-sm text-blue-800">
                <p className="font-medium mb-1">Next Step:</p>
                <p>After completing payment, click the button below to send your order confirmation to the restaurant via Messenger.</p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              size="lg"
              onClick={() => setShowPaymentDetails(false)}
              disabled={isProcessing}
              className="flex-1"
            >
              Go Back
            </Button>
            <Button
              size="lg"
              onClick={handleCheckout}
              disabled={isProcessing}
              className="flex-1 bg-orange-500 hover:bg-orange-600"
            >
              {isProcessing ? (
                <>
                  <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                  Processing...
                </>
              ) : (
                <>
                  <MessageCircle className="h-5 w-5 mr-2" />
                  Order Now
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Full-size payment QR dialog (shared across designs). */
export function QrCodeDialog({ checkout }: { checkout: UseCheckoutReturn }) {
  const { qrDialogOpen, selectedQrCode, setQrDialogOpen } = checkout

  if (!qrDialogOpen || !selectedQrCode) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      onClick={() => setQrDialogOpen(false)}
    >
      <div
        className="bg-white rounded-lg p-6 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold">Payment QR Code</h3>
          <button
            onClick={() => setQrDialogOpen(false)}
            className="text-gray-400 hover:text-gray-600"
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
          className="w-full h-auto object-contain rounded"
        />
        <p className="text-sm text-gray-500 text-center mt-4">
          Scan this QR code with your payment app
        </p>
      </div>
    </div>
  )
}

// QrCode icon re-used by design payment selectors that render a QR thumbnail.
export { QrCode }
