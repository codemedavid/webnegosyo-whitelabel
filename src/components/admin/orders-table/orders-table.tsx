'use client'

import type { ReactNode } from 'react'
import { CalendarClock, ChevronRight, Loader2, MoreHorizontal, Printer, Smartphone, Store, SquareArrowOutUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatPrice } from '@/lib/cart-utils'
import { nextStatusStep, type NextStatusStep } from '@/lib/admin/orders-table/status'
import type { OrdersTableRow } from '@/lib/admin/orders-table/row-model'
import { isLateNewOrder, orderTimeLabel, waitingLabel } from '@/lib/admin/orders-table/time'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { OrderKindIcon, PaymentPill, StatusPill } from './pills'

export interface OrdersTableProps {
  rows: readonly OrdersTableRow[]
  /** The clock the waiting times are read against; ticks in the parent. */
  nowMs: number
  onOpen: (id: string) => void
  /** Omit to show no step buttons (an account that may not change orders). */
  onAdvance?: (row: OrdersTableRow, step: NextStatusStep) => void
  /** Omit to hide the row menu's Print. */
  onPrint?: (id: string) => void
  selectedId?: string | null
  /** Rows that just arrived, briefly highlighted. */
  freshIds?: ReadonlySet<string>
  /** Rows with a status change in flight. */
  busyIds?: ReadonlySet<string>
  /** Convex keeps no item names; the cell then says "3 items". */
  hasItemNames: boolean
  /** Dims the rows while a new page or filter loads. */
  isLoading?: boolean
  empty: ReactNode
  caption: string
}

const OPEN_STATUSES = new Set(['pending', 'confirmed', 'preparing', 'ready'])

function itemsCell(row: OrdersTableRow, hasItemNames: boolean): string {
  if (!hasItemNames || !row.itemsText) return `${row.itemCount} ${row.itemCount === 1 ? 'item' : 'items'}`
  return row.moreItems > 0 ? `${row.itemsText} +${row.moreItems} more` : row.itemsText
}

function typeText(row: OrdersTableRow): string {
  const parts = [row.typeLabel ?? 'Order']
  if (row.tableNumber) parts.push(`Table ${row.tableNumber}`)
  return parts.join(' · ')
}

function TimeCell({ row, nowMs }: { row: OrdersTableRow; nowMs: number }) {
  const { time, day } = orderTimeLabel(row.createdAtMs, nowMs)
  const isOpen = OPEN_STATUSES.has(row.status)
  const isLate = row.status === 'pending' && isLateNewOrder(row.createdAtMs, nowMs)
  return (
    <span className="block text-[12.5px] whitespace-nowrap text-wn-stone">
      {day ? `${day}, ` : ''}
      {time}
      {isOpen && !day && (
        // The clock ticks in the browser; the server render is a few seconds older.
        <span suppressHydrationWarning className={cn(isLate && 'font-bold text-wn-coral-deep')}>
          {' · '}
          {waitingLabel(row.createdAtMs, nowMs)}
        </span>
      )}
    </span>
  )
}

function StepButton({
  row,
  isBusy,
  onAdvance,
  className,
}: {
  row: OrdersTableRow
  isBusy: boolean
  onAdvance?: OrdersTableProps['onAdvance']
  className?: string
}) {
  const step = nextStatusStep(row.status)
  if (!step || !onAdvance) return null
  const isPrimary = row.status === 'pending'
  return (
    <button
      type="button"
      disabled={isBusy}
      aria-label={`${step.label} order ${row.numberLabel}`}
      onClick={(event) => {
        event.stopPropagation()
        onAdvance(row, step)
      }}
      className={cn(
        'inline-flex min-h-9 min-w-[92px] items-center justify-center gap-1.5 rounded-xl px-3 text-[13.5px] font-bold whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-wn-ink focus-visible:ring-offset-1 disabled:opacity-60',
        isPrimary ? 'bg-wn-coral text-white hover:bg-wn-coral-deep' : 'bg-white text-wn-ink ring-1 ring-wn-line hover:bg-wn-sand',
        className,
      )}
    >
      {isBusy && <Loader2 aria-hidden className="size-3.5 animate-spin" />}
      {step.label}
    </button>
  )
}

