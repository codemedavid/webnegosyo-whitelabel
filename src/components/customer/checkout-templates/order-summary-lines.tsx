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

import { addonLabel } from '@/lib/addon-quantity'
import type { CSSProperties, ReactNode } from 'react'
import { Separator } from '@/components/ui/separator'
import { formatPrice } from '@/lib/cart-utils'
import { getCheckoutPalette } from '@/lib/branding-utils'
import { checkoutThemeStyle } from './checkout-theme'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'
import type { CartItem } from '@/types/database'
import { VoucherField } from './voucher-field'
import { StoreLabel } from '@/components/customer/storefront-labels-provider'

export type OrderSummaryVariant = 'default' | 'classic'

interface SummarySkin {
  container: string
  /** Rule between two line items. */
  itemBreak: ReactNode
  /** Rule below the last line item. */
  itemsBreak: ReactNode
  /** Rule below each totals row (classic punctuates every row). */
  rowTrailingBreak: ReactNode
  /** Rule above the voucher field / discount / total (default punctuates groups). */
  voucherLeadingBreak: ReactNode
  discountLeadingBreak: ReactNode
  totalLeadingBreak: ReactNode
  itemName: string
  itemMeta: string
  itemAddons: string
  itemNote: string
  itemPrice: string
  rowLabel: string
  rowValue: string
  discountValue: string
  errorText: string
  totalRow: string
  totalLabel: string
  totalValue: string
}

const RULE = 'border-t border-[color:var(--co-border)]'
const SEPARATOR_COLOR = 'bg-[var(--co-border)]'

const DEFAULT_SKIN: SummarySkin = {
  container: 'space-y-3',
  itemBreak: <div className={`my-3 ${RULE}`} />,
  itemsBreak: <div className={`my-3 ${RULE}`} />,
  rowTrailingBreak: null,
  voucherLeadingBreak: <div className={`my-2 ${RULE}`} />,
  discountLeadingBreak: null,
  totalLeadingBreak: <div className={`my-2 ${RULE}`} />,
  itemName: 'font-medium text-sm text-[color:var(--co-text)]',
  itemMeta: 'text-xs text-[color:var(--co-muted)]',
  itemAddons: 'text-xs text-[color:var(--co-muted)] mt-0.5',
  itemNote: 'text-xs italic text-[color:var(--co-muted)] mt-0.5',
  itemPrice: 'font-semibold text-sm text-[color:var(--co-text)] flex-shrink-0',
  rowLabel: 'text-[color:var(--co-muted)]',
  rowValue: 'font-medium text-[color:var(--co-text)]',
  discountValue: 'font-medium text-[color:var(--co-success)]',
  errorText: 'text-xs text-[color:var(--co-error)]',
  totalRow: 'flex justify-between items-baseline',
  totalLabel: 'text-base font-bold text-[color:var(--co-text)]',
  totalValue: 'text-xl font-bold',
}

const CLASSIC_SKIN: SummarySkin = {
  container: 'space-y-4',
  itemBreak: <Separator className={`my-4 ${SEPARATOR_COLOR}`} />,
  itemsBreak: <Separator className={`my-4 ${SEPARATOR_COLOR}`} />,
  rowTrailingBreak: <Separator className={`my-2 ${SEPARATOR_COLOR}`} />,
  voucherLeadingBreak: null,
  discountLeadingBreak: <Separator className={`my-2 ${SEPARATOR_COLOR}`} />,
  totalLeadingBreak: null,
  itemName: 'font-medium text-[color:var(--co-text)]',
  itemMeta: 'text-sm text-[color:var(--co-muted)]',
  itemAddons: 'text-sm text-[color:var(--co-muted)]',
  itemNote: 'text-sm italic text-[color:var(--co-muted)]',
  itemPrice: 'font-semibold text-[color:var(--co-text)] flex-shrink-0',
  rowLabel: 'text-[color:var(--co-muted)]',
  rowValue: 'font-semibold text-[color:var(--co-text)]',
  discountValue: 'font-semibold text-[color:var(--co-success)]',
  errorText: 'text-sm text-[color:var(--co-error)]',
  totalRow: `flex justify-between text-xl font-bold pt-4 ${RULE}`,
  totalLabel: '',
  totalValue: 'text-[color:var(--co-accent)]',
}

