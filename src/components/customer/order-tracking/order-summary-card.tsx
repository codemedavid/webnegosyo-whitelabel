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
}

export interface OrderSummaryWording {
  title?: string
  deliveryFee?: string
  serviceCharge?: string
  total?: string
}

const NO_WORDING: OrderSummaryWording = {}

/** The receipt: what was ordered and what it cost, in the tenant's palette. */
export function OrderSummaryCard({ items, total, deliveryFee, serviceChargeAmount, wording = NO_WORDING, layout = 'standard' }: OrderSummaryCardProps) {
  if (layout === 'receipt') return <ReceiptOrderSummary items={items} total={total} deliveryFee={deliveryFee} serviceChargeAmount={serviceChargeAmount} wording={wording} />
  if (layout === 'compact') return <CompactOrderSummary items={items} total={total} deliveryFee={deliveryFee} serviceChargeAmount={serviceChargeAmount} wording={wording} />
  const hasDeliveryFee = deliveryFee != null && deliveryFee > 0
  const hasServiceCharge = serviceChargeAmount != null && serviceChargeAmount > 0

  return (
    <section
      aria-label="Order summary"
      data-branding-scope="tracking/summary"
      data-part="card"
      className="border p-5 shadow-sm"
      style={{ borderRadius: 'var(--trk-radius)', backgroundColor: 'var(--trk-card)', borderColor: 'var(--trk-card-border)' }}
    >
      <h2 data-part="title" className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--trk-text-muted)' }}>
        <Receipt className="h-4 w-4" aria-hidden="true" />
        {wording.title ?? <StoreLabel name="tracking.summary_title" fallback="Your order" />}
      </h2>

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
              {item.addons && item.addons.length > 0 && (
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
