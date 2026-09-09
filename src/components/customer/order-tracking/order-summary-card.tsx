'use client'

import { Receipt } from 'lucide-react'
import { formatPrice } from '@/lib/cart-utils'
import type { TrackingData } from '@/lib/order-tracking-service'

interface OrderSummaryCardProps {
  items: TrackingData['items']
  total: number
  deliveryFee?: number
  serviceChargeAmount?: number
}

/** The receipt: what was ordered and what it cost, in the tenant's palette. */
export function OrderSummaryCard({ items, total, deliveryFee, serviceChargeAmount }: OrderSummaryCardProps) {
  const hasDeliveryFee = deliveryFee != null && deliveryFee > 0
  const hasServiceCharge = serviceChargeAmount != null && serviceChargeAmount > 0

  return (
    <section
      aria-label="Order summary"
      className="rounded-3xl border p-5 shadow-sm"
      style={{ backgroundColor: 'var(--trk-card)', borderColor: 'var(--trk-card-border)' }}
    >
      <h2 className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--trk-text-muted)' }}>
        <Receipt className="h-4 w-4" aria-hidden="true" />
        Your order
      </h2>

      <ul className="divide-y" style={{ borderColor: 'var(--trk-card-border)' }}>
        {items.map((item, index) => (
          <li key={index} className="flex justify-between gap-3 py-2.5 text-sm first:pt-0">
            <div className="min-w-0 flex-1">
              <p className="font-medium" style={{ color: 'var(--trk-text)' }}>
                <span
                  className="mr-2 inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 text-xs font-bold"
                  style={{ backgroundColor: 'var(--trk-accent-soft)', color: 'var(--trk-accent)' }}
                >
                  {item.quantity}×
                </span>
                {item.name}
                {item.variation && (
                  <span className="text-xs" style={{ color: 'var(--trk-text-muted)' }}> ({item.variation})</span>
                )}
              </p>
              {item.addons && item.addons.length > 0 && (
                <p className="mt-0.5 pl-8 text-xs" style={{ color: 'var(--trk-text-faint)' }}>
                  + {item.addons.join(', ')}
                </p>
              )}
            </div>
            <span className="shrink-0 font-medium" style={{ color: 'var(--trk-text)' }}>
              {formatPrice(item.subtotal)}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-3 space-y-1.5 border-t pt-3 text-sm" style={{ borderColor: 'var(--trk-card-border)' }}>
        {hasDeliveryFee && (
          <div className="flex justify-between" style={{ color: 'var(--trk-text-muted)' }}>
            <span>Delivery fee</span>
            <span>{formatPrice(deliveryFee)}</span>
          </div>
        )}
        {hasServiceCharge && (
          <div className="flex justify-between" style={{ color: 'var(--trk-text-muted)' }}>
            <span>Service charge</span>
            <span>{formatPrice(serviceChargeAmount)}</span>
          </div>
        )}
        <div className="flex items-baseline justify-between pt-1">
          <span className="text-base font-bold" style={{ color: 'var(--trk-text)' }}>Total</span>
          <span className="text-xl font-extrabold" style={{ color: 'var(--trk-accent)' }}>{formatPrice(total)}</span>
        </div>
      </div>
    </section>
  )
}
