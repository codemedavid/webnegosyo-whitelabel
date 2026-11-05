'use client'

import { Receipt } from 'lucide-react'
import { formatPrice } from '@/lib/cart-utils'
import { StoreLabel } from '@/components/customer/storefront-labels-provider'
import type { TrackingData } from '@/lib/order-tracking-service'
import { CompactOrderSummary, ReceiptOrderSummary } from './order-summary-variants'

export type OrderSummaryLayout = 'standard' | 'receipt' | 'compact'

interface OrderSummaryCardProps {
  items: TrackingData['items']
  total: number
  deliveryFee?: number
  serviceChargeAmount?: number
  /** Page Designer wording; each unset line keeps today's words. */
  wording?: OrderSummaryWording
  /** Page Designer layout; unset = today's card. */
  layout?: OrderSummaryLayout
  /** Page Designer switches; each unset line shows, as today. */
  show?: OrderSummaryShow
}

export interface OrderSummaryShow {
  title?: boolean
  addons?: boolean
  /** Delivery fee and service charge rows. */
  fees?: boolean
}

/** Every line on, filled in from what the block was given. */
export function orderSummaryShow(show: OrderSummaryShow = {}): Required<OrderSummaryShow> {
  return { title: true, addons: true, fees: true, ...show }
}

export interface OrderSummaryWording {
  title?: string
  deliveryFee?: string
  serviceCharge?: string
  total?: string
}

const NO_WORDING: OrderSummaryWording = {}

/** The receipt: what was ordered and what it cost, in the tenant's palette. */
export function OrderSummaryCard({ items, total, deliveryFee, serviceChargeAmount, wording = NO_WORDING, layout = 'standard', show }: OrderSummaryCardProps) {
  const lines = orderSummaryShow(show)
  const variantProps = { items, total, deliveryFee, serviceChargeAmount, wording, lines }
  if (layout === 'receipt') return <ReceiptOrderSummary {...variantProps} />
  if (layout === 'compact') return <CompactOrderSummary {...variantProps} />
  const hasDeliveryFee = lines.fees && deliveryFee != null && deliveryFee > 0
  const hasServiceCharge = lines.fees && serviceChargeAmount != null && serviceChargeAmount > 0

  return (
    <section
      aria-label="Order summary"
      data-branding-scope="tracking/summary"
      data-part="card"
      className="border p-5 shadow-sm"
      style={{ borderRadius: 'var(--trk-radius)', backgroundColor: 'var(--trk-card)', borderColor: 'var(--trk-card-border)' }}
    >
      {lines.title && (
        <h2 data-part="title" className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--trk-text-muted)' }}>
          <Receipt className="h-4 w-4" aria-hidden="true" />
          {wording.title ?? <StoreLabel name="tracking.summary_title" fallback="Your order" />}
        </h2>
      )}

      <ul className="divide-y" style={{ borderColor: 'var(--trk-card-border)' }}>
        {items.map((item, index) => (
          <li key={index} className="flex justify-between gap-3 py-2.5 text-sm first:pt-0">
            <div className="min-w-0 flex-1">
              <p data-part="text" className="font-medium" style={{ color: 'var(--trk-text)' }}>
                <span
                  data-part="badge"
                  className="mr-2 inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 text-xs font-bold"
                  style={{ backgroundColor: 'var(--trk-qty-bg)', color: 'var(--trk-qty-text)' }}
                >
                  {item.quantity}×
                </span>
                {item.name}
                {item.variation && (
                  <span data-part="muted" className="text-xs" style={{ color: 'var(--trk-text-muted)' }}> ({item.variation})</span>
                )}
              </p>
              {lines.addons && item.addons && item.addons.length > 0 && (
                <p data-part="muted" className="mt-0.5 pl-8 text-xs" style={{ color: 'var(--trk-text-faint)' }}>
                  + {item.addons.join(', ')}
                </p>
              )}
            </div>
            <span data-part="price" className="shrink-0 font-medium" style={{ color: 'var(--trk-text)' }}>
              {formatPrice(item.subtotal)}
            </span>
          </li>
        ))}
      </ul>

      <div data-part="divider" className="mt-3 space-y-1.5 border-t pt-3 text-sm" style={{ borderColor: 'var(--trk-card-border)' }}>
        {hasDeliveryFee && (
          <div data-part="muted" className="flex justify-between" style={{ color: 'var(--trk-text-muted)' }}>
            <span>{wording.deliveryFee ?? 'Delivery fee'}</span>
            <span>{formatPrice(deliveryFee)}</span>
          </div>
        )}
        {hasServiceCharge && (
          <div data-part="muted" className="flex justify-between" style={{ color: 'var(--trk-text-muted)' }}>
            <span>{wording.serviceCharge ?? 'Service charge'}</span>
            <span>{formatPrice(serviceChargeAmount)}</span>
          </div>
        )}
        <div className="flex items-baseline justify-between pt-1">
          <span data-part="total" className="text-base font-bold" style={{ color: 'var(--trk-text)' }}>{wording.total ?? 'Total'}</span>
          <span data-part="total" className="text-xl font-extrabold" style={{ color: 'var(--trk-total)' }}>{formatPrice(total)}</span>
        </div>
      </div>
    </section>
  )
}
