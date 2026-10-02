/**
 * What the `subscription_payments` ledger says about each client.
 *
 * Pure. The roster knows the paid-through DATE; only the ledger knows whether
 * anyone ever actually paid. Most paid-through dates on the platform were
 * backfilled when subscriptions shipped, so without this a client who has
 * never sent a peso and one who pays every month look the same.
 */

import { toBusinessDayKey } from '@/lib/inventory/business-day'

/** A `subscription_payments` row, as read. */
export interface PaymentLedgerRow {
  tenant_id: string
  amount_php: number | string | null
  period_start: string | null
  period_end: string | null
  paid_at: string | null
  created_at: string | null
  method: string | null
  reference: string | null
}

export interface TenantPaymentSummary {
  paymentCount: number
  totalPaidPhp: number
  /** ISO. */
  lastPaidAt: string | null
  lastAmountPhp: number
  lastMethod: string | null
  /** `YYYY-MM-DD` the last payment ran to. */
  lastPeriodEnd: string | null
}

export interface RecentPayment {
  tenantId: string
  amountPhp: number
  paidAt: string | null
  method: string | null
  reference: string | null
  periodStart: string | null
  periodEnd: string | null
}

export interface MonthCollection {
  /** `YYYY-MM`, Manila. */
  monthKey: string
  amountPhp: number
  count: number
}

function toAmount(value: number | string | null): number {
  const parsed = typeof value === 'string' ? Number(value) : value
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : 0
}

/** When the money arrived, ISO; the record time stands in for a missing date. */
function paidAtOf(row: PaymentLedgerRow): string | null {
  for (const candidate of [row.paid_at, row.created_at]) {
    if (!candidate) continue
    const instant = Date.parse(candidate)
    if (Number.isFinite(instant)) return new Date(instant).toISOString()
  }
  return null
}

function newestFirst(rows: readonly PaymentLedgerRow[]): PaymentLedgerRow[] {
  return [...rows].sort((a, b) => (paidAtOf(b) ?? '').localeCompare(paidAtOf(a) ?? ''))
}

export function summarizePaymentsByTenant(
  rows: readonly PaymentLedgerRow[]
): Map<string, TenantPaymentSummary> {
  const summaries = new Map<string, TenantPaymentSummary>()

  // Newest first, so the first row seen for a tenant is its latest payment.
  for (const row of newestFirst(rows)) {
    const existing = summaries.get(row.tenant_id)
    const amount = toAmount(row.amount_php)
    summaries.set(
      row.tenant_id,
      existing
        ? {
            ...existing,
            paymentCount: existing.paymentCount + 1,
            totalPaidPhp: existing.totalPaidPhp + amount,
          }
        : {
            paymentCount: 1,
            totalPaidPhp: amount,
            lastPaidAt: paidAtOf(row),
            lastAmountPhp: amount,
            lastMethod: row.method,
            lastPeriodEnd: row.period_end,
          }
    )
  }

  return summaries
}

function monthKeyOf(iso: string): string | null {
  try {
    return toBusinessDayKey(iso).slice(0, 7)
  } catch {
    return null
  }
}

/** Money received in the current Manila calendar month. */
export function collectedInMonth(
  rows: readonly PaymentLedgerRow[],
  nowIso: string
): MonthCollection {
  const monthKey = toBusinessDayKey(nowIso).slice(0, 7)

  return rows.reduce<MonthCollection>(
    (acc, row) => {
      const paidAt = paidAtOf(row)
      if (!paidAt || monthKeyOf(paidAt) !== monthKey) return acc
      return {
        ...acc,
        amountPhp: acc.amountPhp + toAmount(row.amount_php),
        count: acc.count + 1,
      }
    },
    { monthKey, amountPhp: 0, count: 0 }
  )
}

export function recentPayments(rows: readonly PaymentLedgerRow[], limit: number): RecentPayment[] {
  return newestFirst(rows)
    .slice(0, limit)
    .map((row) => ({
      tenantId: row.tenant_id,
      amountPhp: toAmount(row.amount_php),
      paidAt: paidAtOf(row),
      method: row.method,
      reference: row.reference,
      periodStart: row.period_start,
      periodEnd: row.period_end,
    }))
}
