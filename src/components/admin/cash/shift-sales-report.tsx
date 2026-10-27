import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { cashAndNonCash, type ShiftSalesReceipt, type ShiftSalesReport } from '@/lib/cash/shift-sales'
import { clockLabel, formatMoney } from './cash-format'

/**
 * One shift's sales (P1 deliverable, web side): hero, paid by, order types,
 * items, receipts. Presentational only. A hidden (blind, still open) report
 * shows the receipt list and counts without pesos; an "unavailable" one says
 * the store's orders are not in the platform database — never ₱0.
 */

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[12px] font-bold uppercase tracking-[0.1em] text-wn-stone">{title}</h3>
      {children}
    </section>
  )
}

function Line({ label, value, hint, isStrong = false }: { label: string; value: string; hint?: string; isStrong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className={cn('min-w-0 truncate text-[14px]', isStrong ? 'font-bold text-wn-ink' : 'text-wn-ink')}>
        {label}
        {hint && <span className="ml-1.5 text-[12.5px] text-wn-stone">{hint}</span>}
      </span>
      <span className={cn('shrink-0 tabular-nums text-[14px]', isStrong ? 'font-extrabold text-wn-ink' : 'font-semibold text-wn-ink')}>{value}</span>
    </div>
  )
}

const STATUS_TEXT: Readonly<Record<ShiftSalesReceipt['status'], string>> = {
  paid: 'Paid',
  unpaid: 'Unpaid',
  void: 'Void',
  refunded: 'Refunded',
}

function ReceiptRow({ receipt }: { receipt: ShiftSalesReceipt }) {
  const isStruck = receipt.status === 'void'
  return (
    <li className="flex items-center gap-3 py-2">
      <span className="w-12 shrink-0 font-mono text-[13px] font-bold tabular-nums text-wn-ink">{receipt.number}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] text-wn-ink">
          {clockLabel(receipt.placedAt)}
          {receipt.orderTypeLabel && ` · ${receipt.orderTypeLabel}`}
        </span>
        <span className="block truncate text-[12.5px] text-wn-stone">
          {receipt.methodLabel ?? 'Method not recorded'} · {STATUS_TEXT[receipt.status]}
        </span>
      </span>
      <span className={cn('shrink-0 text-[13.5px] font-semibold tabular-nums text-wn-ink', isStruck && 'text-wn-stone line-through')}>
        {receipt.totalCents === null ? 'Hidden' : formatMoney(receipt.totalCents, { centavos: true })}
      </span>
    </li>
  )
}

export function ShiftSalesUnavailable() {
  return (
    <p className="rounded-xl bg-wn-sand px-4 py-3 text-[13.5px] leading-snug text-wn-stone ring-1 ring-wn-line">
      Not loaded. This store’s orders are kept outside WebNegosyo’s main database, so shift sales show in the app’s Drawer
      for now.
    </p>
  )
}

export function ShiftSalesReportView({ report }: { report: ShiftSalesReport }) {
  if (report.source === 'unavailable') return <ShiftSalesUnavailable />
  const summary = report.summary
  const split = cashAndNonCash(report)
  const range = report.firstNumber && report.lastNumber ? `${report.firstNumber} – ${report.lastNumber}` : null

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl bg-wn-ink px-5 py-4 text-white">
        <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-white/70">Net sales this shift</p>
        <p className="mt-1 text-[32px] font-extrabold leading-tight tracking-[-0.02em] tabular-nums">
          {report.hidden ? 'Hidden · blind count' : formatMoney(summary?.netCents ?? null)}
        </p>
        <p className="mt-1 text-[13px] text-white/75 tabular-nums">
          {report.receipts.length} {report.receipts.length === 1 ? 'receipt' : 'receipts'}
          {range && ` · ${range}`}
          {summary && summary.voidCount > 0 && ` · ${summary.voidCount} void`}
        </p>
        {report.hidden && (
          <p className="mt-2 text-[13px] text-white/75">The pesos show once the cashier has counted the drawer.</p>
        )}
      </div>

      {summary && (
        <Block title="Totals">
          <div className="divide-y divide-wn-line">
            <Line label="Gross sales" value={formatMoney(summary.grossCents)} />
            {summary.discountCents !== 0 && <Line label="Discounts" value={formatMoney(-summary.discountCents)} />}
            <Line label="Net sales" value={formatMoney(summary.netCents)} isStrong />
            <Line label="Collected" value={formatMoney(summary.collectedCents)} />
            {summary.unpaidCents > 0 && <Line label="Still unpaid" value={formatMoney(summary.unpaidCents)} />}
            {summary.overpaidCents > 0 && <Line label="Overpaid" value={formatMoney(summary.overpaidCents)} />}
            {summary.voidCount > 0 && <Line label="Voids" hint={`${summary.voidCount}`} value={formatMoney(summary.voidCents)} />}
            {summary.refundCents > 0 && <Line label="Change given back" value={formatMoney(summary.refundCents)} />}
          </div>
        </Block>
      )}

      {report.payments && report.payments.length > 0 && (
        <Block title="Paid by">
          <div className="divide-y divide-wn-line">
            {report.payments.map((payment) => (
              <Line key={payment.key} label={payment.label} hint={`${payment.count}`} value={formatMoney(payment.cents)} />
            ))}
            {split && <Line label="Cash · Non-cash" value={`${formatMoney(split.cashCents)} · ${formatMoney(split.nonCashCents)}`} isStrong />}
          </div>
        </Block>
      )}

      {report.orderTypes && report.orderTypes.length > 0 && (
        <Block title="Order types">
          <div className="divide-y divide-wn-line">
            {report.orderTypes.map((group) => (
              <Line key={group.key} label={group.label} hint={`${group.orders}`} value={formatMoney(group.netCents)} />
            ))}
          </div>
        </Block>
      )}

      {report.items && report.items.length > 0 && (
        <Block title="Items">
          <div className="divide-y divide-wn-line">
            {report.items.slice(0, 15).map((item) => (
              <Line key={item.label} label={item.label} hint={`× ${item.quantity}`} value={formatMoney(item.netCents)} />
            ))}
          </div>
        </Block>
      )}

      <Block title="Receipts">
        {report.receipts.length === 0 ? (
          <p className="text-[14px] text-wn-stone">Nothing rung up on this shift.</p>
        ) : (
          <ul className="divide-y divide-wn-line">
            {report.receipts.map((receipt) => (
              <ReceiptRow key={receipt.orderId} receipt={receipt} />
            ))}
          </ul>
        )}
        {report.receiptsTruncated && (
          <p className="text-[12.5px] text-wn-stone">Showing the first {report.receipts.length}. The totals above count every receipt.</p>
        )}
      </Block>
    </div>
  )
}
