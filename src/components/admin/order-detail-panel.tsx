'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState, type ReactNode } from 'react'
import { CalendarClock, ChevronDown, ChevronUp, ExternalLink, Loader2, MapPin, Phone, Printer, Store, X } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Separator } from '@/components/ui/separator'
import { formatPrice } from '@/lib/cart-utils'
import { cn } from '@/lib/utils'
import { discountItemsText, orderSummaryRows } from '@/lib/order-summary-rows'
import { readOrderDiscount } from '@/lib/order-discount'
import { shouldShowLalamoveControls } from '@/lib/lalamove-order-visibility'
import { buildCustomerDetailRows, DELIVERY_ADDRESS_FIELD_NAME } from '@/lib/customer-details'
import { orderMapLink } from '@/lib/delivery/order-map-link'
import { displayCustomerName } from '@/lib/order-display-name'
import { platformOrderRow } from '@/lib/admin/orders-table/row-model'
import { nextStatusStep, type NextStatusStep } from '@/lib/admin/orders-table/status'
import { orderTimeLabel, waitingLabel } from '@/lib/admin/orders-table/time'
import { OrderItemsDisplay } from '@/components/admin/order-items-display'
import { GovDiscountSummary } from '@/components/admin/gov-discount-summary'
import { OrderStatusManagement } from '@/components/admin/order-status-management'
import { OrderKindIcon, PaymentPill, StatusPill } from '@/components/admin/orders-table/pills'
import { printOrderReceipt } from '@/components/admin/orders-table/print-receipt'
import type { OrderWithItems } from '@/lib/orders-service'

const OrderDeliveryCard = dynamic(() => import('@/components/admin/order-delivery-card').then((mod) => ({ default: mod.OrderDeliveryCard })))

// Lazy: only delivery orders show it.
const LalamoveDeliveryPanel = dynamic(
  () => import('@/components/admin/lalamove-delivery-panel').then((mod) => ({ default: mod.LalamoveDeliveryPanel })),
  { ssr: false },
)

export interface OrderDetailPanelProps {
  /** Null closes the panel. */
  order: OrderWithItems | null
  tenantSlug: string
  tenantId: string
  onClose: () => void
  /** Step to the neighbouring rows of the table; omitted at either end. */
  onPrevious?: () => void
  onNext?: () => void
  /** The table's own one-tap step, so the panel and the row move the order the same way. */
  onAdvance?: (order: OrderWithItems, step: NextStatusStep) => void
  isAdvancing?: boolean
  /** A status or payment change from the panel's own menus, once stored. */
  onOrderChanged?: (orderId: string, patch: Pick<Partial<OrderWithItems>, 'status' | 'payment_status'>) => void
}

function Section({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={cn('space-y-3', className)}>
      <h3 className="text-[12px] font-bold tracking-[0.08em] text-wn-stone uppercase">{title}</h3>
      {children}
    </section>
  )
}

function MapLink({ href }: { href: string | null }) {
  if (!href) return null
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1 inline-flex items-center gap-1 text-[13.5px] font-semibold text-wn-coral-deep hover:underline"
    >
      Open in Google Maps
      <ExternalLink className="size-3.5" aria-hidden="true" />
    </a>
  )
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return true
  // An open Select or menu uses the arrow keys itself.
  return target.closest('[role="combobox"],[role="listbox"],[role="menu"]') !== null
}

/**
 * One order, beside the table. Replaces the full-screen dialog (2026-11-21):
 * the list stays in view, ↑/↓ (or K/J) step through it, and the sections read
 * top to bottom in the order staff need them — what to do next, what was
 * ordered, what it came to, who it is for, how it gets there.
 */
export function OrderDetailPanel(props: OrderDetailPanelProps) {
  const { order, onClose } = props
  return (
    <Sheet open={order !== null} onOpenChange={(isOpen) => (isOpen ? undefined : onClose())}>
      <SheetContent side="right" hideCloseButton className="w-full gap-0 overflow-hidden bg-wn-canvas p-0 sm:max-w-[560px]">
        {order && <PanelBody {...props} order={order} />}
      </SheetContent>
    </Sheet>
  )
}

