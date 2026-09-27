/**
 * The inventory audit log's rules — pure, so the writer, the page and any
 * future surface agree on one vocabulary.
 *
 * The ledger (`stock_movements`) says what a deduction DID. This log says what
 * was ATTEMPTED, by which path, for whom: a second depletion of the same order
 * is refused by the claim and used to leave no trace, which made "stock was
 * deducted twice" impossible to confirm or refute from the database.
 */

export const STOCK_AUDIT_SOURCES = [
  'web_checkout',
  'customer_app',
  'pos',
  'qr_scan',
  'merchant_app',
  'web_admin',
  'system',
] as const
export type StockAuditSource = (typeof STOCK_AUDIT_SOURCES)[number]

export type StockAuditEvent =
  | 'order_sale'
  | 'order_restore'
  | 'order_edit'
  | 'order_redeplete'
  | 'manual_movement'

export type StockAuditOutcome =
  | 'applied'
  | 'duplicate'
  | 'cancelled_first'
  | 'nothing_to_deduct'
  | 'failed'

/** Who and where an order-driven stock operation came from. */
export interface StockAuditContext {
  source: StockAuditSource
  /** The signed-in person behind it; absent for a diner or the system. */
  actorUserId?: string | null
}

export interface StockAuditLine {
  inventoryItemId: string
  name: string | null
  quantityDelta: number
  enteredQuantity: number | null
  enteredUnitId: string | null
}

/** Matches the `detail` CHECK in migration 20260926120000. */
const MAX_DETAIL_LENGTH = 2000

/** How close two identical manual movements must be to look like a re-entry. */
export const SUSPECTED_DUPLICATE_WINDOW_MS = 10 * 60 * 1000

const SOURCE_SET: ReadonlySet<string> = new Set(STOCK_AUDIT_SOURCES)

/**
 * A client may name its path, but only from the known list — an invented value
 * would fail the table's CHECK and cost the whole audit row.
 */
export function parseStockAuditSource(value: unknown, fallback: StockAuditSource): StockAuditSource {
  return typeof value === 'string' && SOURCE_SET.has(value) ? (value as StockAuditSource) : fallback
}

