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

import {
  UtensilsCrossed, Package, Truck, Check, CalendarClock, Bike, ShoppingBag, Store,
  type LucideIcon,
} from 'lucide-react'
import type { OrderTypeKind } from '@/lib/order-types/order-type-kinds'
import { getCheckoutPalette } from '@/lib/branding-utils'
import { cornersClass, type CornersChoice } from '@/lib/page-designer/knobs'
import { CO, checkoutThemeStyle } from './checkout-theme'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'

import { pickedOrderTypeIcon } from './order-type-icons'
import { wordedDescription, wordedName, type OrderTypeWording } from '@/lib/page-designer/order-type-wording'


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

// The customer form and the texts tick box live in their own files.
export { CheckoutFields } from './checkout-fields'
export { SmsOptInCheckbox } from './sms-opt-in-checkbox'

/** Page Designer settings for the tiles design; absent = the standard checkouts' tiles. */
export interface OrderTypeTilesLook {
  corners: CornersChoice
  iconStyle: 'circle' | 'plain' | 'none'
  showDescriptions: boolean
  columns: 'auto' | '1' | '2' | '3'
  /** The block's own names, details and icons per kind (absent = the store's). */
  wording?: OrderTypeWording
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
        const Icon = pickedOrderTypeIcon(ot, look?.wording) ?? ORDER_TYPE_ICONS[ot.type] ?? Package
        const description = wordedDescription(ot, look?.wording)
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
            <span data-part="option-label" className={`font-semibold text-xs sm:text-sm leading-tight ${CO.text}`}>{wordedName(ot, look?.wording)}</span>
            {showDescription && description && (
              <span data-part="option-desc" className={`hidden sm:block text-[11px] mt-0.5 line-clamp-2 ${CO.muted}`}>{description}</span>
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