function PanelBody({ order, tenantSlug, tenantId, onClose, onPrevious, onNext, onAdvance, isAdvancing, onOrderChanged }: OrderDetailPanelProps & { order: OrderWithItems }) {
  const [isPrinting, setIsPrinting] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return
      if ((event.key === 'ArrowDown' || event.key === 'j') && onNext) {
        event.preventDefault()
        onNext()
      } else if ((event.key === 'ArrowUp' || event.key === 'k') && onPrevious) {
        event.preventDefault()
        onPrevious()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onNext, onPrevious])

  const row = platformOrderRow(order)
  const step = nextStatusStep(row.status)
  const { time, day } = orderTimeLabel(row.createdAtMs, nowMs)
  const isOpen = step !== null

  // What the customer filled in at checkout, minus the platform's own keys —
  // the same rows the receipt prints, so the panel and the paper agree.
  const customerDetailRows = buildCustomerDetailRows(order.customer_data)
  // ONE row carries the map link: the address widget's own field, else the
  // first row that reads as an address (a store that renamed the question).
  const mapRowKey =
    customerDetailRows.find((detail) => detail.key === DELIVERY_ADDRESS_FIELD_NAME)?.key ??
    customerDetailRows.find((detail) => detail.key.toLowerCase().includes('address'))?.key
  // Keyed on the order TYPE, not on "has a quotation": a delivery whose
  // quotation was never stored or has been cleared still needs the controls,
  // or there is no way to get a new quote for it.
  const hasDelivery = shouldShowLalamoveControls({
    orderType: order.order_type,
    deliveryFee: order.delivery_fee,
    lalamoveQuotationId: order.lalamove_quotation_id,
    lalamoveOrderId: order.lalamove_order_id,
  })
  const itemsCount = order.order_items.reduce((sum, item) => sum + item.quantity, 0)

  async function handlePrint() {
    setIsPrinting(true)
    await printOrderReceipt(order, tenantId, tenantSlug)
    setIsPrinting(false)
  }

  const iconButton =
    'inline-flex size-9 items-center justify-center rounded-xl text-wn-stone outline-none hover:bg-wn-sand hover:text-wn-ink focus-visible:ring-2 focus-visible:ring-wn-ink disabled:pointer-events-none disabled:opacity-30'

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-wn-line bg-white px-5 pt-4 pb-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button type="button" className={iconButton} onClick={onPrevious} disabled={!onPrevious} aria-label="Previous order">
              <ChevronUp aria-hidden className="size-4" />
            </button>
            <button type="button" className={iconButton} onClick={onNext} disabled={!onNext} aria-label="Next order">
              <ChevronDown aria-hidden className="size-4" />
            </button>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handlePrint}
              disabled={isPrinting}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3 text-[13.5px] font-semibold text-wn-ink ring-1 ring-wn-line outline-none hover:bg-wn-sand focus-visible:ring-2 focus-visible:ring-wn-ink disabled:opacity-60"
            >
              <Printer aria-hidden className="size-4" />
              {isPrinting ? 'Preparing…' : 'Print receipt'}
            </button>
            <button type="button" className={iconButton} onClick={onClose} aria-label="Close">
              <X aria-hidden className="size-4" />
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <SheetTitle className="text-[24px] leading-none font-extrabold tracking-[-0.02em] text-wn-ink">Order {row.numberLabel}</SheetTitle>
          <StatusPill status={row.status} />
          <PaymentPill chip={row.payment} />
        </div>
        <SheetDescription className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] text-wn-stone">
          <span>
            {day ? `${day}, ` : ''}
            {time}
            {isOpen && ` · waiting ${waitingLabel(row.createdAtMs, nowMs)}`}
          </span>
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1">
            <OrderKindIcon kind={row.kind} className="size-3.5" />
            {row.typeLabel ?? 'Order'}
            {row.tableNumber && ` · Table ${row.tableNumber}`}
          </span>
          {row.source === 'pos' && (
            <>
              <span aria-hidden>·</span>
              <span>Register</span>
            </>
          )}
        </SheetDescription>

        {(row.scheduledLabel || row.outletLabel) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {row.scheduledLabel && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-[13px] font-semibold text-amber-900 ring-1 ring-amber-200">
                <CalendarClock aria-hidden className="size-4" />
                Pre-order · {row.scheduledLabel}
              </span>
            )}
            {row.outletLabel && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-wn-sand px-2.5 py-1 text-[13px] font-semibold text-wn-ink ring-1 ring-wn-line">
                <Store aria-hidden className="size-4" />
                {row.outletLabel}
              </span>
            )}
          </div>
        )}

        {step && onAdvance && (
          <button
            type="button"
            disabled={isAdvancing}
            onClick={() => onAdvance(order, step)}
            className={cn(
              'mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-bold outline-none focus-visible:ring-2 focus-visible:ring-wn-ink focus-visible:ring-offset-2 disabled:opacity-60',
              row.status === 'pending' ? 'bg-wn-coral text-white hover:bg-wn-coral-deep' : 'bg-wn-ink text-white hover:bg-wn-ink-raised',
            )}
          >
            {isAdvancing && <Loader2 aria-hidden className="size-4 animate-spin" />}
            {step.label} order
          </button>
        )}
      </header>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
        <Section title="Status & payment">
          <div className="rounded-2xl bg-white p-4 ring-1 ring-border">
            <OrderStatusManagement order={order} tenantId={tenantId} tenantSlug={tenantSlug} onChanged={onOrderChanged} />
          </div>
        </Section>

        <Section title={`Items · ${itemsCount}`}>
          <OrderItemsDisplay orderItems={order.order_items} />
        </Section>

        <Section title="Summary">
          {/*
            The subtotal is summed from the ITEMS, not derived from the total:
            `order.total` is stored net of the discount, so a derived subtotal
            contradicts the items above it and no row explains the difference.
          */}
          <div className="space-y-2 rounded-2xl bg-white p-4 text-[14px] ring-1 ring-border tabular-nums">
            {orderSummaryRows({
              subtotal: order.order_items.reduce((sum, item) => sum + Number(item.subtotal ?? 0), 0),
              deliveryFee: Number(order.delivery_fee) || 0,
              serviceCharge: Number(order.service_charge_amount) || 0,
              discount: readOrderDiscount(order),
              total: Number(order.total),
              itemNames: order.order_items.map((item) => item.menu_item_name),
            }).map((summaryRow, index) =>
              summaryRow.kind === 'total' ? (
                <div key={`${summaryRow.kind}-${index}`}>
                  <Separator className="bg-wn-line" />
                  <div className="flex justify-between pt-3 text-[17px] font-extrabold text-wn-ink">
                    <span>Total</span>
                    <span>{formatPrice(summaryRow.amount)}</span>
                  </div>
                </div>
              ) : (
                <div key={`${summaryRow.kind}-${index}`} className="flex justify-between gap-3">
                  <span className="text-wn-stone">
                    {summaryRow.kind === 'subtotal' ? `Subtotal (${itemsCount} items)` : summaryRow.label}
                    {summaryRow.items && <span className="ml-1 text-xs">({discountItemsText(summaryRow.items)})</span>}
                  </span>
                  <span className={summaryRow.kind === 'discount' ? 'font-semibold text-emerald-700' : 'font-semibold text-wn-ink'}>
                    {summaryRow.kind === 'discount' ? '−' : ''}
                    {formatPrice(summaryRow.amount)}
                  </span>
                </div>
              ),
            )}
            <div className="pt-2 empty:hidden">
              <GovDiscountSummary discount={readOrderDiscount(order)} />
            </div>
          </div>
        </Section>

        <Section title="Customer">
          <div className="divide-y divide-wn-line rounded-2xl bg-white ring-1 ring-border">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="font-semibold text-wn-ink">{displayCustomerName(order.customer_name)}</span>
              {order.customer_contact && (
                <a
                  href={`tel:${order.customer_contact}`}
                  className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-wn-coral-deep hover:underline"
                >
                  <Phone aria-hidden className="size-4" />
                  {order.customer_contact}
                </a>
              )}
            </div>
            {customerDetailRows.map((detail) => {
              const isAddress = detail.key.toLowerCase().includes('address')
              return (
                <div key={detail.key} className="flex items-start gap-3 px-4 py-3">
                  {isAddress && <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-wn-stone" />}
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] text-wn-stone">{detail.label}</div>
                    <div className="font-medium break-words text-wn-ink">{detail.value}</div>
                    {detail.key === mapRowKey && <MapLink href={orderMapLink(order.customer_data, detail.value)} />}
                  </div>
                </div>
              )
            })}
          </div>
        </Section>

        {hasDelivery && (
          <Section title="Delivery">
            <OrderDeliveryCard key={order.id} tenantId={tenantId} order={order} />
            <LalamoveDeliveryPanel order={order} tenantId={tenantId} />
          </Section>
        )}
      </div>
    </div>
  )
}
