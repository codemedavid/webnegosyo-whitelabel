'use client'

/**
 * The order summary's other designs (Page Designer only): a printed-receipt
 * look and a compact one. The first design, "Standard", is
 * ConfirmationSummaryCard itself. Every design lists the same lines — each
 * dish with its choices, add-ons and note, the fees, every discount and the
 * grand total — only the presentation changes.
 */

import type { ReactNode } from 'react'
import { CalendarClock } from 'lucide-react'

import { addonPriceList } from '@/lib/addon-quantity'
import { formatPrice } from '@/lib/cart-utils'
import type { CartItem } from '@/types/database'

import { useConfirmationBlocks, type ConfirmationBlocksValue } from './confirmation-context'
import { ConfirmationSummaryCard, summaryShow, type SummaryCopy, type SummaryShow } from './parts-order'

export type SummaryDesign = 'standard' | 'receipt' | 'compact'

interface SummaryDesignProps {
  design: SummaryDesign
  copy: SummaryCopy
  showOrderType: boolean
  /** Which optional lines show; unset = every one, as today. */
  show?: SummaryShow
}

/** What one design needs to draw: the page value, its wording, and which lines show. */
interface DesignProps {
  b: ConfirmationBlocksValue
  copy: SummaryCopy
  orderTypeName: string | null
  lines: Required<SummaryShow>
}

interface MoneyLine {
  key: string
  label: string
  amount: string
  isDiscount?: boolean
}

/** The choices picked for a dish ("Large" or "Grande, Oat"), as the standard card prints them. */
function itemChoices(item: CartItem): string | null {
  const names = [
    ...(item.selected_variation ? [item.selected_variation.name] : []),
    ...Object.values(item.selected_variations ?? {}).map((opt) => opt.name),
  ]
  return names.length > 0 ? names.join(', ') : null
}

/** Subtotal, fees and discounts, in the standard card's order and conditions. */
function moneyLines(b: ConfirmationBlocksValue, copy: SummaryCopy, showFees: boolean): MoneyLine[] {
  const { order } = b
  return [
    { key: 'subtotal', label: copy.subtotal ?? 'Subtotal', amount: formatPrice(order.total) },
    ...(showFees && order.deliveryFee !== null && order.deliveryFee > 0
      ? [{ key: 'delivery', label: copy.delivery ?? 'Delivery Fee', amount: formatPrice(order.deliveryFee) }]
      : []),
    ...(showFees && order.serviceChargeAmount > 0
      ? [{ key: 'service', label: copy.service ?? 'Service Charge', amount: formatPrice(order.serviceChargeAmount) }]
      : []),
    ...(order.discounts ?? []).map((discount) => ({
      key: `discount-${discount.code ?? discount.label}`,
      label: discount.label,
      amount: `-${formatPrice(discount.amount)}`,
      isDiscount: true,
    })),
  ]
}

function ItemDetails({ item, copy, lines }: { item: CartItem; copy: SummaryCopy; lines: Required<SummaryShow> }) {
  return (
    <>
      {lines.addons && item.selected_addons.length > 0 && (
        <p data-part="muted" className="text-xs text-[color:var(--co-muted)]">
          {copy.addons ?? 'Add-ons'}: {addonPriceList(item.selected_addons, formatPrice)}
        </p>
      )}
      {lines.notes && item.special_instructions && (
        <p data-part="muted" className="min-w-0 wrap-anywhere text-xs italic text-[color:var(--co-muted)]">
          {copy.note ?? 'Note'}: {item.special_instructions}
        </p>
      )}
    </>
  )
}

function MoneyRows({ lines }: { lines: MoneyLine[] }) {
  return (
    <>
      {lines.map((line) => (
        <div key={line.key} className="flex justify-between gap-4 text-sm">
          <span data-part="muted" className="text-[color:var(--co-muted)]">{line.label}</span>
          <span data-part="price" className={`font-medium ${line.isDiscount ? 'text-[color:var(--co-success)]' : ''}`}>{line.amount}</span>
        </div>
      ))}
    </>
  )
}

function Scheduled({ label, copy }: { label: string; copy: SummaryCopy }) {
  return (
    <p data-part="badge" className="inline-flex items-center gap-1.5 text-xs font-medium text-[color:var(--co-accent)]">
      <CalendarClock aria-hidden className="h-3.5 w-3.5" />
      {copy.scheduled ?? 'Scheduled for'} {label}
    </p>
  )
}

const DASHED = 'border-t border-dashed border-[color:var(--co-border)]'

