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
import type { UseCheckoutReturn } from '@/hooks/useCheckout'
import type { CartItem } from '@/types/database'
import { VoucherField } from './voucher-field'

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

const DEFAULT_SKIN: SummarySkin = {
  container: 'space-y-3',
  itemBreak: <div className="my-3 border-t border-gray-100" />,
  itemsBreak: <div className="my-3 border-t border-gray-100" />,
  rowTrailingBreak: null,
  voucherLeadingBreak: <div className="my-2 border-t border-gray-200" />,
  discountLeadingBreak: null,
  totalLeadingBreak: <div className="my-2 border-t border-gray-200" />,
  itemName: 'font-medium text-sm text-gray-900',
  itemMeta: 'text-xs text-gray-500',
  itemAddons: 'text-xs text-gray-500 mt-0.5',
  itemNote: 'text-xs italic text-gray-500 mt-0.5',
  itemPrice: 'font-semibold text-sm text-gray-900 flex-shrink-0',
  rowLabel: 'text-gray-600',
  rowValue: 'font-medium text-gray-900',
  discountValue: 'font-medium text-green-700',
  errorText: 'text-xs text-red-600',
  totalRow: 'flex justify-between items-baseline',
  totalLabel: 'text-base font-bold text-gray-900',
  totalValue: 'text-xl font-bold',
}

const CLASSIC_SKIN: SummarySkin = {
  container: 'space-y-4',
  itemBreak: <Separator className="my-4" />,
  itemsBreak: <Separator className="my-4" />,
  rowTrailingBreak: <Separator className="my-2" />,
  voucherLeadingBreak: null,
  discountLeadingBreak: <Separator className="my-2" />,
  totalLeadingBreak: null,
  itemName: 'font-medium',
  itemMeta: 'text-sm text-muted-foreground',
  itemAddons: 'text-sm text-muted-foreground',
  itemNote: 'text-sm italic text-muted-foreground',
  itemPrice: 'font-semibold flex-shrink-0',
  rowLabel: 'text-gray-600',
  rowValue: 'font-semibold',
  discountValue: 'font-semibold text-green-700',
  errorText: 'text-sm text-red-600',
  totalRow: 'flex justify-between text-xl font-bold pt-4 border-t',
  totalLabel: '',
  totalValue: 'text-orange-600',
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
    items, total, deliveryFee, isFetchingDeliveryFee, deliveryFeeAddress, deliveryFeeError,
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
    <div className={skin.container}>
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
              ) : feeMatches ? (
                formatPrice(deliveryFee!)
              ) : (
                <span className="text-gray-400">—</span>
              )
            }
          />
          {skin.rowTrailingBreak}
        </>
      )}

      {/* A refused quote has to say why: without this the customer sees a bare
          "—" and no reason their address was turned down. */}
      {showDeliveryError && (
        <p className={skin.errorText} role="alert">{deliveryFeeError}</p>
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
        <span className={skin.totalLabel} style={{ color: text }}>Total</span>
        <span className={skin.totalValue} style={{ color: accent }}>
          {isFetchingDeliveryFee ? <span className="animate-pulse">Calculating...</span> : formatPrice(grandTotal)}
        </span>
      </div>
    </div>
  )
}
