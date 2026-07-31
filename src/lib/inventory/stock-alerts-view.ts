/**
 * Presenting open stock alerts: ordering and wording.
 *
 * Pure, like the rest of the 5B core (`low-stock.ts`, `auto-86.ts`), so the web
 * admin and the merchant app show the same list in the same order with the same
 * words. Two surfaces disagreeing about which ingredient is most urgent is a
 * worse bug than either surface being slightly wrong.
 */

export type StockAlertLevel = 'low' | 'out'

export interface StockAlertView {
  id: string
  inventoryItemId: string
  name: string
  level: StockAlertLevel
  /** On-hand quantity, in stock units, when the alert was raised. */
  quantity: number
  reorderLevel: number
  /** Empty for a countable ingredient that has no meaningful unit to show. */
  unitAbbreviation: string
  createdAt: string
  /**
   * The branch this alert is about. `null` means store-wide — every alert
   * raised before branches existed, and every single-shop tenant.
   */
  outletId: string | null
  /**
   * That branch as the merchant names it. Absent when the outlet has since been
   * deleted, or when a read could not resolve it: the alert then says less
   * rather than printing a UUID at somebody.
   */
  branchName?: string
}

export interface StockAlertSummary {
  outCount: number
  lowCount: number
  total: number
  /** Empty when there is nothing to report, so the caller can render nothing. */
  headline: string
}

/** Worst first. */
const LEVEL_RANK: Record<StockAlertLevel, number> = { out: 0, low: 1 }

/** Trims the trailing zeros a NUMERIC(16,4) round-trip leaves behind. */
function formatQuantity(quantity: number): string {
  return Number(quantity.toFixed(4)).toString()
}

function pluralise(count: number): string {
  return count === 1 ? 'ingredient' : 'ingredients'
}

/**
 * Alerts ordered by what will stop the merchant serving first: exhausted before
 * low, and within a level the oldest first, since that is the one that has gone
 * unaddressed longest.
 *
 * Returns a new array — the caller holds this in React state.
 */
/** The scoped ingredient fields an alert is re-tested against. */
export interface AlertScopedItem {
  id: string
  current_qty: number
  reorder_level: number
}

/**
 * The alerts that are this viewer's problem.
 *
 * An unstamped alert carries no branch — it was raised from the roll-up, which
 * is every alert predating branch-aware alerting. The inventory screen,
 * meanwhile, shows a branch manager THEIR shelf. Pairing the two unfiltered put
 * the chain's low-stock banner above one branch's quantities, so a manager
 * whose own shelf was full got told to reorder and the numbers underneath the
 * banner disagreed with the words above them. Those alerts are therefore
 * re-tested against the quantities the viewer is actually being shown.
 *
 * **An alert that names a branch is not re-tested.** The branch's own shelf was
 * the basis for raising it, and the viewer's figures are the wrong yardstick to
 * re-judge it by: an owner sees the roll-up, so a South-only outage inside a
 * healthy 700g chain total would be thrown away — the alert raised correctly
 * and then filtered out of the only place it would have been read. Which
 * branch's alerts reach a viewer at all is settled before this, by RLS.
 *
 * An alert whose ingredient is absent from the list is still dropped, branch or
 * not. The list is every ingredient the viewer can see, so absent means they
 * cannot see it, and an alert about something invisible is unactionable.
 */
export function scopeStockAlerts(
  alerts: readonly StockAlertView[],
  items: readonly AlertScopedItem[],
): StockAlertView[] {
  const byId = new Map(items.map((item) => [item.id, item]))

  return alerts.filter((alert) => {
    const item = byId.get(alert.inventoryItemId)
    if (!item) return false
    // A real branch id, not merely "not null": a row read without the column
    // must fall through to the re-test rather than silently bypassing it.
    if (typeof alert.outletId === 'string' && alert.outletId !== '') return true
    return item.current_qty <= item.reorder_level
  })
}

export function sortStockAlerts(alerts: readonly StockAlertView[]): StockAlertView[] {
  return [...alerts].sort((a, b) => {
    const byLevel = LEVEL_RANK[a.level] - LEVEL_RANK[b.level]
    if (byLevel !== 0) return byLevel
    return a.createdAt.localeCompare(b.createdAt)
  })
}

/**
 * One line for the top of the page. Leads with outages: something that cannot
 * be served at all outranks something that merely needs reordering.
 */
export function summarizeStockAlerts(alerts: readonly StockAlertView[]): StockAlertSummary {
  const outCount = alerts.filter((a) => a.level === 'out').length
  const lowCount = alerts.filter((a) => a.level === 'low').length
  const total = outCount + lowCount

  if (total === 0) return { outCount: 0, lowCount: 0, total: 0, headline: '' }

  const parts: string[] = []
  if (outCount > 0) parts.push(`${outCount} ${pluralise(outCount)} out of stock`)
  if (lowCount > 0) {
    // The noun is already established by the outage clause when both are shown.
    parts.push(outCount > 0 ? `${lowCount} running low` : `${lowCount} ${pluralise(lowCount)} running low`)
  }

  return { outCount, lowCount, total, headline: parts.join(', ') }
}

/**
 * One alert as a sentence.
 *
 * An exhausted ingredient deliberately shows no quantity: "0 kg left" reads as
 * a measurement, "out of stock" reads as a problem. It also avoids showing a
 * negative, which happens when a sale lands before its delivery is recorded.
 */
export function describeStockAlert(alert: StockAlertView): string {
  // Named last, so the sentence still leads with the ingredient and the
  // problem. A merchant scanning a list is looking for what has gone wrong
  // before they are looking for where.
  const where = alert.branchName ? ` at ${alert.branchName}` : ''

  if (alert.level === 'out') return `${alert.name} is out of stock${where}`

  const unit = alert.unitAbbreviation ? ` ${alert.unitAbbreviation}` : ''
  return (
    `${alert.name} is down to ${formatQuantity(alert.quantity)}${unit}` +
    ` (reorder at ${formatQuantity(alert.reorderLevel)}${unit})${where}`
  )
}
