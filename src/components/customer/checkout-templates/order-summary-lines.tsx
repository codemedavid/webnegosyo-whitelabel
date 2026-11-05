'use client'

/**
 * The one order summary every checkout design renders.
 *
 * Four designs already composed this; `classic` — the default, and what most
 * tenants serve — hand-rolled its own copy "to stay pixel-identical to the
 * pre-template checkout", and so never picked up the rows this primitive grew
 * afterwards (Subtotal, the delivery-fee error). That constraint is real, so it
 * is honoured here as a SKIN rather than by leaving the default design short:
 * `variant="classic"` reproduces classic's spacing, type scale and separators
 * while sharing one set of rows with everybody else.
 *
 * Adding a row here means every design gets it. That is the point.
 */

import { addonPriceList } from '@/lib/addon-quantity'
import type { CSSProperties, ReactNode } from 'react'
import { SKINS, type OrderSummaryVariant, type SummarySkin } from './order-summary-skins'
import { formatPrice } from '@/lib/cart-utils'
import { getCheckoutPalette } from '@/lib/branding-utils'
import { checkoutThemeStyle } from './checkout-theme'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'
import type { CartItem } from '@/types/database'
import { GovClaimField } from './gov-claim-field'
import { VoucherField } from './voucher-field'
import { StoreLabel } from '@/components/customer/storefront-labels-provider'


export type { OrderSummaryVariant } from './order-summary-skins'

/** Row wording a Page Designer checkout may change. Absent = today's wording. */
export interface OrderSummaryLabels {
  subtotal: string
  deliveryFee: string
  serviceCharge: string
  discount: string
  /** Replaces the store's `checkout.total` label when given. */
  total: string
}

/** The variation / quantity annotations that trail a line item's name. */
function ItemAnnotations({ item, className }: { item: CartItem; className: string }) {
  const groupedVariations = item.selected_variations
    ? Object.values(item.selected_variations).map(option => option.name)
    : []

  return (
    <>
      {item.selected_variation && (
        <span className={className}> ({item.selected_variation.name})</span>
      )}
      {groupedVariations.length > 0 && (
        <span className={className}> ({groupedVariations.join(', ')})</span>
      )}
      <span className={className}> x{item.quantity}</span>
    </>
  )
}

/**
 * One cart line. Classic stacks add-ons and the note BELOW the price row;
 * the other designs keep them inside the name column. Same content either way.
 */
function SummaryItem({
  item,
  skin,
  isClassic,
  nameStyle,
}: {
  item: CartItem
  skin: SummarySkin
  isClassic: boolean
  nameStyle?: CSSProperties
}) {
  const addons = item.selected_addons.length > 0 && (
    <p className={skin.itemAddons}>Add-ons: {addonPriceList(item.selected_addons, formatPrice)}</p>
  )
  const note = item.special_instructions && (
    <p className={skin.itemNote}>Note: {item.special_instructions}</p>
  )

  const priceRow = (
    <div className={isClassic ? 'flex justify-between' : 'flex justify-between gap-3'}>
      <div className={isClassic ? 'flex-1 min-w-0 mr-4' : 'flex-1 min-w-0'}>
        <span className={skin.itemName} style={nameStyle}>{item.menu_item.name}</span>
        <ItemAnnotations item={item} className={skin.itemMeta} />
        {!isClassic && addons}
        {!isClassic && note}
      </div>
      <span className={skin.itemPrice}>{formatPrice(item.subtotal)}</span>
    </div>
  )

  if (!isClassic) return priceRow

  return (
    <div className="space-y-2">
      {priceRow}
      {addons}
      {note}
    </div>
  )
}

/** A labelled totals row (Subtotal / Delivery Fee / Service Charge / Discount). */
function SummaryRow({
  label,
  value,
  skin,
  valueClassName,
  labelStyle,
  valueStyle,
}: {
  label: string
  value: ReactNode
  skin: SummarySkin
  valueClassName?: string
  labelStyle?: CSSProperties
  valueStyle?: CSSProperties
}) {
  return (
    <div className="flex justify-between text-sm">
      <span className={skin.rowLabel} style={labelStyle}>{label}</span>
      <span className={valueClassName ?? skin.rowValue} style={valueStyle}>{value}</span>
    </div>
  )
}

