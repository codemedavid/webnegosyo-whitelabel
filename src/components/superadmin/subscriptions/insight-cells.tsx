/**
 * The two columns that say what a client is actually doing: whether they are
 * trading, and when money last arrived.
 */

import type { CollectionsInsight } from '@/lib/billing/collections-insight'
import { lastOrderLabel } from '@/lib/activity/last-order-label'
import { toBusinessDayKey } from '@/lib/inventory/business-day'

const peso = (value: number) => `₱${value.toLocaleString('en-PH')}`

function formatPaidDay(iso: string): string {
  return new Date(`${toBusinessDayKey(iso)}T00:00:00.000Z`).toLocaleDateString('en-PH', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function ActivityCell({
  insight,
  nowIso,
  tenantId,
}: {
  insight: CollectionsInsight | undefined
  nowIso: string
  tenantId: string
}) {
  const activity = insight?.activity
  if (!activity || activity.source === 'unsupported') {
    return <td className="px-4 py-3 text-white/30">—</td>
  }
  if (activity.source === 'unreachable') {
    return (
      <td
        className="whitespace-nowrap px-4 py-3 text-xs text-amber-300/80"
        data-testid={`activity-${tenantId}`}
      >
        Couldn&apos;t read orders
      </td>
    )
  }

  return (
    <td className="whitespace-nowrap px-4 py-3" data-testid={`activity-${tenantId}`}>
      <div
        className={`tabular-nums ${activity.orders30d > 0 ? 'font-semibold text-white' : 'text-white/45'}`}
      >
        {activity.orders30d.toLocaleString('en-PH')} {activity.orders30d === 1 ? 'order' : 'orders'}
      </div>
      <div className="text-xs text-white/45">
        last {lastOrderLabel(activity.lastOrderAt, nowIso).toLowerCase()}
      </div>
    </td>
  )
}

export function LastPaymentCell({
  insight,
  tenantId,
}: {
  insight: CollectionsInsight | undefined
  tenantId: string
}) {
  const payment = insight?.payment
  if (!payment?.lastPaidAt) {
    return (
      <td
        className="whitespace-nowrap px-4 py-3 text-xs text-white/45"
        data-testid={`last-payment-${tenantId}`}
      >
        Never paid
      </td>
    )
  }

  return (
    <td className="whitespace-nowrap px-4 py-3" data-testid={`last-payment-${tenantId}`}>
      <div className="text-white/80">{formatPaidDay(payment.lastPaidAt)}</div>
      <div className="text-xs text-white/45">
        {peso(payment.lastAmountPhp)}
        {payment.lastMethod ? ` · ${payment.lastMethod}` : ''}
        {payment.paymentCount > 1 ? ` · ${payment.paymentCount} payments` : ''}
      </div>
    </td>
  )
}
