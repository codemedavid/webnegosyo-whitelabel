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
 * `stock_alerts` rows are raised store-wide, from the roll-up across every
 * branch — they carry no branch of their own. The inventory screen, meanwhile,
 * shows a branch manager THEIR shelf. Pairing the two unfiltered put the
 * chain's low-stock banner above one branch's quantities, so a manager whose
 * own shelf is full was told to reorder, and the numbers underneath the banner
 * disagreed with it.
 *
 * So each alert is re-tested against the quantities the viewer is actually
 * being shown: it survives only if that ingredient is at or below its reorder
 * level *for them*. A store-wide account passes its own roll-up figures in and
 * every alert survives, which is the existing behaviour exactly.
 *
 * An alert whose ingredient is absent from the list is dropped. The list is
 * every ingredient the tenant has, so absent means the viewer cannot see that
 * ingredient at all, and an alert about something invisible is unactionable.
 */
export function scopeStockAlerts(
  alerts: readonly StockAlertView[],
  items: readonly AlertScopedItem[],
): StockAlertView[] {
  const byId = new Map(items.map((item) => [item.id, item]))

  return alerts.filter((alert) => {
    const item = byId.get(alert.inventoryItemId)
    if (!item) return false
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
  if (alert.level === 'out') return `${alert.name} is out of stock`

  const unit = alert.unitAbbreviation ? ` ${alert.unitAbbreviation}` : ''
  return (
    `${alert.name} is down to ${formatQuantity(alert.quantity)}${unit}` +
    ` (reorder at ${formatQuantity(alert.reorderLevel)}${unit})`
  )
}
