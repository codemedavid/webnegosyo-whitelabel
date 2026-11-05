'use client'

/**
 * The order cards on the thank-you page: summary, customer details, payment.
 * Markup is today's, verbatim; wording comes in as props so a designed page
 * can re-word it (the standard page passes the store's Branding Studio labels).
 */

import type { ReactNode } from 'react'
import { CalendarClock } from 'lucide-react'

import { Separator } from '@/components/ui/separator'
import { addonPriceList } from '@/lib/addon-quantity'
import { formatPrice } from '@/lib/cart-utils'

import { useConfirmationBlocks } from './confirmation-context'

/** Rules on the confirmation screen use the checkout border colour. */
const RULE_COLOR = 'bg-[var(--co-border)]'
const CARD = 'rounded-2xl bg-[var(--co-card)] p-6 shadow-sm border border-[color:var(--co-border)]'

/** Page Designer designs of the customer and payment cards; `card` is today's. */
export type DetailsLook = 'card' | 'plain' | 'compact'

const DETAILS_BOX: Record<DetailsLook, string> = {
  card: CARD,
  plain: 'border-t border-[color:var(--co-border)] pt-4',
  compact: 'rounded-xl bg-[var(--co-card)] px-4 py-3 border border-[color:var(--co-border)]',
}

/** The card's heading: today's size on a card, smaller on the other designs. */
const detailsTitle = (look: DetailsLook, spacing: string): string =>
  look === 'card'
    ? `text-lg font-bold text-[color:var(--co-text)] ${spacing}`
    : 'text-base font-bold text-[color:var(--co-text)] mb-2'

export interface SummaryCopy {
  title?: ReactNode
  scheduled?: string
  addons?: string
  note?: string
  subtotal?: string
  delivery?: string
  service?: string
  total?: string
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-[color:var(--co-muted)]">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

export function ConfirmationSummaryCard({ copy = {}, showOrderType = true }: { copy?: SummaryCopy; showOrderType?: boolean }) {
  const b = useConfirmationBlocks()
  if (!b) return null
  const { order } = b
  const orderTypeName = showOrderType ? order.orderTypeName : null
  return (
    <div data-branding-scope="checkout/card" className={CARD}>
      <h2 className="text-lg font-bold text-[color:var(--co-text)] mb-1">
        {copy.title ?? 'Order Summary'}
      </h2>
      {orderTypeName && (
        <p className={`text-sm text-[color:var(--co-muted)] ${order.scheduledForLabel ? 'mb-2' : 'mb-4'}`}>{orderTypeName}</p>
      )}
      {order.scheduledForLabel && (
        <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-[var(--co-accent-soft)] border border-[color:var(--co-accent-border)] px-3 py-1 text-sm font-medium text-[color:var(--co-accent)]">
          <CalendarClock className="h-3.5 w-3.5" />
          {copy.scheduled ?? 'Scheduled for'} {order.scheduledForLabel}
        </div>
      )}

      <div className="space-y-3">
        {order.items.map((item, index) => (
          <div key={item.id}>
            {index > 0 && <Separator className={`my-3 ${RULE_COLOR}`} />}
            <div className="flex justify-between">
              <div className="flex-1 min-w-0 mr-4">
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
                    {copy.addons ?? 'Add-ons'}: {addonPriceList(item.selected_addons, formatPrice)}
                  </p>
                )}
                {item.special_instructions && (
                  <p className="min-w-0 wrap-anywhere text-xs italic text-[color:var(--co-muted)] mt-0.5">
                    {copy.note ?? 'Note'}: {item.special_instructions}
                  </p>
                )}
              </div>
              <span className="font-semibold text-sm flex-shrink-0">{formatPrice(item.subtotal)}</span>
            </div>
          </div>
        ))}

        <Separator className={`my-3 ${RULE_COLOR}`} />

        <Row label={copy.subtotal ?? 'Subtotal'} value={formatPrice(order.total)} />

        {order.deliveryFee !== null && order.deliveryFee > 0 && (
          <Row label={copy.delivery ?? 'Delivery Fee'} value={formatPrice(order.deliveryFee)} />
        )}

        {order.serviceChargeAmount > 0 && (
          <Row label={copy.service ?? 'Service Charge'} value={formatPrice(order.serviceChargeAmount)} />
        )}

        {/* Every deduction the customer actually received, named. The total
            below is derived from the same lines, so the two can never
            disagree about what a voucher was worth. */}
        {(order.discounts ?? []).map(discount => (
          <div key={discount.code ?? discount.label} className="flex justify-between text-sm">
            <span className="text-[color:var(--co-muted)]">{discount.label}</span>
            <span className="font-medium text-[color:var(--co-success)]">-{formatPrice(discount.amount)}</span>
          </div>
        ))}

        <Separator className={`my-2 ${RULE_COLOR}`} />

        <div className="flex justify-between text-lg font-bold">
          <span>{copy.total ?? 'Total'}</span>
          <span className="text-[color:var(--co-accent)]">
            {formatPrice(b.grandTotal)}
          </span>
        </div>
      </div>
    </div>
  )
}

/** What the customer filled in at checkout; nothing when the form had no fields. */
export function ConfirmationCustomerCard({ title, look = 'card' }: { title?: ReactNode; look?: DetailsLook }) {
  const b = useConfirmationBlocks()
  if (!b || b.order.formFields.length === 0) return null
  const { order } = b
  return (
    <div data-branding-scope="checkout/card" className={DETAILS_BOX[look]}>
      <h2 className={detailsTitle(look, 'mb-4')}>
        {title ?? 'Customer Information'}
      </h2>
      <div className={look === 'plain' ? 'divide-y divide-[color:var(--co-border)] [&>*]:py-2' : look === 'compact' ? 'space-y-1' : 'space-y-2'}>
        {order.formFields.map(field => {
          const value = order.customerData[field.field_name]
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
  )
}

/** The chosen payment method and the store's instructions; nothing without one. */
export function ConfirmationPaymentCard({ title, look = 'card' }: { title?: ReactNode; look?: DetailsLook }) {
  const b = useConfirmationBlocks()
  if (!b?.order.paymentMethodName) return null
  const { order } = b
  return (
    <div data-branding-scope="checkout/card" className={DETAILS_BOX[look]}>
      <h2 className={detailsTitle(look, 'mb-2')}>
        {title ?? 'Payment Method'}
      </h2>
      <p className="font-medium text-[color:var(--co-text)]">{order.paymentMethodName}</p>
      {order.paymentMethodDetails && (
        <p className="text-sm text-[color:var(--co-muted)] mt-1">{order.paymentMethodDetails}</p>
      )}
    </div>
  )
}
