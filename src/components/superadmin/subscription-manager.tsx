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
import type { AllowanceRow } from '@/lib/billing/tenant-allowances'
import { MarkPaidDialog } from '@/components/superadmin/mark-paid-dialog'
import { BillingAnchorDialog } from '@/components/superadmin/billing-anchor-dialog'
import { AllowanceDialog } from '@/components/superadmin/allowance-dialog'
import { Panel } from '@/components/superadmin/ui/primitives'

/**
 * Translucent fills rather than solid pastels: this screen sits on the pure
 * black superadmin shell, where a `bg-emerald-100` pill reads as a lamp.
 */
const STATE_STYLES: Record<RosterRow['state'], string> = {
  active: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-400',
  grace: 'border-amber-400/20 bg-amber-400/10 text-amber-300',
  paused: 'border-red-400/20 bg-red-400/10 text-red-400',
}

const STATE_LABELS: Record<RosterRow['state'], string> = {
  active: 'Paid',
  grace: 'In grace',
  paused: 'Paused',
}

/**
 * What closed this tenant, in the owner's words.
 *
 * `state` collapses three situations into `paused`, which is right for deciding
 * access and wrong for a human reading the row: a cancelled client and one who
 * simply forgot to pay call for different conversations.
 */
function statusLabel(row: RosterRow): string {
  if (row.manualBlock === 'cancelled') return 'Cancelled'
  if (row.state === 'paused' && row.manualBlock === null) return 'Lapsed'
  return STATE_LABELS[row.state]
}

/** Every non-primary row button. One string so the three cannot drift apart. */
const SECONDARY_ACTION =
  'whitespace-nowrap rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/70 transition-colors hover:border-white/25 hover:bg-white/[0.06] hover:text-white'

const peso = (value: number) => `₱${value.toLocaleString('en-PH')}`

/**
 * A `YYYY-MM-DD` as a short human date.
 *
 * Formatted in UTC from a UTC-parsed date so the label cannot drift a day
 * either way: these are calendar dates, not instants. The same reasoning as
 * `formatDay` on the merchant-facing subscription page.
 */
