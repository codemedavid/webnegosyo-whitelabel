'use client'

/**
 * The collections table.
 *
 * Ordering and totals come from `subscription-roster.ts` — this only renders
 * them. A screen that re-derived who was overdue beside the JSX would be a
 * second opinion on the same subscription, and the platform owner would have
 * two answers with no way to choose.
 *
 * The one question this screen exists to answer is "who do I chase today?", so
 * the chase list is one click away and the money owed is split from the money
 * merely expected. A blended figure would let a debt read as a forecast.
 */

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import type { RosterRow, RosterSummary } from '@/lib/billing/subscription-roster'
import { DUE_SOON_WINDOW_DAYS } from '@/lib/billing/subscription-roster'
import { setTenantPausedAction } from '@/app/actions/subscriptions'
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

/** Anyone the owner has a reason to contact about money. */
function needsChasing(row: RosterRow): boolean {
  return row.state !== 'active' || row.isDueSoon
}

interface SubscriptionManagerProps {
  rows: RosterRow[]
  summary: RosterSummary
}

export function SubscriptionManager({ rows, summary }: SubscriptionManagerProps) {
  const router = useRouter()
  const [selected, setSelected] = useState<RosterRow | null>(null)
  const [isChaseOnly, setIsChaseOnly] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingTenantId, setPendingTenantId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const visibleRows = useMemo(
    () => (isChaseOnly ? rows.filter(needsChasing) : rows),
    [rows, isChaseOnly]
  )

  const chaseCount = useMemo(() => rows.filter(needsChasing).length, [rows])

  const handlePausedChange = (row: RosterRow, isPaused: boolean) => {
    setError(null)
    setPendingTenantId(row.tenantId)

    startTransition(async () => {
      const result = await setTenantPausedAction(row.tenantId, isPaused)
      setPendingTenantId(null)

      // Never silent: the owner walking away believing a store is shut when it
      // is still trading is the worst outcome this screen can produce.
      if (!result.success) {
        setError(result.error)
        return
      }

      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Stat label="Paying" value={String(summary.active)} />
        <Stat
          label={`Due in ${DUE_SOON_WINDOW_DAYS}d`}
          value={String(summary.dueSoon)}
          testId="stat-due-soon"
        />
        <Stat label="In grace" value={String(summary.inGrace)} />
        <Stat label="Paused" value={String(summary.paused)} />
        <Stat label="MRR" value={peso(summary.mrrPhp)} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-neutral-200 p-1">
          <FilterTab
            label="All tenants"
            isActive={!isChaseOnly}
            onClick={() => setIsChaseOnly(false)}
          />
          <FilterTab
            label={`Needs payment (${chaseCount})`}
            isActive={isChaseOnly}
            onClick={() => setIsChaseOnly(true)}
          />
        </div>

        {summary.dueSoonPhp > 0 && (
          <p className="text-sm text-neutral-600">
            {peso(summary.dueSoonPhp)} due within {DUE_SOON_WINDOW_DAYS} days.
          </p>
        )}
      </div>

      {summary.overduePhp > 0 && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {peso(summary.overduePhp)} outstanding across {summary.inGrace + summary.paused}{' '}
          {summary.inGrace + summary.paused === 1 ? 'tenant' : 'tenants'}.
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {visibleRows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-200 px-4 py-10 text-center text-sm text-neutral-500">
          Nobody needs chasing — every tenant is paid beyond the next{' '}
          {DUE_SOON_WINDOW_DAYS} days.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-200">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3">Tenant</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Paid through</th>
                <th className="px-4 py-3">Due in</th>
                <th className="px-4 py-3">Overdue</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {visibleRows.map((row) => (
                <tr key={row.tenantId} className={row.isDueSoon ? 'bg-amber-50/40' : undefined}>
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
                  <td className="px-4 py-3">
                    {row.daysUntilDue === null ? (
                      <span className="text-neutral-600">—</span>
                    ) : (
                      <span
                        className={
                          row.isDueSoon ? 'font-semibold text-amber-800' : 'text-neutral-600'
                        }
                      >
                        {row.daysUntilDue}d
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">
                    {row.daysOverdue > 0 ? `${row.daysOverdue}d` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setSelected(row)}
                        className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white"
                      >
                        Mark paid
                      </button>

                      {/* Resume is offered ONLY where the owner did the
                          pausing. A tenant the dates closed needs paying, and
                          a Resume button on that row would be a one-click way
                          to hand back access for nothing. */}
                      <button
                        type="button"
                        onClick={() => handlePausedChange(row, !row.isManuallyPaused)}
                        disabled={isPending && pendingTenantId === row.tenantId}
                        className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                      >
                        {row.isManuallyPaused ? 'Resume' : 'Pause'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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

function FilterTab({
  label,
  isActive,
  onClick,
}: {
  label: string
  isActive: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
        isActive ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'
      }`}
    >
      {label}
    </button>
  )
}

function Stat({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4" data-testid={testId}>
      <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-neutral-900">{value}</p>
    </div>
  )
}