function RowMenu({ row, onOpen, onPrint }: { row: OrdersTableRow; onOpen: (id: string) => void; onPrint?: (id: string) => void }) {
  if (!onPrint) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`More for order ${row.numberLabel}`}
        onClick={(event) => event.stopPropagation()}
        className="inline-flex size-9 items-center justify-center rounded-xl text-wn-stone outline-none hover:bg-wn-sand hover:text-wn-ink focus-visible:ring-2 focus-visible:ring-wn-ink"
      >
        <MoreHorizontal aria-hidden className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
        <DropdownMenuItem onSelect={() => onOpen(row.id)}>
          <SquareArrowOutUpRight aria-hidden className="size-4" />
          Open order
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onPrint(row.id)}>
          <Printer aria-hidden className="size-4" />
          Print receipt
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function TotalCell({ row }: { row: OrdersTableRow }) {
  return (
    <>
      <span className={cn('block font-bold', row.status === 'cancelled' && 'text-wn-stone line-through')}>{formatPrice(row.total)}</span>
      {row.discountTotal > 0 && <span className="block text-[12px] text-emerald-700">−{formatPrice(row.discountTotal)} off</span>}
    </>
  )
}

function Badges({ row }: { row: OrdersTableRow }) {
  if (!row.scheduledLabel && !row.outletLabel) return null
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {row.scheduledLabel && (
        <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[11.5px] font-semibold text-amber-900 ring-1 ring-amber-200">
          <CalendarClock aria-hidden className="size-3" />
          {row.scheduledLabel}
        </span>
      )}
      {row.outletLabel && (
        <span className="inline-flex items-center gap-1 rounded-md bg-wn-sand px-1.5 py-0.5 text-[11.5px] font-semibold text-wn-stone ring-1 ring-wn-line">
          <Store aria-hidden className="size-3" />
          {row.outletLabel}
        </span>
      )}
    </span>
  )
}

