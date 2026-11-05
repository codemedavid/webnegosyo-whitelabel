'use client'

/**
 * The Page Designer's other order-summary designs: a printed-receipt look and
 * a fold-away card (the total, tap to see the dishes). Same lines, same
 * wording and the same `--trk-*` colours as the standard card.
 */

import { ChevronDown, Receipt } from 'lucide-react'
import { formatPrice } from '@/lib/cart-utils'
import { StoreLabel } from '@/components/customer/storefront-labels-provider'
import type { TrackingData } from '@/lib/order-tracking-service'
import type { OrderSummaryShow, OrderSummaryWording } from './order-summary-card'

interface SummaryProps {
  items: TrackingData['items']
  total: number
  deliveryFee?: number
  serviceChargeAmount?: number
  wording: OrderSummaryWording
  lines: Required<OrderSummaryShow>
}

const CARD_STYLE = { borderRadius: 'var(--trk-radius)', backgroundColor: 'var(--trk-card)', borderColor: 'var(--trk-card-border)' } as const

function Title({ wording }: { wording: OrderSummaryWording }) {
  return <>{wording.title ?? <StoreLabel name="tracking.summary_title" fallback="Your order" />}</>
}

function FeeRows({ deliveryFee, serviceChargeAmount, wording, lines }: Pick<SummaryProps, 'deliveryFee' | 'serviceChargeAmount' | 'wording' | 'lines'>) {
  if (!lines.fees) return null
  return (
    <>
      {deliveryFee != null && deliveryFee > 0 && (
        <div data-part="muted" className="flex justify-between" style={{ color: 'var(--trk-text-muted)' }}>
          <span>{wording.deliveryFee ?? 'Delivery fee'}</span>
          <span>{formatPrice(deliveryFee)}</span>
        </div>
      )}
      {serviceChargeAmount != null && serviceChargeAmount > 0 && (
        <div data-part="muted" className="flex justify-between" style={{ color: 'var(--trk-text-muted)' }}>
          <span>{wording.serviceCharge ?? 'Service charge'}</span>
          <span>{formatPrice(serviceChargeAmount)}</span>
        </div>
      )}
    </>
  )
}

function ItemLines({ items, lines }: Pick<SummaryProps, 'items' | 'lines'>) {
  return (
    <ul className="space-y-2">
      {items.map((item, index) => (
        <li key={index} className="flex justify-between gap-3 text-sm">
          <div data-part="text" className="min-w-0 flex-1" style={{ color: 'var(--trk-text)' }}>
            <span className="font-semibold">{item.quantity}×</span> {item.name}
            {item.variation && <span data-part="muted" className="text-xs" style={{ color: 'var(--trk-text-muted)' }}> ({item.variation})</span>}
            {lines.addons && item.addons && item.addons.length > 0 && (
              <p data-part="muted" className="mt-0.5 text-xs" style={{ color: 'var(--trk-text-faint)' }}>+ {item.addons.join(', ')}</p>
            )}
          </div>
          <span data-part="price" className="shrink-0" style={{ color: 'var(--trk-text)' }}>{formatPrice(item.subtotal)}</span>
        </li>
      ))}
    </ul>
  )
}

/** Like the slip from the till: centred title, dashed rules, the total at the foot. */
export function ReceiptOrderSummary({ items, total, deliveryFee, serviceChargeAmount, wording, lines }: SummaryProps) {
  return (
    <section aria-label="Order summary" data-branding-scope="tracking/summary" data-part="card" className="border p-5 font-mono shadow-sm" style={CARD_STYLE}>
      {lines.title && (
        <h2 data-part="title" className="mb-3 text-center text-xs font-bold uppercase tracking-[0.25em]" style={{ color: 'var(--trk-text-muted)' }}>
          <Title wording={wording} />
        </h2>
      )}
      <div data-part="divider" className="border-t border-dashed pt-3" style={{ borderColor: 'var(--trk-card-border)' }}>
        <ItemLines items={items} lines={lines} />
      </div>
      <div data-part="divider" className="mt-3 space-y-1.5 border-t border-dashed pt-3 text-sm" style={{ borderColor: 'var(--trk-card-border)' }}>
        <FeeRows deliveryFee={deliveryFee} serviceChargeAmount={serviceChargeAmount} wording={wording} lines={lines} />
        <div data-part="divider" className="flex items-baseline justify-between border-t border-dashed pt-2" style={{ borderColor: 'var(--trk-card-border)' }}>
          <span data-part="total" className="text-base font-bold uppercase" style={{ color: 'var(--trk-text)' }}>{wording.total ?? 'Total'}</span>
          <span data-part="total" className="text-lg font-extrabold" style={{ color: 'var(--trk-total)' }}>{formatPrice(total)}</span>
        </div>
      </div>
    </section>
  )
}

/** Folded to one line (title, dish count, total); tap to see every dish. */
export function CompactOrderSummary({ items, total, deliveryFee, serviceChargeAmount, wording, lines }: SummaryProps) {
  const count = items.reduce((sum, item) => sum + item.quantity, 0)
  return (
    <section aria-label="Order summary" data-branding-scope="tracking/summary" data-part="card" className="border shadow-sm" style={CARD_STYLE}>
      <details className="group">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-5 py-3 [&::-webkit-details-marker]:hidden">
          <Receipt className="h-4 w-4 shrink-0" style={{ color: 'var(--trk-text-muted)' }} aria-hidden="true" />
          <span className="min-w-0 flex-1">
            {lines.title && <span data-part="title" className="block text-sm font-semibold" style={{ color: 'var(--trk-text)' }}><Title wording={wording} /></span>}
            <span data-part="muted" className="block text-xs" style={{ color: 'var(--trk-text-muted)' }}>{count} {count === 1 ? 'item' : 'items'}</span>
          </span>
          <span data-part="total" className="text-base font-extrabold" style={{ color: 'var(--trk-total)' }}>{formatPrice(total)}</span>
          <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" style={{ color: 'var(--trk-text-muted)' }} aria-hidden="true" />
        </summary>
        <div data-part="divider" className="border-t px-5 pb-4 pt-3" style={{ borderColor: 'var(--trk-card-border)' }}>
          <ItemLines items={items} lines={lines} />
          <div data-part="divider" className="mt-3 space-y-1.5 border-t pt-3 text-sm" style={{ borderColor: 'var(--trk-card-border)' }}>
            <FeeRows deliveryFee={deliveryFee} serviceChargeAmount={serviceChargeAmount} wording={wording} lines={lines} />
            <div data-part="total" className="flex justify-between font-bold" style={{ color: 'var(--trk-text)' }}>
              <span>{wording.total ?? 'Total'}</span>
              <span>{formatPrice(total)}</span>
            </div>
          </div>
        </div>
      </details>
    </section>
  )
}
