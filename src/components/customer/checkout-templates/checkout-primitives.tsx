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
 * The Classic design intentionally does NOT use these — it keeps its original
 * markup, themed from the same `--co-*` variables (./checkout-theme).
 */

import { useId } from 'react'
import {
  UtensilsCrossed, Package, Truck, Check, CalendarClock, Bike, ShoppingBag, Store,
  type LucideIcon,
} from 'lucide-react'
import type { OrderTypeKind } from '@/lib/order-types/order-type-kinds'
import {
  phPhoneDigitCount,
  phPhoneDisplayDigits,
  toPhPhoneValue,
  PH_PHONE_MAX_DIGITS,
} from '@/lib/checkout/customer-field-input'
import { getCheckoutPalette } from '@/lib/branding-utils'
import { cornersClass, type CornersChoice } from '@/lib/page-designer/knobs'
import { CO, checkoutThemeStyle } from './checkout-theme'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'
import { CheckoutLoyaltyProgress } from './checkout-loyalty-progress'
import { isDeliveryAddressField } from '@/lib/checkout-field-presets'

import { CheckoutAddressField } from './checkout-address-field'
import { fieldInputClass, type CheckoutFieldsLook } from './field-styles'


/** The icon for each kind of order type (shared by every order-type design). */
export const ORDER_TYPE_ICONS: Record<OrderTypeKind, LucideIcon> = {
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
interface CheckoutFieldsProps {
  checkout: UseCheckoutReturn
  columns?: 1 | 2
  /** Off when the stamp card is placed on the page by itself (Page Designer). */
  showLoyalty?: boolean
  /** Off when the texts tick box is placed on the page by itself (Page Designer). */
  showSmsOptIn?: boolean
  /** The answer boxes' style (Page Designer); absent = today's boxes. */
  look?: CheckoutFieldsLook
}

export function CheckoutFields({ checkout, columns = 2, showLoyalty = true, showSmsOptIn = true, look }: CheckoutFieldsProps) {
  const { formFields, customerData, setCustomerData, tenant } = checkout
  const reactId = useId()

  if (!formFields.length) return null

  const inputClass = fieldInputClass(look)

  return (
    <div style={checkoutThemeStyle(checkout)}>
    <div
      className={`grid gap-4 ${columns === 2 ? 'md:grid-cols-2' : 'grid-cols-1'}`}
    >
      {formFields.map((field) => {
        const fieldId = `${reactId}-${field.id}`
        const fullWidth = field.field_type === 'textarea' || isDeliveryAddressField(field)
        return (
          <div key={field.id} className={fullWidth && columns === 2 ? 'md:col-span-2' : ''}>
            <label htmlFor={fieldId} data-part="label" className={`block text-sm font-medium mb-1.5 ${CO.text}`}>
              {field.field_label}
              {field.is_required && <span data-part="error" className={`ml-1 ${CO.error}`}>*</span>}
            </label>

            {isDeliveryAddressField(field) ? (
              <CheckoutAddressField
                checkout={checkout}
                fieldName={field.field_name}
                placeholder={field.placeholder}
                isRequired={field.is_required}
                inputClassName={inputClass}
                labelClassName={CO.text}
              />
            ) : field.field_type === 'textarea' ? (
              <textarea
                id={fieldId}
                value={customerData[field.field_name] || ''}
                onChange={(e) => setCustomerData(prev => ({ ...prev, [field.field_name]: e.target.value }))}
                placeholder={field.placeholder}
                data-part="field"
                className={inputClass}
                rows={3}
              />
            ) : field.field_type === 'select' ? (
              <select
                id={fieldId}
                value={customerData[field.field_name] || ''}
                onChange={(e) => setCustomerData(prev => ({ ...prev, [field.field_name]: e.target.value }))}
                data-part="field"
                className={inputClass}
              >
                <option value="">Select {field.field_label}</option>
                {field.options?.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            ) : field.field_type === 'phone' && (tenant?.lalamove_market || '').toUpperCase() === 'PH' ? (
              <div className="relative">
                <div data-part="muted" className={`absolute left-3 top-1/2 -translate-y-1/2 font-medium pointer-events-none ${CO.text}`}>
                  +63
                </div>
                <input
                  id={fieldId}
                  type="tel"
                  value={phPhoneDisplayDigits(customerData[field.field_name] || '')}
                  onChange={(e) => {
                    const stored = toPhPhoneValue(e.target.value)
                    setCustomerData(prev => ({ ...prev, [field.field_name]: stored }))
                  }}
                  placeholder="9XXXXXXXXX"
                  maxLength={PH_PHONE_MAX_DIGITS}
                  data-part="field"
                  className={`${inputClass} pl-12`}
                />
                <div data-part="muted" className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs pointer-events-none ${CO.muted}`}>
                  {`${phPhoneDigitCount(customerData[field.field_name] || '')}/${PH_PHONE_MAX_DIGITS}`}
                </div>
              </div>
            ) : (
              <input
                id={fieldId}
                type={field.field_type === 'email' ? 'email' : field.field_type === 'number' ? 'number' : 'text'}
                value={customerData[field.field_name] || ''}
                onChange={(e) => setCustomerData(prev => ({ ...prev, [field.field_name]: e.target.value }))}
                placeholder={field.placeholder}
                data-part="field"
                className={inputClass}
              />
            )}

            {isDeliveryAddressField(field) && checkout.deliveryOutOfRange && (
              <p data-part="error" className={`mt-1.5 text-sm font-medium ${CO.error}`}>
                This address is outside the delivery area
                {checkout.tenant?.delivery_radius_km ? ` (${checkout.tenant.delivery_radius_km} km)` : ''}.
                {' '}Please choose a closer address or switch to pickup.
              </p>
            )}
            {isDeliveryAddressField(field) &&
              !checkout.deliveryOutOfRange &&
              checkout.deliveryFee !== null &&
              checkout.deliveryDistanceKm !== null && (
                <p data-part="muted" className={`mt-1.5 text-xs ${CO.muted}`}>
                  {checkout.deliveryDistanceKm.toFixed(1)} km away
                </p>
              )}
          </div>
        )
      })}
    </div>
      {/* The customer's own stamp card, the moment their number is complete.
          Above consent because it is feedback on the field they just filled. */}
      {showLoyalty && (
        <div className="mt-4">
          <CheckoutLoyaltyProgress checkout={checkout} />
        </div>
      )}

      {/* Consent sits below the fields, spanning both columns — it is a
          statement about all of them, not another field. */}
      {showSmsOptIn && <SmsOptInCheckbox checkout={checkout} />}
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
export function SmsOptInCheckbox({ checkout, label }: { checkout: UseCheckoutReturn; label?: string }) {
  const { isSmsOptedIn, setIsSmsOptedIn, tenant } = checkout
  const { accent } = useAccent(checkout)
  const id = useId()

  return (
    <label
      htmlFor={id}
      className={`mt-4 flex cursor-pointer items-start gap-2.5 text-sm ${CO.muted}`}
      style={checkoutThemeStyle(checkout)}
    >
      <input
        id={id}
        type="checkbox"
        checked={isSmsOptedIn}
        onChange={(e) => setIsSmsOptedIn(e.target.checked)}
        className={`mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded ${CO.border}`}
        style={{ accentColor: accent }}
      />
      {label ? (
        <span data-part="text">{label}</span>
      ) : (
        <span data-part="text">
          Text me updates and offers from {tenant?.name ?? 'this store'}. Standard message rates apply,
          and you can opt out any time.
        </span>
      )}
    </label>
  )
}

/** Page Designer settings for the tiles design; absent = the standard checkouts' tiles. */
export interface OrderTypeTilesLook {
  corners: CornersChoice
  iconStyle: 'circle' | 'plain' | 'none'
  showDescriptions: boolean
  columns: 'auto' | '1' | '2' | '3'
}

const TILE_COLUMNS: Record<OrderTypeTilesLook['columns'], string> = {
  auto: 'grid-cols-3',
  '1': 'grid-cols-1',
  '2': 'grid-cols-2',
  '3': 'grid-cols-3',
}

/**
 * Order-type selector (dine-in / pickup / delivery). Branded card buttons.
 * `compact` renders smaller cards for tight layouts (express). `look` is set
 * by a Page Designer checkout only; without it the tiles are unchanged.
 */
export function OrderTypeSelector({ checkout, compact = false, look }: { checkout: UseCheckoutReturn; compact?: boolean; look?: OrderTypeTilesLook }) {
  const { orderTypes, orderType, setOrderType } = checkout
  const { accent, accentText, accentSoft, accentBorder } = useAccent(checkout)
  // Unselected colours come from the theme variables set on this root.
  const tileBorder = 'var(--co-border)'
  const iconStyle = look?.iconStyle ?? 'circle'
  const showDescription = !compact && (look?.showDescriptions ?? true)

  if (!orderTypes.length) return null

  return (
    <div className={`grid ${TILE_COLUMNS[look?.columns ?? 'auto']} gap-2.5 sm:gap-3`} style={checkoutThemeStyle(checkout)}>
      {orderTypes.map((ot) => {
        const isSelected = orderType === ot.id
        const Icon = ORDER_TYPE_ICONS[ot.type] ?? Package
        return (
          <button
            key={ot.id}
            data-branding-scope="checkout/choice"
            type="button"
            onClick={() => setOrderType(ot.id)}
            aria-pressed={isSelected}
            data-part="option"
            data-on={isSelected ? '' : undefined}
            className={`relative flex flex-col items-center justify-start text-center ${cornersClass(look?.corners, 'rounded-2xl')} border-2 transition-all ${compact ? 'p-2.5' : 'p-3 sm:p-4'} ${isSelected ? 'shadow-sm' : 'hover:shadow-sm'}`}
            style={{
              borderColor: isSelected ? accent : tileBorder,
              backgroundColor: isSelected ? accentSoft : 'var(--co-card)',
            }}
            onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.borderColor = accentBorder }}
            onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.borderColor = tileBorder }}
          >
            {isSelected && (
              <span
                data-part="tick"
                className="absolute top-1.5 right-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full"
                style={{ backgroundColor: accent, color: accentText }}
              >
                <Check className="h-3 w-3" />
              </span>
            )}
            {iconStyle === 'circle' && (
              <span
                data-part="icon"
                data-on={isSelected ? '' : undefined}
                className={`inline-flex items-center justify-center rounded-full mb-2 ${compact ? 'h-9 w-9' : 'h-10 w-10 sm:h-12 sm:w-12'}`}
                style={isSelected ? { backgroundColor: accent, color: accentText } : { backgroundColor: 'var(--co-subtle-strong)', color: 'var(--co-muted)' }}
              >
                <Icon className={compact ? 'h-4.5 w-4.5' : 'h-5 w-5 sm:h-6 sm:w-6'} />
              </span>
            )}
            {iconStyle === 'plain' && (
              <Icon data-part="icon" data-on={isSelected ? '' : undefined} className="mb-2 h-6 w-6 sm:h-7 sm:w-7" style={{ color: isSelected ? accent : 'var(--co-muted)' }} aria-hidden="true" />
            )}
            <span data-part="option-label" className={`font-semibold text-xs sm:text-sm leading-tight ${CO.text}`}>{ot.name}</span>
            {showDescription && ot.description && (
              <span data-part="option-desc" className={`hidden sm:block text-[11px] mt-0.5 line-clamp-2 ${CO.muted}`}>{ot.description}</span>
            )}
            {ot.advance_order_enabled && (
              <span
                data-part="badge"
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
 * states exactly like the original and drives `handleProceedToPayment`. With the
 * unmet-minimum notice that sits beside it.
 */
export { CheckoutCTA, MinimumOrderNotice, type PlaceOrderLook } from './place-order-button'