export function OrdersTable(props: OrdersTableProps) {
  const { rows, nowMs, onOpen, onAdvance, onPrint, selectedId, freshIds, busyIds, hasItemNames, isLoading, empty, caption } = props

  if (rows.length === 0) {
    return <div className="rounded-2xl bg-white ring-1 ring-border">{empty}</div>
  }

  return (
    <div className={cn('transition-opacity', isLoading && 'pointer-events-none opacity-60')} aria-busy={isLoading || undefined}>
      {/* Desktop and tablet: a real table, newest first. */}
      <div className="hidden overflow-x-auto rounded-2xl bg-white ring-1 ring-border md:block">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-wn-line text-[12px] font-bold tracking-[0.08em] text-wn-stone uppercase">
              <th scope="col" className="py-3 pr-3 pl-5">Order</th>
              <th scope="col" className="px-3 py-3">Customer</th>
              <th scope="col" className="px-3 py-3">Type</th>
              <th scope="col" className="hidden px-3 py-3 xl:table-cell">Items</th>
              <th scope="col" className="px-3 py-3 text-right">Total</th>
              <th scope="col" className="px-3 py-3">Status</th>
              <th scope="col" className="py-3 pr-4 pl-3 text-right">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="text-[14px] text-wn-ink tabular-nums">
            {rows.map((row) => {
              const isNew = row.status === 'pending'
              const isSelected = row.id === selectedId
              return (
                <tr
                  key={row.id}
                  onClick={() => onOpen(row.id)}
                  className={cn(
                    'cursor-pointer border-b border-wn-line align-top transition-colors duration-700 last:border-b-0 hover:bg-wn-sand/60',
                    isSelected && 'bg-wn-sand',
                    freshIds?.has(row.id) && 'bg-wn-coral-wash',
                  )}
                >
                  <td className={cn('py-3 pr-3 pl-5', isNew && 'shadow-[inset_3px_0_0_var(--color-wn-coral)]')}>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        onOpen(row.id)
                      }}
                      className="rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-wn-ink"
                    >
                      <span className="flex items-center gap-1.5 text-[15px] font-extrabold">
                        {row.numberLabel}
                        {row.source === 'pos' && (
                          <span className="rounded bg-wn-sand px-1 text-[10.5px] font-bold tracking-wide text-wn-stone uppercase ring-1 ring-wn-line">POS</span>
                        )}
                        {row.source === 'mobile' && <Smartphone aria-label="App order" className="size-3.5 text-wn-stone" />}
                      </span>
                      <TimeCell row={row} nowMs={nowMs} />
                    </button>
                  </td>
                  <td className="max-w-[220px] px-3 py-3">
                    <span className="block truncate font-semibold">{row.customerName}</span>
                    {row.customerContact && <span className="block truncate text-[12.5px] text-wn-stone">{row.customerContact}</span>}
                  </td>
                  <td className="max-w-[200px] px-3 py-3">
                    <span className="flex items-center gap-1.5">
                      <OrderKindIcon kind={row.kind} />
                      <span className="truncate">{typeText(row)}</span>
                    </span>
                    <Badges row={row} />
                  </td>
                  <td className="hidden max-w-[260px] px-3 py-3 text-wn-stone xl:table-cell">
                    <span className="line-clamp-2">{itemsCell(row, hasItemNames)}</span>
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <TotalCell row={row} />
                    <PaymentPill chip={row.payment} className="mt-1" />
                  </td>
                  <td className="px-3 py-3">
                    <StatusPill status={row.status} />
                  </td>
                  <td className="py-3 pr-4 pl-3">
                    <span className="flex items-center justify-end gap-1">
                      <StepButton row={row} isBusy={busyIds?.has(row.id) ?? false} onAdvance={onAdvance} />
                      <RowMenu row={row} onOpen={onOpen} onPrint={onPrint} />
                      {!onPrint && <ChevronRight aria-hidden className="size-4 text-wn-stone" />}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Phones: compact two-line rows, the step button under the thumb. */}
      <ul aria-label={caption} className="divide-y divide-wn-line overflow-hidden rounded-2xl bg-white ring-1 ring-border md:hidden">
        {rows.map((row) => (
          <li
            key={row.id}
            className={cn(
              'transition-colors duration-700',
              row.status === 'pending' && 'shadow-[inset_3px_0_0_var(--color-wn-coral)]',
              freshIds?.has(row.id) && 'bg-wn-coral-wash',
              row.id === selectedId && 'bg-wn-sand',
            )}
          >
            <div className="flex items-start gap-3 px-4 py-3">
              <button
                type="button"
                onClick={() => onOpen(row.id)}
                className="min-w-0 flex-1 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-wn-ink"
              >
                <span className="flex items-baseline gap-2">
                  <span className="text-[15px] font-extrabold text-wn-ink">{row.numberLabel}</span>
                  <span className="truncate text-[14.5px] font-semibold text-wn-ink">{row.customerName}</span>
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-wn-stone">
                  <OrderKindIcon kind={row.kind} className="size-3.5" />
                  <span className="truncate">{typeText(row)}</span>
                </span>
                <TimeCell row={row} nowMs={nowMs} />
                <Badges row={row} />
              </button>
              <div className="flex shrink-0 flex-col items-end gap-1.5 text-right tabular-nums">
                <TotalCell row={row} />
                <span className="flex flex-wrap justify-end gap-1">
                  <StatusPill status={row.status} />
                  <PaymentPill chip={row.payment} />
                </span>
                <StepButton row={row} isBusy={busyIds?.has(row.id) ?? false} onAdvance={onAdvance} className="mt-0.5" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