const SKINS: Record<OrderSummaryVariant, SummarySkin> = {
  default: DEFAULT_SKIN,
  classic: CLASSIC_SKIN,
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
    <p className={skin.itemAddons}>Add-ons: {item.selected_addons.map(addonLabel).join(', ')}</p>
  )
  const note = item.special_instructions && (
    <p className={skin.itemNote}>Note: {item.special_instructions}</p>
  )

  const priceRow = (
    <div className={isClassic ? 'flex justify-between' : 'flex justify-between gap-3'}>
      <div className={isClassic ? 'flex-1 mr-4' : 'flex-1 min-w-0'}>
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
}: {
  checkout: UseCheckoutReturn
  variant?: OrderSummaryVariant
  /**
   * Off for a design that lists the cart lines in their own section (BiteSpeed's
   * "Your Order"), so the totals below are not preceded by the same lines twice.
   */
  showItems?: boolean
}) {
  const {
    items, total, deliveryFee, isFetchingDeliveryFee, deliveryFeeAddress, deliveryFeeError, freeDeliveryRemaining,
    customerData, serviceChargeAmount, grandTotal,
    voucherCodes, voucherPreview, isCheckingVoucher, applyVoucherCode, removeVoucherCode,
  } = checkout

  const { accent, text, mutedText } = getCheckoutPalette(checkout.tenant, checkout.branding)
  const skin = SKINS[variant]
  const isClassic = variant === 'classic'

  // A fee quoted against a different address is not what gets billed, so it is
  // not what gets shown.
  const feeMatches = deliveryFee !== null && deliveryFeeAddress === customerData.delivery_address
  const showDeliveryRow = deliveryFee !== null || isFetchingDeliveryFee
  const showDeliveryError = Boolean(deliveryFeeError) && !isFetchingDeliveryFee && deliveryFee === null
  const hasDiscount = (voucherPreview?.accepted.length ?? 0) > 0

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
        label="Subtotal"
        value={formatPrice(total)}
        skin={skin}
        labelStyle={{ color: mutedText }}
        valueStyle={{ color: text }}
      />
      {skin.rowTrailingBreak}

      {showDeliveryRow && (
        <>
          <SummaryRow
            label="Delivery Fee"
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
            label="Service Charge"
            value={formatPrice(serviceChargeAmount)}
            skin={skin}
            labelStyle={rowLabelStyle}
            valueStyle={rowValueStyle}
          />
          {skin.rowTrailingBreak}
        </>
      )}

      {skin.voucherLeadingBreak}

      {/* Shared by all five designs, so a voucher works the same everywhere. */}
      <VoucherField
        codes={voucherCodes}
        preview={voucherPreview}
        isChecking={isCheckingVoucher}
        onApply={applyVoucherCode}
        onRemove={removeVoucherCode}
        formatPrice={formatPrice}
      />

      {hasDiscount && (
        <>
          {skin.discountLeadingBreak}
          <SummaryRow
            label="Discount"
            value={`−${formatPrice(voucherPreview?.discountTotal ?? 0)}`}
            skin={skin}
            valueClassName={skin.discountValue}
            labelStyle={rowLabelStyle}
          />
        </>
      )}

      {skin.totalLeadingBreak}

      <div className={skin.totalRow}>
        <span className={skin.totalLabel} style={{ color: text }}><StoreLabel name="checkout.total" fallback="Total" /></span>
        <span className={skin.totalValue} style={{ color: accent }}>
          {isFetchingDeliveryFee ? <span className="animate-pulse">Calculating...</span> : formatPrice(grandTotal)}
        </span>
      </div>
    </div>
  )
}
