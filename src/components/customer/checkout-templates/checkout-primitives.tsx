'use client'


/**
 * Branding-aware checkout building blocks.
 *
 * The four modern checkout designs (modern / wizard / minimal / express)
 * compose these primitives instead of re-implementing the genuinely tricky,
 * bug-prone pieces (Mapbox autocomplete, PH phone normalization, payment QR
 * wiring, advance-order slot selection). Each primitive consumes the shared
 * useCheckout() hook and themes itself from `checkout.branding`, so designs get
 * tenant colors for free. Layout/chrome is left to each design.
 *
 * The Classic design intentionally does NOT use these — it preserves the
 * original orange markup verbatim.
 */

import { useId } from 'react'
import dynamic from 'next/dynamic'
import {
  UtensilsCrossed, Package, Truck, Check, CalendarClock, CreditCard, Bike, ShoppingBag, Store,
  type LucideIcon,
} from 'lucide-react'
import type { OrderTypeKind } from '@/lib/order-types/order-type-kinds'
import { formatPrice } from '@/lib/cart-utils'
import { resolveCheckoutCtaLabel } from '@/lib/messenger-availability'
import { isAfterBillingPaymentEnabled } from '@/lib/after-billing-payment'
import { isPaymentDetailsStepSkipped } from '@/lib/payment-details-step'
import { isPaymentProofRequired } from '@/lib/payment-proof'
import { formatOrderMinimumMessage } from '@/lib/order-minimum'
import { getCheckoutPalette } from '@/lib/branding-utils'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'
import { VoucherField } from './voucher-field'
import { CheckoutLoyaltyProgress } from './checkout-loyalty-progress'
import { isDeliveryAddressField } from '@/lib/checkout-field-presets'

const MapboxAddressAutocomplete = dynamic(
  () => import('@/components/shared/mapbox-address-autocomplete').then(mod => ({ default: mod.MapboxAddressAutocomplete })),
  {
    loading: () => <input className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="Loading address field..." disabled />,
    ssr: false,
  }
)

const orderTypeIconMap: Record<OrderTypeKind, LucideIcon> = {
  dine_in: UtensilsCrossed,
  pickup: Package,
  delivery: Truck,
  grab: Bike,
  foodpanda: ShoppingBag,
  other: Store,
}

/** Themed checkout palette derived from tenant branding (accent + explicit overrides). */
function useAccent(checkout: UseCheckoutReturn) {
  return getCheckoutPalette(checkout.tenant, checkout.branding)
}

/**
 * Customer information inputs. Owns ALL the field-type logic
 * (Mapbox / PH phone / textarea / select / text) in one place.
 * `columns` controls the desktop grid; address & textarea always span full width.
 */
