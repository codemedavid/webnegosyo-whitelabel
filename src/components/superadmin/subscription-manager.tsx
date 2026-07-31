'use client'

/**
 * The collections table.
 *
 * Ordering and totals come from `subscription-roster.ts` — this only renders
 * them. A screen that re-derived who was overdue beside the JSX would be a
 * second opinion on the same subscription, and the platform owner would have
 * two answers with no way to choose.
 */

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { RosterRow, RosterSummary } from '@/lib/billing/subscription-roster'
import { MarkPaidDialog } from '@/components/superadmin/mark-paid-dialog'

const STATE_STYLES: Record<RosterRow['state'], string> = {
  active: 'bg-emerald-100 text-emerald-800',
  grace: 'bg-amber-100 text-amber-900',
  paused: 'bg-red-100 text-red-800',
}

const STATE_LABELS: Record<RosterRow['state'], string> = {
  active: 'Paid',
  grace: 'In grace',
  paused: 'Paused',
}

const peso = (value: number) => `₱${value.toLocaleString('en-PH')}`

interface SubscriptionManagerProps {
  rows: RosterRow[]
  summary: RosterSummary
}

export function SubscriptionManager({ rows, summary }: SubscriptionManagerProps) {
  const router = useRouter()
  const [selected, setSelected] = useState<RosterRow | null>(null)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Paying" value={String(summary.active)} />
        <Stat label="In grace" value={String(summary.inGrace)} />
        <Stat label="Paused" value={String(summary.paused)} />
        <Stat label="MRR" value={peso(summary.mrrPhp)} />
      </div>

      {summary.overduePhp > 0 && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {peso(summary.overduePhp)} outstanding across {summary.inGrace + summary.paused}{' '}
          {summary.inGrace + summary.paused === 1 ? 'tenant' : 'tenants'}.
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-neutral-200">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3">Tenant</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Paid through</th>
              <th className="px-4 py-3">Overdue</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.map((row) => (
              <tr key={row.tenantId}>
                <td className="px-4 py-3">
                  <div className="font-medium text-neutral-900">{row.name}</div>
                  <div className="text-xs text-neutral-500">/{row.slug}</div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-semibold ${STATE_STYLES[row.state]}`}
                  >
                    {STATE_LABELS[row.state]}
                  </span>
                </td>
                <td className="px-4 py-3 text-neutral-600">{row.paidThroughDayKey ?? '—'}</td>
                <td className="px-4 py-3 text-neutral-600">
                  {row.daysOverdue > 0 ? `${row.daysOverdue}d` : '—'}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => setSelected(row)}
                    className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Mark paid
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <MarkPaidDialog
          tenantId={selected.tenantId}
          tenantName={selected.name}
          monthlyPricePhp={selected.monthlyPricePhp}
          onClose={() => setSelected(null)}
          onRecorded={() => router.refresh()}
        />
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-neutral-900">{value}</p>
    </div>
  )
}