/** Order summary line items + totals (branded). */
export function OrderSummaryLines({
  checkout,
  variant = 'default',
  showItems = true,
  showVoucher = true,
  showGovClaim = true,
  labels = {},
  totalTone = 'accent',
}: {
  checkout: UseCheckoutReturn
  variant?: OrderSummaryVariant
  /**
   * Off for a design that lists the cart lines in their own section (BiteSpeed's
   * "Your Order"), so the totals below are not preceded by the same lines twice.
   */
  showItems?: boolean
  /** Off when the voucher field is placed on the page by itself (Page Designer). */
  showVoucher?: boolean
  /** Off when the Senior/PWD field is placed on the page by itself (Page Designer). The discount rows stay. */
  showGovClaim?: boolean
  labels?: Partial<OrderSummaryLabels>
  /** The total's colour (Page Designer): the highlight colour (today) or the text colour. */
  totalTone?: 'accent' | 'text'
}) {
  const {
    items, total, deliveryFee, isFetchingDeliveryFee, deliveryFeeAddress, deliveryFeeError, freeDeliveryRemaining,
    customerData, serviceChargeAmount, grandTotal,
    voucherCodes, voucherPreview, isCheckingVoucher, applyVoucherCode, removeVoucherCode,
    voucherLineNames, setVoucherUnitPicks,
    govLines,
  } = checkout

  const { accent, text, mutedText } = getCheckoutPalette(checkout.tenant, checkout.branding)
  const skin = SKINS[variant]
  const isClassic = variant === 'classic'

  // A fee quoted against a different address is not what gets billed, so it is
  // not what gets shown.
  const feeMatches = deliveryFee !== null && deliveryFeeAddress === customerData.delivery_address
  const showDeliveryRow = deliveryFee !== null || isFetchingDeliveryFee
  const showDeliveryError = Boolean(deliveryFeeError) && !isFetchingDeliveryFee && deliveryFee === null
  // A Senior/PWD discount replaces the vouchers when it saves more (never both).
  const hasDiscount = !govLines && (voucherPreview?.accepted.length ?? 0) > 0

  // Classic themes every row from the tenant palette; the other designs only
  // theme the subtotal and the total, and are left exactly as they were.
  const rowLabelStyle = isClassic ? { color: mutedText } : undefined
  const rowValueStyle = isClassic ? { color: text } : undefined

  return (
    <div className={skin.container} style={checkoutThemeStyle(checkout)}>
      {showItems && items.map((item, index) => (
        <div key={item.id}>
          {index > 0 && skin.itemBreak}
          <SummaryItem
            item={item}
            skin={skin}
            isClassic={isClassic}
            nameStyle={isClassic ? undefined : { color: text }}
          />
        </div>
      ))}

      {showItems && skin.itemsBreak}

      <SummaryRow
        label={labels.subtotal ?? 'Subtotal'}
        value={formatPrice(total)}
        skin={skin}
        labelStyle={{ color: mutedText }}
        valueStyle={{ color: text }}
      />
      {skin.rowTrailingBreak}

      {showDeliveryRow && (
        <>
          <SummaryRow
            label={labels.deliveryFee ?? 'Delivery Fee'}
            skin={skin}
            labelStyle={rowLabelStyle}
            valueStyle={rowValueStyle}
            value={
              isFetchingDeliveryFee ? (
                <span className="animate-pulse" style={{ color: accent }}>Calculating...</span>
              ) : feeMatches && checkout.isDeliveryFeeWaived ? (
                <span className="font-semibold" style={{ color: accent }}>Free</span>
              ) : feeMatches ? (
                formatPrice(deliveryFee!)
              ) : (
                <span style={{ color: mutedText }}>—</span>
              )
            }
          />
          {skin.rowTrailingBreak}
        </>
      )}

      {/* The free-delivery offer, while the cart is still short of it. */}
      {freeDeliveryRemaining !== null && freeDeliveryRemaining > 0 && (
        <p className="text-xs" style={{ color: mutedText }}>
          Add <span className="font-semibold" style={{ color: accent }}>{formatPrice(freeDeliveryRemaining)}</span>
          {' '}more for free delivery.
        </p>
      )}

      {/* A refused quote has to say why: without this the customer sees a bare
          "—" and no reason their address was turned down. */}
      {showDeliveryError && (
        <div>
          <p className={skin.errorText} role="alert">{deliveryFeeError}</p>
          <button
            type="button"
            className="mt-2 min-h-11 text-sm font-medium underline underline-offset-4"
            style={{ color: accent }}
            onClick={checkout.retryDeliveryQuote}
          >
            Retry delivery quote
          </button>
        </div>
      )}

      {serviceChargeAmount > 0 && (
        <>
          <SummaryRow
            label={labels.serviceCharge ?? 'Service Charge'}
            value={formatPrice(serviceChargeAmount)}
            skin={skin}
            labelStyle={rowLabelStyle}
            valueStyle={rowValueStyle}
          />
          {skin.rowTrailingBreak}
        </>
      )}

      {(showVoucher || showGovClaim) && skin.voucherLeadingBreak}

      {/* Shared by all five designs, so a voucher works the same everywhere. */}
      {showVoucher && (
        <VoucherField
          codes={voucherCodes}
          preview={voucherPreview}
          isChecking={isCheckingVoucher}
          onApply={applyVoucherCode}
          onRemove={removeVoucherCode}
          formatPrice={formatPrice}
          lineNames={voucherLineNames}
          onChooseUnits={setVoucherUnitPicks}
        />
      )}

      {showGovClaim && <GovClaimField state={checkout} formatPrice={formatPrice} accent={accent} />}

      {govLines && govLines.map((line, index) => (
        <SummaryRow
          key={`${line.label}-${index}`}
          label={line.label}
          value={`−${formatPrice(line.amount)}`}
          skin={skin}
          valueClassName={skin.discountValue}
          labelStyle={rowLabelStyle}
        />
      ))}

      {hasDiscount && (
        <>
          {skin.discountLeadingBreak}
          <SummaryRow
            label={labels.discount ?? 'Discount'}
            value={`−${formatPrice(voucherPreview?.discountTotal ?? 0)}`}
            skin={skin}
            valueClassName={skin.discountValue}
            labelStyle={rowLabelStyle}
          />
        </>
      )}

      {skin.totalLeadingBreak}

      <div className={skin.totalRow}>
        <span className={skin.totalLabel} style={{ color: text }}>{labels.total ?? <StoreLabel name="checkout.total" fallback="Total" />}</span>
        <span className={skin.totalValue} style={{ color: totalTone === 'text' ? text : accent }}>
          {isFetchingDeliveryFee ? <span className="animate-pulse">Calculating...</span> : formatPrice(grandTotal)}
        </span>
      </div>
    </div>
  )
}
