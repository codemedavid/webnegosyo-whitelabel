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
import { usePlatformAccess } from '@/components/superadmin/platform-access-context'
import type { CollectionsInsight, CollectionsSummary } from '@/lib/billing/collections-insight'
import type { MonthCollection } from '@/lib/billing/payment-history'
import { SubscriptionStats } from '@/components/superadmin/subscriptions/subscription-stats'
import { ActivityCell, LastPaymentCell } from '@/components/superadmin/subscriptions/insight-cells'

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

/** Open, but nobody has ever set up billing — neither paid nor late. */
const UNBILLED_STYLE = 'border-white/15 bg-white/[0.06] text-white/60'

/**
 * What closed this tenant, in the owner's words.
 *
 * `state` collapses three situations into `paused`, which is right for deciding
 * access and wrong for a human reading the row: a cancelled client and one who
 * simply forgot to pay call for different conversations.
 */
function statusLabel(row: RosterRow): string {
  if (row.isUnbilled) return 'Not billed'
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

/** Trading unpaid outranks due-soon: one is money leaking, the other a reminder. */
function rowTone(row: RosterRow, insight: CollectionsInsight | undefined): string {
  if (insight?.isTradingUnpaid) return 'bg-red-400/[0.05] transition-colors hover:bg-red-400/[0.08]'
  if (row.isDueSoon) return 'bg-amber-400/[0.06] transition-colors hover:bg-amber-400/10'
  return 'transition-colors hover:bg-white/[0.03]'
}

/** Anyone the owner has a reason to contact about money. */
function needsChasing(row: RosterRow): boolean {
  return row.state !== 'active' || row.isDueSoon
}

type RosterFilter = 'all' | 'chase' | 'tradingUnpaid' | 'neverPaid' | 'unbilled' | 'dormant'

type Insights = Readonly<Record<string, CollectionsInsight>>

type RowFilter = (row: RosterRow, insight: CollectionsInsight | undefined) => boolean

const FILTERS: Record<RosterFilter, RowFilter> = {
  all: () => true,
  chase: (row) => needsChasing(row),
  tradingUnpaid: (_row, insight) => insight?.isTradingUnpaid ?? false,
  neverPaid: (_row, insight) => insight?.hasNeverPaid ?? false,
  unbilled: (row) => row.isUnbilled,
  dormant: (_row, insight) => insight?.isDormant ?? false,
}

const EMPTY_MESSAGES: Record<RosterFilter, string> = {
  all: 'No tenants match.',
  chase: `Nobody needs chasing — every tenant is paid beyond the next ${DUE_SOON_WINDOW_DAYS} days.`,
  tradingUnpaid: 'No store is trading without paying.',
  neverPaid: 'Every tenant has at least one payment on record.',
  unbilled: 'Every tenant has billing set up.',
  dormant: 'Every readable store took an order in the last 30 days.',
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
  /**
   * Ledger + order activity per tenant. Optional for the same reason as
   * `allowances`: without it the table still says who owes.
   */
  insights?: Insights
  collections?: CollectionsSummary
  collected?: MonthCollection
  /** When the numbers were read, so "last order" labels match the server. */
  nowIso?: string
}

export function SubscriptionManager({
  rows,
  summary,
  allowances,
  insights,
  collections,
  collected,
  nowIso,
}: SubscriptionManagerProps) {
  const router = useRouter()
  const canEdit = usePlatformAccess().can('subscriptions.edit')
  const [selected, setSelected] = useState<RosterRow | null>(null)
  const [editingAllowance, setEditingAllowance] = useState<AllowanceRow | null>(null)
  const [editingAnchor, setEditingAnchor] = useState<RosterRow | null>(null)
  const [filter, setFilter] = useState<RosterFilter>('all')
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pendingTenantId, setPendingTenantId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const isActivityKnown = collections?.isActivityKnown ?? false
  const referenceNow = nowIso ?? new Date().toISOString()

  const counts = useMemo(
    () =>
      Object.fromEntries(
        (Object.keys(FILTERS) as RosterFilter[]).map((key) => [
          key,
          rows.filter((row) => FILTERS[key](row, insights?.[row.tenantId])).length,
        ])
      ) as Record<RosterFilter, number>,
    [rows, insights]
  )

  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const matching = rows.filter(
      (row) =>
        FILTERS[filter](row, insights?.[row.tenantId]) &&
        (needle === '' || row.name.toLowerCase().includes(needle) || row.slug.includes(needle))
    )
    if (!insights) return matching
    // A store using the product without paying for it is the call to make
    // first; otherwise the roster's urgency order stands (sort is stable).
    const isTradingUnpaid = (row: RosterRow) => (insights[row.tenantId]?.isTradingUnpaid ? 1 : 0)
    return [...matching].sort((a, b) => isTradingUnpaid(b) - isTradingUnpaid(a))
  }, [rows, insights, filter, query])

  const hasInsights = insights !== undefined

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
      <SubscriptionStats summary={summary} collections={collections} collected={collected} />

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex flex-wrap items-center gap-1 rounded-2xl border border-white/10 bg-white/[0.04] p-1">
          <FilterTab
            label="All tenants"
            isActive={filter === 'all'}
            onClick={() => setFilter('all')}
          />
          <FilterTab
            label={`Needs payment (${counts.chase})`}
            isActive={filter === 'chase'}
            onClick={() => setFilter('chase')}
          />
          {isActivityKnown && (
            <FilterTab
              label={`Trading, not paid (${counts.tradingUnpaid})`}
              isActive={filter === 'tradingUnpaid'}
              onClick={() => setFilter('tradingUnpaid')}
            />
          )}
          {hasInsights && (
            <FilterTab
              label={`Never paid (${counts.neverPaid})`}
              isActive={filter === 'neverPaid'}
              onClick={() => setFilter('neverPaid')}
            />
          )}
          <FilterTab
            label={`Not billed (${counts.unbilled})`}
            isActive={filter === 'unbilled'}
            onClick={() => setFilter('unbilled')}
          />
          {isActivityKnown && (
            <FilterTab
              label={`No orders 30d (${counts.dormant})`}
              isActive={filter === 'dormant'}
              onClick={() => setFilter('dormant')}
            />
          )}
        </div>

        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search tenants…"
          aria-label="Search tenants"
          className="w-full max-w-[220px] rounded-lg border border-white/15 bg-black px-3 py-1.5 text-sm text-white placeholder:text-white/35 focus:border-white/40 focus:outline-none"
        />

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
          {query.trim() ? 'No tenants match your search.' : EMPTY_MESSAGES[filter]}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.02]">
          <table
            className={`w-full text-sm ${hasInsights ? 'min-w-[1240px]' : 'min-w-[980px]'}`}
          >
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.02] text-left text-[11px] font-semibold uppercase tracking-wider text-white/45">
                <th className="px-4 py-2.5">Tenant</th>
                <th className="px-4 py-2.5">Status</th>
                {hasInsights && <th className="whitespace-nowrap px-4 py-2.5">Orders (30d)</th>}
                {hasInsights && <th className="whitespace-nowrap px-4 py-2.5">Last payment</th>}
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
              {visibleRows.map((row) => {
                const insight = insights?.[row.tenantId]
                return (
                  <tr key={row.tenantId} className={rowTone(row, insight)}>
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
                        className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${
                          row.isUnbilled ? UNBILLED_STYLE : STATE_STYLES[row.state]
                        }`}
                      >
                        {statusLabel(row)}
                      </span>
                      {insight?.isTradingUnpaid && (
                        <div
                          className="mt-1 whitespace-nowrap text-xs font-medium text-red-300"
                          data-testid={`trading-unpaid-${row.tenantId}`}
                        >
                          Still taking orders
                        </div>
                      )}
                    </td>
                    {hasInsights && (
                      <ActivityCell insight={insight} nowIso={referenceNow} tenantId={row.tenantId} />
                    )}
                    {hasInsights && <LastPaymentCell insight={insight} tenantId={row.tenantId} />}
                    {/* Clickable, because it is the one date on this row the
                        owner sets rather than reads. An unanchored client shows
                        the prompt instead of an em dash: "—" reads as missing
                        data, when it actually means a billing rule that has not
                        been chosen yet. */}
                    <td className="whitespace-nowrap px-4 py-3">
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => setEditingAnchor(row)}
                          data-testid={`billing-anchor-${row.tenantId}`}
                          className="rounded-lg px-2 py-1 text-left text-white/60 underline decoration-white/20 underline-offset-4 transition-colors hover:bg-white/[0.06] hover:text-white"
                        >
                          {row.anchorDayKey ? formatDayKey(row.anchorDayKey) : 'Set date'}
                        </button>
                      ) : (
                        <span className="px-2 py-1 text-white/60">
                          {row.anchorDayKey ? formatDayKey(row.anchorDayKey) : '—'}
                        </span>
                      )}
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
                      {canEdit && (
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
                      )}
                    </td>
                  </tr>
                )
              })}
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
