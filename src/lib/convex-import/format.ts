/** Plain-text renderings of a plan for the terminal. Counts, pesos and dates only. */
import type { ImportPlan, ImportSummary } from './plan'
import type { Problem } from './types'

export const peso = (cents: number): string =>
  `₱${(cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '-')

export function renderPlan(plan: Pick<ImportPlan, 'summary' | 'problems'>): string {
  const s = plan.summary
  const lines: string[] = []
  lines.push(`Store ${s.slug} (${s.tenantId})`)
  lines.push(
    `Snapshot: ${Object.entries(s.snapshotCounts)
      .map(([table, n]) => `${table} ${n}`)
      .join(', ')}`
  )
  lines.push('')
  lines.push('Will import (platform rows):')
  lines.push(`  orders          ${s.orders.count}  ${peso(s.orders.cents)}  (cancelled ${s.orders.cancelled.count}, ${peso(s.orders.cancelled.cents)}; amount_paid ${peso(s.orders.amountPaidCents)})`)
  lines.push(`  order_items     ${s.items.count}  ${peso(s.items.cents)}  (${s.items.quantity} units; ${s.items.nulledMenuLinks} lines lose a deleted dish link)`)
  lines.push(`  order_payments  charges ${s.payments.charges.count} ${peso(s.payments.charges.cents)} · refunds ${s.payments.refunds.count} ${peso(s.payments.refunds.cents)}`)
  lines.push(`  order_revisions ${s.revisions.count}`)
  lines.push(`  product_costs   ${s.productCosts.toInsert} new · ${s.productCosts.alreadyOnPlatform} already on platform · ${s.productCosts.droppedNoMenuItem} for deleted dishes`)
  lines.push(`  range           ${day(s.firstOrderAt)} → ${day(s.lastOrderAt)} over ${s.tradingDays} day(s)`)
  lines.push(`  already on platform from an earlier run: ${s.alreadyOnPlatform}`)
  lines.push('')
  lines.push('Platform today:')
  lines.push(`  the store's own platform orders: ${s.existingPlatformOrders} (${day(s.existingPlatformRange.first)} → ${day(s.existingPlatformRange.last)})`)
  lines.push(`  days with both: ${s.daysSharedWithPlatform}; Convex orders renumbered on those days: ${s.renumbered}`)
  lines.push(`  skipped as the same register sale already on platform: ${s.skippedSameClientOrderId}`)
  lines.push(`  Convex-keyed rows to rekey: ${Object.entries(s.rekey).map(([t, n]) => `${t} ${n}`).join(', ')}`)
  const untouched = Object.entries(s.untouchedKeyed).filter(([, n]) => (n ?? 0) > 0)
  lines.push(`  Convex-keyed rows left as they are: ${untouched.length ? untouched.map(([t, n]) => `${t} ${n}`).join(', ') : 'none'}`)
  lines.push(`  customer links (customer_external_orders → orders.customer_id): ${s.customerLinks}`)
  lines.push(`  Store Activity rows the triggers will write: ~${s.activityRowsWritten} (+ discounts); repeats of a Convex-era “order placed”: ${s.activityPlacedDuplicates}`)
  lines.push('')
  lines.push('Not moving (stays in Convex):')
  if (s.notMoved.length === 0) lines.push('  nothing else')
  for (const row of s.notMoved) lines.push(`  ${row.table} ${row.rows} — ${row.why}`)
  lines.push('')
  lines.push('Problems:')
  if (plan.problems.length === 0) lines.push('  none')
  for (const problem of plan.problems) lines.push(`  [${problem.severity}] ${problem.code} ×${problem.count}: ${problem.detail}`)
  return lines.join('\n')
}

export interface BatchRow {
  slug: string
  summary?: ImportSummary
  problems?: Problem[]
  error?: string
}

export function renderBatchTable(rows: BatchRow[]): string {
  const header = ['store', 'orders', '₱ total', 'items', 'pay', 'rev', 'costs', 'first → last', 'plat. orders', 'shared days', 'renum', 'rekey', 'act. dup', 'blocking', 'warnings']
  const body = rows.map((row) => {
    if (!row.summary) return [row.slug, `ERROR: ${row.error ?? 'no plan'}`, '', '', '', '', '', '', '', '', '', '', '', '', '']
    const s = row.summary
    const problems = row.problems ?? []
    const rekey = Object.values(s.rekey).reduce((sum, n) => sum + n, 0)
    return [
      row.slug,
      String(s.orders.count),
      peso(s.orders.cents),
      String(s.items.count),
      `${s.payments.charges.count}+${s.payments.refunds.count}`,
      String(s.revisions.count),
      `${s.productCosts.toInsert}/${s.snapshotCounts.productCosts}`,
      `${day(s.firstOrderAt)} → ${day(s.lastOrderAt)}`,
      String(s.existingPlatformOrders),
      String(s.daysSharedWithPlatform),
      String(s.renumbered),
      String(rekey),
      String(s.activityPlacedDuplicates),
      problems.filter((p) => p.severity === 'block').map((p) => p.code).join(' ') || '-',
      problems.filter((p) => p.severity === 'warn').map((p) => `${p.code}×${p.count}`).join(' ') || '-',
    ]
  })
  return [header, ...body].map((cells) => `| ${cells.join(' | ')} |`).join('\n').replace(/^(\|[^\n]*\|)\n/, `$1\n|${header.map(() => '---').join('|')}|\n`)
}