function formatDayKey(dayKey: string | null): string {
  if (!dayKey) return '—'
  return new Date(`${dayKey}T00:00:00.000Z`).toLocaleDateString('en-PH', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** Anyone the owner has a reason to contact about money. */
function needsChasing(row: RosterRow): boolean {
  return row.state !== 'active' || row.isDueSoon
}

/**
 * Usage against allowance, in a cell.
 *
 * `used / limit`, because the allowance alone tells the owner nothing about
 * whether raising it would change anything. Over the line is marked but never
 * blocked — a tenant above a lowered allowance keeps what it has.
 */
function AllowanceCell({
  used,
  limit,
  isOver,
  testId,
}: {
  used: number
  limit: number
  isOver: boolean
  testId: string
}) {
  return (
    <td
      className="whitespace-nowrap px-4 py-3"
      data-testid={testId}
      data-over={isOver ? 'true' : 'false'}
    >
      <span className={isOver ? 'font-semibold text-amber-300' : 'text-white/60'}>
        {used} / {limit}
      </span>
    </td>
  )
}

interface SubscriptionManagerProps {
  rows: RosterRow[]
  summary: RosterSummary
  /**
   * Allowance usage per tenant. Optional so the screen still renders if a
   * caller has not been taught to supply it — a missing count must not blank
   * the collections table, which is the job this screen cannot fail at.
   */
  allowances?: readonly AllowanceRow[]
}

export function SubscriptionManager({ rows, summary, allowances }: SubscriptionManagerProps) {
  const router = useRouter()
  const [selected, setSelected] = useState<RosterRow | null>(null)
  const [editingAllowance, setEditingAllowance] = useState<AllowanceRow | null>(null)
  const [editingAnchor, setEditingAnchor] = useState<RosterRow | null>(null)
  const [isChaseOnly, setIsChaseOnly] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingTenantId, setPendingTenantId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const visibleRows = useMemo(
    () => (isChaseOnly ? rows.filter(needsChasing) : rows),
    [rows, isChaseOnly]
  )

  const chaseCount = useMemo(() => rows.filter(needsChasing).length, [rows])

  const allowanceByTenant = useMemo(
    () => new Map((allowances ?? []).map((allowance) => [allowance.tenantId, allowance])),
    [allowances]
  )

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
        <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1">
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
          <p className="text-sm text-white/55">
            {peso(summary.dueSoonPhp)} due within {DUE_SOON_WINDOW_DAYS} days.
          </p>
        )}
      </div>

      {summary.overduePhp > 0 && (
        <p className="rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
          {peso(summary.overduePhp)} outstanding across {summary.inGrace + summary.paused}{' '}
          {summary.inGrace + summary.paused === 1 ? 'tenant' : 'tenants'}.
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300"
        >
          {error}
        </p>
      )}

      {visibleRows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-white/15 px-4 py-12 text-center text-sm text-white/55">
          Nobody needs chasing — every tenant is paid beyond the next{' '}
          {DUE_SOON_WINDOW_DAYS} days.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.02]">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.02] text-left text-[11px] font-semibold uppercase tracking-wider text-white/45">
                <th className="px-4 py-2.5">Tenant</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="whitespace-nowrap px-4 py-2.5">Billing since</th>
                <th className="whitespace-nowrap px-4 py-2.5">Paid through</th>
                <th className="whitespace-nowrap px-4 py-2.5">Due in</th>
                <th className="px-4 py-2.5">Overdue</th>
                <th className="px-4 py-2.5">Branches</th>
                {/* Named for the branch it reports, not the store: the number
                    is the fullest single branch, which is the one that would
                    refuse the next hire. */}
                <th className="whitespace-nowrap px-4 py-2.5">Staff / busiest</th>
                <th className="px-4 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {visibleRows.map((row) => (
                <tr
                  key={row.tenantId}
                  className={
                    row.isDueSoon
                      ? 'bg-amber-400/[0.06] transition-colors hover:bg-amber-400/10'
                      : 'transition-colors hover:bg-white/[0.03]'
                  }
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{row.name}</div>
                    <div className="text-xs text-white/45">
                      {/* The dim ink is named on the slug itself, not merely
                          inherited: this row sits on a pure black shell, and a
                          later refactor that lifts the span out of this div
                          must not silently take its legibility with it. */}
                      <span className="text-white/45">/{row.slug}</span>
                      {row.joinedDayKey && (
                        <span data-testid={`joined-${row.tenantId}`}>
                          {` · joined ${formatDayKey(row.joinedDayKey)}`}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${STATE_STYLES[row.state]}`}
                    >
                      {statusLabel(row)}
                    </span>
                  </td>
                  {/* Clickable, because it is the one date on this row the
                      owner sets rather than reads. An unanchored client shows
                      the prompt instead of an em dash: "—" reads as missing
                      data, when it actually means a billing rule that has not
                      been chosen yet. */}
                  <td className="whitespace-nowrap px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setEditingAnchor(row)}
                      data-testid={`billing-anchor-${row.tenantId}`}
                      className="rounded-lg px-2 py-1 text-left text-white/60 underline decoration-white/20 underline-offset-4 transition-colors hover:bg-white/[0.06] hover:text-white"
                    >
                      {row.anchorDayKey ? formatDayKey(row.anchorDayKey) : 'Set date'}
                    </button>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums text-white/60">
                    {row.paidThroughDayKey ?? '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                    {row.daysUntilDue === null ? (
                      <span className="text-white/60">—</span>
                    ) : (
                      <span
                        className={
                          row.isDueSoon ? 'font-semibold text-amber-300' : 'text-white/60'
                        }
                      >
                        {row.daysUntilDue}d
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums text-white/60">
                    {row.daysOverdue > 0 ? `${row.daysOverdue}d` : '—'}
                  </td>
                  {(() => {
                    const allowance = allowanceByTenant.get(row.tenantId)
                    if (!allowance) {
                      return (
                        <>
                          <td className="px-4 py-3 text-white/30">—</td>
                          <td className="px-4 py-3 text-white/30">—</td>
                        </>
                      )
                    }
                    return (
                      <>
                        <AllowanceCell
                          used={allowance.outletsUsed}
                          limit={allowance.outletLimit}
                          isOver={allowance.isOverOutlets}
                          testId={`allowance-outlets-${row.tenantId}`}
                        />
                        <AllowanceCell
                          used={allowance.peakBranchStaff}
                          limit={allowance.staffLimit}
                          isOver={allowance.isOverStaff}
                          testId={`allowance-staff-${row.tenantId}`}
                        />
                      </>
                    )
                  })()}
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setSelected(row)}
                        className="whitespace-nowrap rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-black transition-opacity hover:opacity-90"
                      >
                        Mark paid
                      </button>

                      {allowanceByTenant.has(row.tenantId) && (
                        <button
                          type="button"
                          data-testid={`allowance-edit-${row.tenantId}`}
                          onClick={() =>
                            setEditingAllowance(allowanceByTenant.get(row.tenantId) ?? null)
                          }
                          className={SECONDARY_ACTION}
                        >
                          Allowances
                        </button>
                      )}

                      {/* Exactly one row in three gets a lever.
                          - hand-paused: Resume, because the owner pulled it.
                          - cancelled:   nothing. Resume would write `active`
                            and resurrect a closed account; Pause would write a
                            status nobody chose. Reopening is a decision, not a
                            click on a collections table.
                          - everyone else: Pause. A tenant the dates closed
                            needs paying, so they get no way back in here. */}
                      {row.manualBlock !== 'cancelled' && (
                        <button
                          type="button"
                          onClick={() => handlePausedChange(row, row.manualBlock !== 'paused')}
                          disabled={isPending && pendingTenantId === row.tenantId}
                          className={`${SECONDARY_ACTION} disabled:opacity-50`}
                        >
                          {row.manualBlock === 'paused' ? 'Resume' : 'Pause'}
                        </button>
                      )}
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
          anchorDayKey={selected.anchorDayKey}
          paidThroughDayKey={selected.paidThroughDayKey}
          onClose={() => setSelected(null)}
          onRecorded={() => router.refresh()}
        />
      )}

      {editingAnchor && (
        <BillingAnchorDialog
          tenantId={editingAnchor.tenantId}
          tenantName={editingAnchor.name}
          anchorDayKey={editingAnchor.anchorDayKey}
          onClose={() => setEditingAnchor(null)}
          onSaved={() => router.refresh()}
        />
      )}

      {editingAllowance && (
        <AllowanceDialog
          tenantName={
            rows.find((row) => row.tenantId === editingAllowance.tenantId)?.name ?? 'This tenant'
          }
          allowance={editingAllowance}
          onClose={() => setEditingAllowance(null)}
          onSaved={() => router.refresh()}
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
      className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
        isActive ? 'bg-white text-black' : 'text-white/60 hover:text-white'
      }`}
    >
      {label}
    </button>
  )
}

function Stat({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <Panel hover padding="p-5" testId={testId}>
      <p className="text-xs uppercase tracking-wide text-white/45">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-white">{value}</p>
    </Panel>
  )
}