interface MovementRowForAudit {
  inventory_item_id: string
  quantity_delta: number
  entered_quantity: number | null
  entered_unit_id: string | null
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** Ledger rows as the audit log stores them, each with its ingredient's name. */
export function buildAuditLines(
  rows: readonly MovementRowForAudit[],
  nameById: ReadonlyMap<string, string>,
): StockAuditLine[] {
  return rows.map((row) => ({
    inventoryItemId: row.inventory_item_id,
    name: nameById.get(row.inventory_item_id) ?? null,
    quantityDelta: toNumberOrNull(row.quantity_delta) ?? 0,
    enteredQuantity: toNumberOrNull(row.entered_quantity),
    enteredUnitId: row.entered_unit_id ?? null,
  }))
}

export interface ManualMovementCandidate {
  inventoryItemId: string
  reason: string
  enteredQuantity: number
  enteredUnitId: string
  outletId: string | null
  actorUserId: string | null
}

export interface RecentMovementRow {
  inventory_item_id: string
  reason: string
  entered_quantity: number | string | null
  entered_unit_id: string | null
  outlet_id: string | null
  created_by: string | null
  created_at: string
}

/**
 * Whether this manual movement repeats one the same person recorded moments
 * ago — the shape a timed-out save followed by a re-entry takes.
 *
 * Flagged, never refused: two identical deliveries in ten minutes can be real,
 * and refusing one would leave the shelf short with nothing on screen saying
 * why. An unattributed movement is never flagged — without a person there is
 * nobody to have repeated themselves.
 */
export function isSuspectedDuplicateMovement(
  candidate: ManualMovementCandidate,
  recent: readonly RecentMovementRow[],
  nowMs: number,
): boolean {
  if (!candidate.actorUserId) return false
  return recent.some(
    (row) =>
      row.inventory_item_id === candidate.inventoryItemId &&
      row.reason === candidate.reason &&
      toNumberOrNull(row.entered_quantity) === candidate.enteredQuantity &&
      row.entered_unit_id === candidate.enteredUnitId &&
      (row.outlet_id ?? null) === candidate.outletId &&
      row.created_by === candidate.actorUserId &&
      nowMs - Date.parse(row.created_at) <= SUSPECTED_DUPLICATE_WINDOW_MS,
  )
}

export function truncateAuditDetail(message: string | null | undefined): string | null {
  const trimmed = message?.trim()
  if (!trimmed) return null
  return trimmed.slice(0, MAX_DETAIL_LENGTH)
}

// ── wording ────────────────────────────────────────────────────────────────

export const AUDIT_SOURCE_LABELS: Record<StockAuditSource, string> = {
  web_checkout: 'Online checkout',
  customer_app: 'Customer app',
  pos: 'Register',
  qr_scan: 'QR order scan',
  merchant_app: 'Merchant app',
  web_admin: 'Web admin',
  system: 'System',
}

export const AUDIT_OUTCOME_LABELS: Record<StockAuditOutcome, string> = {
  applied: 'Applied',
  duplicate: 'Duplicate refused',
  cancelled_first: 'Skipped — already cancelled',
  nothing_to_deduct: 'Nothing to deduct',
  failed: 'Failed',
}

export type AuditTone = 'neutral' | 'warning' | 'error'

export interface StockAuditEntryView {
  event: StockAuditEvent
  outcome: StockAuditOutcome
  source: StockAuditSource
  orderId: string | null
  revision: number | null
  movementCount: number
  isSuspectedDuplicate: boolean
  actorName: string | null
  detail: string | null
}

/** The tail of an order id — enough to match a receipt, short enough to scan. */
function shortOrderRef(orderId: string | null): string {
  return orderId ? `order …${orderId.slice(-6)}` : 'an order'
}

function describeTitle(entry: StockAuditEntryView): string {
  const order = shortOrderRef(entry.orderId)
  if (entry.event === 'manual_movement') {
    return entry.isSuspectedDuplicate
      ? 'Manual stock change — same as one recorded minutes ago'
      : 'Manual stock change'
  }
  if (entry.outcome === 'duplicate') {
    return entry.event === 'order_restore'
      ? `Second restore refused for ${order}`
      : `Second deduction refused for ${order}`
  }
  if (entry.outcome === 'cancelled_first') return `Deduction skipped — ${order} was already cancelled`
  if (entry.outcome === 'nothing_to_deduct') return `Nothing to deduct for ${order} (no recipe)`
  if (entry.outcome === 'failed') return `Stock update failed for ${order}`

  switch (entry.event) {
    case 'order_restore':
      return `Restored for cancelled ${order}`
    case 'order_edit':
      return `Edit #${entry.revision ?? 0} adjusted ${order}`
    case 'order_redeplete':
      return `Deducted again for un-cancelled ${order}`
    default:
      return `Deducted for ${order}`
  }
}

function describeTone(entry: StockAuditEntryView): AuditTone {
  if (entry.outcome === 'failed') return 'error'
  if (entry.outcome === 'duplicate' || entry.isSuspectedDuplicate) return 'warning'
  return 'neutral'
}

export function describeAuditEntry(entry: StockAuditEntryView): {
  title: string
  subtitle: string
  tone: AuditTone
} {
  const parts = [AUDIT_SOURCE_LABELS[entry.source]]
  if (entry.actorName) parts.push(entry.actorName)
  if (entry.outcome === 'failed' && entry.detail) parts.push(entry.detail)
  return { title: describeTitle(entry), subtitle: parts.join(' · '), tone: describeTone(entry) }
}

// ── the log page ───────────────────────────────────────────────────────────

export interface AuditFilters {
  /** Part of an order id to find, or null for every entry. */
  orderQuery: string | null
  /** Only refused duplicates, failures and suspected repeats. */
  problemsOnly: boolean
}

const MAX_ORDER_QUERY_LENGTH = 64

/**
 * Filters from the URL. Never throws — `searchParams` is untrusted, and a bad
 * query must not 500 the page. The order search keeps only id characters: it
 * becomes an `ilike` pattern, where `%`/`_` are wildcards and `,()` would
 * break a PostgREST filter.
 */
export function resolveAuditFilters(params: Record<string, unknown>): AuditFilters {
  const rawOrder = typeof params.order === 'string' ? params.order : ''
  const orderQuery = rawOrder.replace(/[^A-Za-z0-9-]/g, '').slice(0, MAX_ORDER_QUERY_LENGTH)
  return {
    orderQuery: orderQuery === '' ? null : orderQuery,
    problemsOnly: params.view === 'problems',
  }
}

export interface AuditSummary {
  deductions: number
  restores: number
  duplicatesRefused: number
  suspectedRepeats: number
  failures: number
}

export function summarizeAuditEntries(
  entries: ReadonlyArray<Pick<StockAuditEntryView, 'event' | 'outcome' | 'isSuspectedDuplicate'>>,
): AuditSummary {
  const isApplied = (e: (typeof entries)[number]) => e.outcome === 'applied'
  return {
    deductions: entries.filter(
      (e) => isApplied(e) && (e.event === 'order_sale' || e.event === 'order_redeplete'),
    ).length,
    restores: entries.filter((e) => isApplied(e) && e.event === 'order_restore').length,
    duplicatesRefused: entries.filter((e) => e.outcome === 'duplicate').length,
    suspectedRepeats: entries.filter((e) => e.isSuspectedDuplicate).length,
    failures: entries.filter((e) => e.outcome === 'failed').length,
  }
}

/** A ledger delta in the ingredient's stock unit, signed so a deduction reads as one. */
export function formatAuditLineQuantity(quantityDelta: number, unit: string | null): string {
  const rounded = Math.round(quantityDelta * 1000) / 1000
  const magnitude = String(Math.abs(rounded))
  const sign = rounded < 0 ? '−' : rounded > 0 ? '+' : ''
  return unit ? `${sign}${magnitude} ${unit}` : `${sign}${magnitude}`
}
