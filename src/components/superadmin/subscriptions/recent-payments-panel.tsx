/**
 * The last payments written into the ledger — what actually came in, and for
 * which month. Server-rendered; there is nothing to click.
 */

import type { RecentPayment } from '@/lib/billing/payment-history'
import { Panel, SectionHeader } from '@/components/superadmin/ui/primitives'

const peso = (value: number) => `₱${value.toLocaleString('en-PH')}`

function formatDayKey(dayKey: string | null): string {
  if (!dayKey) return '—'
  return new Date(`${dayKey}T00:00:00.000Z`).toLocaleDateString('en-PH', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
  })
}

function formatPaidAt(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

interface RecentPaymentsPanelProps {
  payments: readonly RecentPayment[]
  tenantNames: Readonly<Record<string, string>>
}

export function RecentPaymentsPanel({ payments, tenantNames }: RecentPaymentsPanelProps) {
  return (
    <Panel padding="p-0">
      <SectionHeader
        className="px-6 pt-6"
        title="Recent payments"
        subtitle="Newest first, straight from the payment ledger."
      />
      {payments.length === 0 ? (
        <p className="px-6 py-10 text-center text-sm text-white/55">No payments recorded yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-y border-white/10 bg-white/[0.02] text-left text-[11px] font-semibold uppercase tracking-wider text-white/45">
                <th className="px-6 py-2.5">Paid</th>
                <th className="px-4 py-2.5">Tenant</th>
                <th className="px-4 py-2.5 text-right">Amount</th>
                <th className="px-4 py-2.5">Method</th>
                <th className="px-4 py-2.5">Reference</th>
                <th className="px-6 py-2.5">Covers</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {payments.map((payment, index) => (
                <tr key={`${payment.tenantId}-${payment.paidAt}-${index}`}>
                  <td className="whitespace-nowrap px-6 py-3 text-white/60">
                    {formatPaidAt(payment.paidAt)}
                  </td>
                  <td className="px-4 py-3 font-medium text-white">
                    {tenantNames[payment.tenantId] ?? 'Deleted tenant'}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-emerald-400">
                    {peso(payment.amountPhp)}
                  </td>
                  <td className="px-4 py-3 capitalize text-white/60">{payment.method ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-white/55">
                    {payment.reference ?? '—'}
                  </td>
                  <td className="whitespace-nowrap px-6 py-3 text-white/60">
                    {formatDayKey(payment.periodStart)} – {formatDayKey(payment.periodEnd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}