function ReceiptSummary({ b, copy, orderTypeName, lines }: DesignProps) {
  const { order } = b
  const scheduledFor = lines.scheduled ? order.scheduledForLabel : null
  return (
    <div data-branding-scope="checkout/card" data-part="card" className="rounded-md bg-[var(--co-card)] px-5 py-6 font-mono shadow-sm border border-[color:var(--co-border)]">
      <div className="text-center space-y-1">
        <h2 data-part="title" className="text-base font-bold uppercase tracking-widest text-[color:var(--co-text)]">{copy.title ?? 'Order Summary'}</h2>
        {orderTypeName && <p data-part="subtitle" className="text-sm text-[color:var(--co-muted)]">{orderTypeName}</p>}
        {scheduledFor && <Scheduled label={scheduledFor} copy={copy} />}
      </div>
      <div data-part="divider" className={`my-4 ${DASHED}`} />
      <ul className="space-y-3">
        {order.items.map((item) => {
          const choices = itemChoices(item)
          return (
            <li key={item.id}>
              <div className="flex justify-between gap-4 text-sm">
                <span data-part="text" className="min-w-0 font-medium">
                  {item.quantity}x {item.menu_item.name}
                  {choices && <span data-part="muted" className="font-normal text-[color:var(--co-muted)]"> ({choices})</span>}
                </span>
                <span data-part="price" className="shrink-0 font-semibold">{formatPrice(item.subtotal)}</span>
              </div>
              <div className="pl-4"><ItemDetails item={item} copy={copy} lines={lines} /></div>
            </li>
          )
        })}
      </ul>
      <div data-part="divider" className={`my-4 ${DASHED}`} />
      <div className="space-y-2"><MoneyRows lines={moneyLines(b, copy, lines.fees)} /></div>
      <div data-part="divider" className={`my-4 ${DASHED}`} />
      <TotalRow label={copy.total ?? 'Total'} amount={formatPrice(b.grandTotal)} className="text-lg font-bold uppercase" />
    </div>
  )
}

function TotalRow({ label, amount, className }: { label: ReactNode; amount: string; className: string }) {
  return (
    <div data-part="total" className={`flex justify-between gap-4 ${className}`}>
      <span>{label}</span>
      <span data-part="total" className="text-[color:var(--co-accent)]">{amount}</span>
    </div>
  )
}

function CompactSummary({ b, copy, orderTypeName, lines }: DesignProps) {
  const { order } = b
  const scheduledFor = lines.scheduled ? order.scheduledForLabel : null
  return (
    <div data-branding-scope="checkout/card" data-part="card" className="rounded-xl bg-[var(--co-card)] px-4 py-3 border border-[color:var(--co-border)]">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
        <h2 data-part="title" className="text-base font-bold text-[color:var(--co-text)]">{copy.title ?? 'Order Summary'}</h2>
        {orderTypeName && <span data-part="subtitle" className="text-sm text-[color:var(--co-muted)]">· {orderTypeName}</span>}
      </div>
      {scheduledFor && <div className="mb-2"><Scheduled label={scheduledFor} copy={copy} /></div>}
      <ul className="space-y-1.5">
        {order.items.map((item) => {
          const choices = itemChoices(item)
          return (
            <li key={item.id} className="text-sm">
              <div className="flex justify-between gap-3">
                <span data-part="text" className="min-w-0">
                  <span className="text-[color:var(--co-muted)]">{item.quantity}×</span> {item.menu_item.name}
                  {choices && <span data-part="muted" className="text-xs text-[color:var(--co-muted)]"> ({choices})</span>}
                </span>
                <span data-part="price" className="shrink-0 font-medium">{formatPrice(item.subtotal)}</span>
              </div>
              <ItemDetails item={item} copy={copy} lines={lines} />
            </li>
          )
        })}
      </ul>
      <div data-part="divider" className="my-2 border-t border-[color:var(--co-border)]" />
      <div className="space-y-1"><MoneyRows lines={moneyLines(b, copy, lines.fees)} /></div>
      <TotalRow label={copy.total ?? 'Total'} amount={formatPrice(b.grandTotal)} className="mt-2 text-base font-bold" />
    </div>
  )
}

/** The summary in the block's design; "Standard" is the standard card, unchanged. */
export function SummaryDesigned({ design, copy, showOrderType, show }: SummaryDesignProps) {
  const b = useConfirmationBlocks()
  if (!b) return null
  const orderTypeName = showOrderType ? b.order.orderTypeName : null
  const lines = summaryShow(show)
  switch (design) {
    case 'receipt':
      return <ReceiptSummary b={b} copy={copy} orderTypeName={orderTypeName} lines={lines} />
    case 'compact':
      return <CompactSummary b={b} copy={copy} orderTypeName={orderTypeName} lines={lines} />
    default:
      return <ConfirmationSummaryCard copy={copy} showOrderType={showOrderType} show={show} />
  }
}