export function CheckoutFields({ checkout, columns = 2 }: { checkout: UseCheckoutReturn; columns?: 1 | 2 }) {
  const { formFields, customerData, setCustomerData, tenant } = checkout
  const { accent } = useAccent(checkout)
  const reactId = useId()

  if (!formFields.length) return null

  const inputClass =
    'w-full px-3 py-2.5 border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-[color:var(--checkout-accent)] focus:border-[color:var(--checkout-accent)] transition-shadow'

  return (
    <div style={{ ['--checkout-accent' as string]: accent }}>
    <div
      className={`grid gap-4 ${columns === 2 ? 'md:grid-cols-2' : 'grid-cols-1'}`}
    >
      {formFields.map((field) => {
        const fieldId = `${reactId}-${field.id}`
        const fullWidth = field.field_type === 'textarea' || isDeliveryAddressField(field)
        return (
          <div key={field.id} className={fullWidth && columns === 2 ? 'md:col-span-2' : ''}>
            <label htmlFor={fieldId} className="block text-sm font-medium text-gray-700 mb-1.5">
              {field.field_label}
              {field.is_required && <span className="text-red-500 ml-1">*</span>}
            </label>

            {isDeliveryAddressField(field) ? (
              <MapboxAddressAutocomplete
                value={customerData[field.field_name] || ''}
                onChange={(address, coordinates) => {
                  setCustomerData(prev => {
                    const next = { ...prev, [field.field_name]: address }
                    if (coordinates) {
                      next.delivery_lat = String(coordinates.lat)
                      next.delivery_lng = String(coordinates.lng)
                    } else {
                      // Free-text edit without a fresh geocode: drop stale coords so the fee
                      // path treats this as "no coordinates" and forces re-selection.
                      delete next.delivery_lat
                      delete next.delivery_lng
                    }
                    return next
                  })
                }}
                placeholder={field.placeholder || 'Start typing your address...'}
                required={field.is_required}
                mapboxEnabled={tenant?.mapbox_enabled ?? true}
              />
            ) : field.field_type === 'textarea' ? (
              <textarea
                id={fieldId}
                value={customerData[field.field_name] || ''}
                onChange={(e) => setCustomerData(prev => ({ ...prev, [field.field_name]: e.target.value }))}
                placeholder={field.placeholder}
                className={inputClass}
                rows={3}
              />
            ) : field.field_type === 'select' ? (
              <select
                id={fieldId}
                value={customerData[field.field_name] || ''}
                onChange={(e) => setCustomerData(prev => ({ ...prev, [field.field_name]: e.target.value }))}
                className={inputClass}
              >
                <option value="">Select {field.field_label}</option>
                {field.options?.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            ) : field.field_type === 'phone' && (tenant?.lalamove_market || '').toUpperCase() === 'PH' ? (
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-700 font-medium pointer-events-none">
                  +63
                </div>
                <input
                  id={fieldId}
                  type="tel"
                  value={(() => {
                    const value = customerData[field.field_name] || ''
                    if (value.startsWith('+63')) return value.slice(3).replace(/\D/g, '')
                    if (value.startsWith('+')) return value.slice(1).replace(/\D/g, '')
                    if (value.startsWith('0')) return value.slice(1).replace(/\D/g, '')
                    return value.replace(/\D/g, '')
                  })()}
                  onChange={(e) => {
                    let inputValue = e.target.value.replace(/\D/g, '')
                    if (inputValue.startsWith('0')) inputValue = inputValue.slice(1)
                    if (inputValue.length > 10) inputValue = inputValue.slice(0, 10)
                    setCustomerData(prev => ({
                      ...prev,
                      [field.field_name]: inputValue ? `+63${inputValue}` : '',
                    }))
                  }}
                  placeholder="9XXXXXXXXX"
                  maxLength={10}
                  className={`${inputClass} pl-12`}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none">
                  {(() => {
                    const value = customerData[field.field_name] || ''
                    const digits = value.replace(/\D/g, '').replace(/^63/, '').replace(/^0/, '')
                    return `${digits.length}/10`
                  })()}
                </div>
              </div>
            ) : (
              <input
                id={fieldId}
                type={field.field_type === 'email' ? 'email' : field.field_type === 'number' ? 'number' : 'text'}
                value={customerData[field.field_name] || ''}
                onChange={(e) => setCustomerData(prev => ({ ...prev, [field.field_name]: e.target.value }))}
                placeholder={field.placeholder}
                className={inputClass}
              />
            )}

            {isDeliveryAddressField(field) && checkout.deliveryOutOfRange && (
              <p className="mt-1.5 text-sm font-medium text-red-600">
                This address is outside the delivery area
                {checkout.tenant?.delivery_radius_km ? ` (${checkout.tenant.delivery_radius_km} km)` : ''}.
                {' '}Please choose a closer address or switch to pickup.
              </p>
            )}
            {isDeliveryAddressField(field) &&
              !checkout.deliveryOutOfRange &&
              checkout.deliveryFee !== null &&
              checkout.deliveryDistanceKm !== null && (
                <p className="mt-1.5 text-xs text-gray-500">
                  {checkout.deliveryDistanceKm.toFixed(1)} km away
                </p>
              )}
          </div>
        )
      })}
    </div>
      {/* The customer's own stamp card, the moment their number is complete.
          Above consent because it is feedback on the field they just filled. */}
      <div className="mt-4">
        <CheckoutLoyaltyProgress checkout={checkout} />
      </div>

      {/* Consent sits below the fields, spanning both columns — it is a
          statement about all of them, not another field. */}
      <SmsOptInCheckbox checkout={checkout} />
    </div>
  )
}

/**
 * Permission to text this customer later.
 *
 * Unticked by default and never pre-checked: a pre-ticked box is not consent,
 * and this is the record the merchant would rely on if a recipient ever
 * complained. The value bypasses `customerData` entirely — that map is
 * `Record<string, string>`, and a string "true" is rejected by both consent
 * read sites, so routing it through the normal field path would look like it
 * worked while quietly collecting nothing.
 */
export function SmsOptInCheckbox({ checkout }: { checkout: UseCheckoutReturn }) {
  const { isSmsOptedIn, setIsSmsOptedIn, tenant } = checkout
  const { accent } = useAccent(checkout)
  const id = useId()

  return (
    <label
      htmlFor={id}
      className="mt-4 flex cursor-pointer items-start gap-2.5 text-sm text-gray-600"
    >
      <input
        id={id}
        type="checkbox"
        checked={isSmsOptedIn}
        onChange={(e) => setIsSmsOptedIn(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300"
        style={{ accentColor: accent }}
      />
      <span>
        Text me updates and offers from {tenant?.name ?? 'this store'}. Standard message rates apply,
        and you can opt out any time.
      </span>
    </label>
  )
}

/**
 * Order-type selector (dine-in / pickup / delivery). Branded card buttons.
 * `compact` renders smaller cards for tight layouts (express).
 */
export function OrderTypeSelector({ checkout, compact = false }: { checkout: UseCheckoutReturn; compact?: boolean }) {
  const { orderTypes, orderType, setOrderType } = checkout
  const { accent, accentText, accentSoft, accentBorder } = useAccent(checkout)

  if (!orderTypes.length) return null

  return (
    <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
      {orderTypes.map((ot) => {
        const isSelected = orderType === ot.id
        const Icon = orderTypeIconMap[ot.type] ?? Package
        return (
          <button
            key={ot.id}
            type="button"
            onClick={() => setOrderType(ot.id)}
            aria-pressed={isSelected}
            className={`relative flex flex-col items-center justify-start text-center rounded-2xl border-2 transition-all ${compact ? 'p-2.5' : 'p-3 sm:p-4'} ${isSelected ? 'shadow-sm' : 'hover:shadow-sm'}`}
            style={{
              borderColor: isSelected ? accent : '#e5e7eb',
              backgroundColor: isSelected ? accentSoft : '#ffffff',
            }}
            onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.borderColor = accentBorder }}
            onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.borderColor = '#e5e7eb' }}
          >
            {isSelected && (
              <span
                className="absolute top-1.5 right-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full"
                style={{ backgroundColor: accent, color: accentText }}
              >
                <Check className="h-3 w-3" />
              </span>
            )}
            <span
              className={`inline-flex items-center justify-center rounded-full mb-2 ${compact ? 'h-9 w-9' : 'h-10 w-10 sm:h-12 sm:w-12'}`}
              style={isSelected ? { backgroundColor: accent, color: accentText } : { backgroundColor: '#f3f4f6', color: '#4b5563' }}
            >
              <Icon className={compact ? 'h-4.5 w-4.5' : 'h-5 w-5 sm:h-6 sm:w-6'} />
            </span>
            <span className="font-semibold text-xs sm:text-sm text-gray-900 leading-tight">{ot.name}</span>
            {!compact && ot.description && (
              <span className="hidden sm:block text-[11px] text-gray-500 mt-0.5 line-clamp-2">{ot.description}</span>
            )}
            {ot.advance_order_enabled && (
              <span
                className="mt-1.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                style={{ backgroundColor: accentSoft, color: accent }}
              >
                <CalendarClock className="h-2.5 w-2.5" /> Pre-order
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export { AdvanceOrderScheduler } from './advance-order-scheduler'

/**
 * Order summary line items + totals (branded).
 *
 * Lives in its own module because all five designs share it now — classic
 * included, through its `classic` skin — so a row added there reaches every one.
 */
export { OrderSummaryLines, type OrderSummaryVariant } from './order-summary-lines'

/** Payment-method selector (radio list + in-place details + QR). Branded. */
export { PaymentMethodList } from './payment-method-list'

/**
 * Primary checkout CTA button (branded). Reflects QR-handoff / payment / messenger
 * states exactly like the original and drives `handleProceedToPayment`.
 */
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
    <p className={`text-sm font-medium text-red-600 ${className}`} role="alert">
      {message}
    </p>
  )
}

export function CheckoutCTA({ checkout, className = '' }: { checkout: UseCheckoutReturn; className?: string }) {
  const { paymentMethods, selectedPaymentMethod, isProcessing, handleProceedToPayment, grandTotal, messengerEnabled, orderMinimum } = checkout
  const { accent, accentText, button } = useAccent(checkout)
  const selectedMethod = paymentMethods.find(m => m.id === selectedPaymentMethod) ?? null
  const ctaLabel = resolveCheckoutCtaLabel({
    hasPaymentMethods: paymentMethods.length > 0,
    isMessengerEnabled: messengerEnabled,
    isAfterBillingPayment: isAfterBillingPaymentEnabled(checkout.selectedOrderTypeData),
    requiresPaymentProof: isPaymentProofRequired(selectedMethod),
    skipsPaymentDetails: isPaymentDetailsStepSkipped(selectedMethod),
  })

  return (
    <button
      type="button"
      onClick={handleProceedToPayment}
      disabled={isProcessing || orderMinimum?.meets === false}
      className={`w-full h-14 inline-flex items-center justify-center gap-3 font-semibold rounded-full disabled:opacity-50 disabled:cursor-not-allowed transition-opacity ${className}`}
      style={{ backgroundColor: button ?? accent, color: accentText }}
    >
      {isProcessing ? (
        <>
          <div className="h-5 w-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          Processing Order...
        </>
      ) : paymentMethods.length > 0 ? (
        <>
          <CreditCard className="h-5 w-5" />
          <span>{ctaLabel} · {formatPrice(grandTotal)}</span>
        </>
      ) : (
        <span>{ctaLabel} · {formatPrice(grandTotal)}</span>
      )}
    </button>
  )
}
