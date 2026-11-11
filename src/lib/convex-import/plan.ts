/**
 * Convex snapshot + what the platform holds → the exact platform rows to
 * insert, the findings, and the counts/peso totals the generated SQL must find
 * in the database before it lets the transaction commit.
 *
 * Pure: no I/O. `scripts/convex-to-platform/` reads the snapshot and the
 * platform; tests build both by hand. Nothing in the summary or the problems
 * names a customer: counts, peso totals, dates and store configuration only.
 *
 * The lessons of the eight hand-run imports (2026-09 → 2026-10) live here:
 * creation-order inserts, UUID v5 ids, daily numbers kept (renumbered only
 * where they would collide with the store's own platform orders), dropped
 * links to deleted dishes / types / methods / branches with the names kept,
 * the ledger in the order a refund guard accepts it, and product costs moved
 * where the cost snapshot trigger reads them.
 */
import { toCents } from '@/lib/reports/money'
import { uuidOrNull, uuidV5 } from './ids'
import type {
  ConvexOrder,
  ConvexOrderItem,
  ConvexOrderPayment,
  ConvexProductCost,
  ConvexSnapshot,
  ImportRows,
  PlatformOrderItemRow,
  PlatformOrderPaymentRow,
  PlatformOrderRevisionRow,
  PlatformOrderRow,
  PlatformProductCostRow,
  PlatformState,
  Problem,
  ProblemSeverity,
  RekeyTable,
  UntouchedKeyedTable,
} from './types'
import { REKEY_TABLES } from './types'

export const ORDER_STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'] as const
export const PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'verified'] as const
export const ORDER_SOURCES = ['web', 'mobile', 'qr_handoff', 'pos'] as const

/** Tables an export carries that the import deliberately leaves in Convex. */
export const NOT_MOVED_TABLES: Record<string, string> = {
  analyticsEvents: 'storefront analytics events (no platform equivalent table is filled from history)',
  productAnalytics: 'computed product analytics (platform reports compute from orders)',
  dailyStats: 'daily stat rollups (platform reports compute from orders)',
  pushTokens: 'Convex push tokens (the app registers a platform push token itself)',
  dailyOrderCounters: 'Convex daily counters (the platform counter seeds from the highest number on a day)',
  tenantConfig: 'deployment settings (checked for the store id, never copied)',
  accessAudit: 'Convex access counters',
}

const IMPORTED_TABLES = new Set(['orders', 'orderItems', 'orderPayments', 'orderRevisions', 'productCosts'])

export interface MoneyCount {
  count: number
  cents: number
}

export interface ImportSummary {
  tenantId: string
  slug: string
  snapshotCounts: Record<string, number>
  orders: MoneyCount & { cancelled: MoneyCount; amountPaidCents: number }
  items: MoneyCount & { quantity: number; nulledMenuLinks: number }
  payments: { charges: MoneyCount; refunds: MoneyCount }
  revisions: { count: number }
  productCosts: { toInsert: number; alreadyOnPlatform: number; droppedNoMenuItem: number; expectedPresent: number }
  /** First and last order, business time (`saleOccurredAt` when set), ISO. */
  firstOrderAt: string | null
  lastOrderAt: string | null
  /** Newest `_creationTime` of any imported order, item, payment or revision (ms): `delta` starts after it. */
  newestCreationTime: number | null
  tradingDays: number
  /** Orders already on the platform under their import id (an earlier run): a re-run skips them. */
  alreadyOnPlatform: number
  existingPlatformOrders: number
  existingPlatformRange: { first: string | null; last: string | null }
  daysSharedWithPlatform: number
  renumbered: number
  skippedSameClientOrderId: number
  rekey: Record<RekeyTable, number>
  untouchedKeyed: Partial<Record<UntouchedKeyedTable, number>>
  customerLinks: number
  /** Activity rows the import's triggers write (order placed + one per payment and revision, before discounts). */
  activityRowsWritten: number
  /** Of those `order.placed` rows, how many repeat one the Convex-era capture already wrote. */
  activityPlacedDuplicates: number
  notMoved: Array<{ table: string; rows: number; why: string }>
  unmappedPaymentMethods: Array<{ name: string; orders: number }>
}

export interface ImportPlan {
  rows: ImportRows
  problems: Problem[]
  summary: ImportSummary
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null)

const finite = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)

/** Pesos as the platform stores them (numeric(…,2)): whole centavos, half away from zero. */
export const pesos = (value: unknown): number => toCents(finite(value) ?? 0) / 100

const isoFromMillis = (ms: number): string => new Date(ms).toISOString()

function isoFromText(value: unknown): string | null | 'invalid' {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') return 'invalid'
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? new Date(ms).toISOString() : 'invalid'
}

/** The instant the order is reported at: Convex `orderTime` (saleOccurredAt, else creation). */
export function orderBusinessTime(order: Pick<ConvexOrder, '_creationTime' | 'saleOccurredAt'>): number {
  return finite(order.saleOccurredAt) ?? order._creationTime
}

/** YYYY-MM-DD of an instant in a time zone (the store's; Manila when unset). */
export function localDate(ms: number, timeZone: string | null | undefined): string {
  const zone = timeZone && timeZone.trim() ? timeZone : 'Asia/Manila'
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(ms)
  )
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

const norm = (name: string) => name.trim().toLowerCase()

class ProblemLog {
  private byCode = new Map<string, Problem>()
  add(code: string, severity: ProblemSeverity, detail: string, count = 1) {
    const found = this.byCode.get(code)
    if (found) found.count += count
    else this.byCode.set(code, { code, severity, count, detail })
  }
  list(): Problem[] {
    const rank: Record<ProblemSeverity, number> = { block: 0, warn: 1, info: 2 }
    return [...this.byCode.values()].sort((a, b) => rank[a.severity] - rank[b.severity] || a.code.localeCompare(b.code))
  }
}

function byBusinessTime(a: ConvexOrder, b: ConvexOrder): number {
  return orderBusinessTime(a) - orderBusinessTime(b) || a._creationTime - b._creationTime || a._id.localeCompare(b._id)
}

function paymentTime(p: ConvexOrderPayment): number {
  return finite(p.occurredAt) ?? p._creationTime
}

export function buildImportPlan(snapshot: ConvexSnapshot, platform: PlatformState): ImportPlan {
  const problems = new ProblemLog()
  const tenantId = platform.tenant.id
  const timeZone = platform.tenant.timezone

  // ── The deployment must be this store's ────────────────────────────────
  const configTenant = snapshot.tenantConfig.find((row) => row.key === 'tenant_id')?.value?.trim()
  if (!configTenant) {
    problems.add('tenant_config_missing', 'warn', 'The deployment has no tenantConfig tenant_id; ownership checked by order types only.')
  } else if (configTenant !== tenantId) {
    problems.add('tenant_config_mismatch', 'block', 'The deployment says it belongs to a different store id.')
  }
  if (platform.tenant.loyaltyEnabled && !platform.tenant.loyaltyShadow) {
    problems.add(
      'loyalty_live',
      'block',
      'Loyalty is live: orders_loyalty_recovery would queue stamp earning for every imported order (history the Convex era may already have stamped). The SQL refuses this store.'
    )
  }

  const menuItems = new Set(platform.menuItemIds.map((id) => id.toLowerCase()))
  const outlets = new Set(platform.outletIds.map((id) => id.toLowerCase()))
  const orderTypes = new Map(platform.orderTypes.map((type) => [type.id.toLowerCase(), type]))
  const methodByName = new Map<string, string>()
  for (const method of [...platform.paymentMethods].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!methodByName.has(norm(method.name))) methodByName.set(norm(method.name), method.id)
  }
  const methodIds = new Set(platform.paymentMethods.map((method) => method.id.toLowerCase()))

  // ── Orders ─────────────────────────────────────────────────────────────
  const sortedOrders = [...snapshot.orders].sort(byBusinessTime)
  const importIds = new Set(sortedOrders.map((order) => uuidV5(order._id)))
  const nativeOrders = platform.existingOrders.filter((order) => !importIds.has(order.id.toLowerCase()))
  const existingIds = new Set(platform.existingOrders.map((order) => order.id.toLowerCase()))
  const nativeByClientId = new Map<string, string>()
  for (const order of nativeOrders) if (order.clientOrderId) nativeByClientId.set(order.clientOrderId, order.id)

  // Daily numbers the store's own platform orders already hold, per day.
  const taken = new Map<string, Set<number>>()
  const nativeDays = new Set<string>()
  for (const order of nativeOrders) {
    const day = order.orderDate ?? localDate(Date.parse(order.createdAt), timeZone)
    nativeDays.add(day)
    if (order.orderDate && order.dailyNumber !== null) {
      if (!taken.has(order.orderDate)) taken.set(order.orderDate, new Set())
      taken.get(order.orderDate)!.add(order.dailyNumber)
    }
  }

  const idMap: Record<string, string> = {}
  const included: Array<{ order: ConvexOrder; id: string; day: string }> = []
  const seenClientIds = new Map<string, string>()
  let skippedSameClient = 0
  for (const order of sortedOrders) {
    const id = uuidV5(order._id)
    const clientId = text(order.clientOrderId)
    const nativeTwin = clientId ? nativeByClientId.get(clientId) : undefined
    if (nativeTwin) {
      // The register sent this sale to both backends: the platform copy is the order.
      idMap[order._id] = nativeTwin
      skippedSameClient++
      continue
    }
    if (clientId && seenClientIds.has(clientId)) {
      idMap[order._id] = seenClientIds.get(clientId)!
      skippedSameClient++
      continue
    }
    if (clientId) seenClientIds.set(clientId, id)
    idMap[order._id] = id
    const orderDate = text(order.orderDate)
    const day = orderDate && DATE_ONLY.test(orderDate) ? orderDate : localDate(orderBusinessTime(order), timeZone)
    included.push({ order, id, day })
  }
  if (skippedSameClient > 0) {
    problems.add(
      'same_client_order_id',
      'warn',
      'Orders whose register id is already on the platform (the same sale): not imported again; their stock claims point at the platform copy.',
      skippedSameClient
    )
  }

  // Keep Convex numbers; renumber only a number the day already uses.
  const convexMaxByDay = new Map<string, number>()
  for (const { order, day } of included) {
    const n = finite(order.dailyNumber)
    if (n !== null) convexMaxByDay.set(day, Math.max(convexMaxByDay.get(day) ?? 0, n))
  }
  const nextByDay = new Map<string, number>()
  const assigned = new Map<string, { number: number | null; renumbered: boolean }>()
  let renumbered = 0
  for (const { order, id, day } of included) {
    const n = finite(order.dailyNumber)
    if (n === null || !Number.isInteger(n) || n < 1) {
      assigned.set(id, { number: null, renumbered: false })
      continue
    }
    const dayTaken = taken.get(day) ?? new Set<number>()
    taken.set(day, dayTaken)
    if (!dayTaken.has(n)) {
      dayTaken.add(n)
      assigned.set(id, { number: n, renumbered: false })
      continue
    }
    const next = nextByDay.get(day) ?? Math.max(convexMaxByDay.get(day) ?? 0, ...dayTaken) + 1
    let candidate = next
    while (dayTaken.has(candidate)) candidate++
    dayTaken.add(candidate)
    nextByDay.set(day, candidate + 1)
    assigned.set(id, { number: candidate, renumbered: true })
    renumbered++
  }
  if (renumbered > 0) {
    problems.add(
      'daily_number_renumbered',
      'warn',
      'Convex daily numbers that the store’s own platform orders already use on that day: given the next free number after both (old number kept in customer_data.convex_daily_number).',
      renumbered
    )
  }
  const convexDays = new Set(included.map(({ day }) => day))
  const sharedDays = [...convexDays].filter((day) => nativeDays.has(day)).length
  if (sharedDays > 0) {
    problems.add(
      'days_shared_with_platform',
      'info',
      'Days on which the store has both older platform orders and Convex orders; they interleave by time in the admin.',
      sharedDays
    )
  }

  const unmappedMethods = new Map<string, number>()
  const orderRows: PlatformOrderRow[] = []
  const orderById = new Map<string, PlatformOrderRow>()
  const convexOrderById = new Map<string, ConvexOrder>()
  for (const { order, id, day } of included) {
    const cd: Record<string, unknown> = isRecord(order.customerData) ? { ...order.customerData } : {}
    if (order.customerData !== undefined && order.customerData !== null && !isRecord(order.customerData)) {
      problems.add('customer_data_not_object', 'warn', 'customerData that is not an object: replaced by {} (provenance kept).')
    }
    cd.convex_order_id = order._id
    if (text(order.deliveryAddress) && cd.delivery_address === undefined) cd.delivery_address = order.deliveryAddress
    if (finite(order.deliveryLatitude) !== null && cd.delivery_lat === undefined) cd.delivery_lat = String(order.deliveryLatitude)
    if (finite(order.deliveryLongitude) !== null && cd.delivery_lng === undefined) cd.delivery_lng = String(order.deliveryLongitude)
    const numbering = assigned.get(id)!
    if (numbering.renumbered) cd.convex_daily_number = order.dailyNumber

    const status = order.status ?? 'pending'
    if (!(ORDER_STATUSES as readonly string[]).includes(status)) {
      problems.add('bad_status', 'block', `Order status outside ${ORDER_STATUSES.join('/')}.`)
    }
    const paymentStatus = order.paymentStatus ?? 'pending'
    if (!(PAYMENT_STATUSES as readonly string[]).includes(paymentStatus)) {
      problems.add('bad_payment_status', 'block', `Payment status outside ${PAYMENT_STATUSES.join('/')}.`)
    }
    const source = order.source ?? 'web'
    if (!(ORDER_SOURCES as readonly string[]).includes(source)) {
      problems.add('bad_source', 'block', `Order source outside ${ORDER_SOURCES.join('/')}.`)
    }
    if ((finite(order.total) ?? 0) < 0) problems.add('negative_total', 'block', 'An order total below zero.')
    if (finite(order.total) === null) problems.add('missing_total', 'warn', 'An order without a total: imported as ₱0.')

    let orderTypeId: string | null = null
    let orderTypeName = text(order.orderType)
    const typeId = uuidOrNull(order.orderTypeId)
    if (typeId) {
      const type = orderTypes.get(typeId)
      if (!type) {
        problems.add('order_type_missing', 'warn', 'Order types no longer on the platform: link dropped, name kept.')
      } else if (type.tenantId.toLowerCase() !== tenantId.toLowerCase()) {
        problems.add(
          'foreign_order_type',
          'block',
          'Orders whose order type belongs to ANOTHER store: this deployment holds more than one store’s orders. Separate them before importing.'
        )
      } else {
        orderTypeId = typeId
        orderTypeName = orderTypeName ?? type.name
      }
    } else if (order.orderTypeId) {
      problems.add('order_type_not_uuid', 'warn', 'Order type ids that are not uuids: link dropped, name kept.')
    }

    const methodName = text(order.paymentMethod)
    let paymentMethodId: string | null = null
    if (methodName) {
      paymentMethodId = methodByName.get(norm(methodName)) ?? null
      if (!paymentMethodId) unmappedMethods.set(methodName, (unmappedMethods.get(methodName) ?? 0) + 1)
    }

    let outletId: string | null = null
    const claimedOutlet = text(order.outletId) ?? text(cd.outlet_id)
    if (claimedOutlet) {
      const outlet = uuidOrNull(claimedOutlet)
      if (outlet && outlets.has(outlet)) outletId = outlet
      else problems.add('unknown_outlet', 'warn', 'Orders naming a branch the store no longer has: branch dropped (customer_data keeps it).')
    }

    const times = {
      scheduled: isoFromText(order.scheduledFor),
      edited: isoFromText(order.editedAt),
      promised: isoFromText(order.promisedReadyAt),
    }
    for (const value of Object.values(times)) {
      if (value === 'invalid') problems.add('unparsed_timestamp', 'warn', 'Timestamps Convex stored as unreadable text: left empty.')
    }
    const iso = (value: string | null | 'invalid') => (value === 'invalid' ? null : value)
    const editedBy = text(order.editedBy)
    if (editedBy && !uuidOrNull(editedBy)) problems.add('editor_not_uuid', 'info', 'edited_by values that are not user ids: left empty.')

    const prep = finite(order.prepMinutes)
    const discount = isRecord(cd.discount) && typeof cd.discount.total === 'number' ? (cd.discount as Record<string, unknown>) : null
    const createdAt = isoFromMillis(orderBusinessTime(order))
    const row: PlatformOrderRow = {
      id,
      tenant_id: tenantId,
      customer_name: typeof order.customerName === 'string' ? order.customerName : null,
      customer_contact: text(order.customerContact),
      total: pesos(order.total),
      status,
      created_at: createdAt,
      updated_at: createdAt,
      order_type_id: orderTypeId,
      order_type: orderTypeName,
      customer_data: cd,
      delivery_fee: pesos(order.deliveryFee),
      service_charge_amount: pesos(order.serviceCharge),
      scheduled_for: iso(times.scheduled),
      payment_method_id: paymentMethodId,
      payment_method_name: methodName,
      payment_method_details: text(order.paymentMethodDetails),
      payment_status: paymentStatus,
      payment_proof_url: text(cd.payment_proof_url),
      payment_proof_public_id: text(cd.payment_proof_public_id),
      payment_proof_reference: text(cd.payment_proof_reference),
      source,
      client_order_id: text(order.clientOrderId),
      item_count: finite(order.itemCount) !== null && Number.isInteger(order.itemCount) ? (order.itemCount as number) : null,
      has_upsell_items: order.hasUpsellItems === true,
      has_bundle_items: order.hasBundleItems === true,
      outlet_id: outletId,
      amount_paid: 0, // set below from the ledger
      revision_number: Math.max(0, Math.trunc(finite(order.revisionNumber) ?? 0)),
      edited_at: iso(times.edited),
      edited_by: uuidOrNull(editedBy),
      discount_total: discount ? Math.max(0, pesos(discount.total)) : 0,
      discount_data: discount,
      lalamove_quotation_id: text(order.lalamoveQuotationId),
      lalamove_order_id: text(order.lalamoveOrderId),
      lalamove_status: text(order.lalamoveStatus),
      lalamove_driver_name: text(order.lalamoveDriverName),
      lalamove_driver_phone: text(order.lalamoveDriverPhone),
      lalamove_tracking_url: text(order.lalamoveTrackingUrl),
      prep_minutes: prep !== null && Number.isInteger(prep) && prep >= 1 && prep <= 240 ? prep : null,
      promised_ready_at: iso(times.promised),
      daily_number: numbering.number,
      order_date: day,
    }
    orderRows.push(row)
    orderById.set(id, row)
    convexOrderById.set(order._id, order)
  }
  if (unmappedMethods.size > 0) {
    problems.add(
      'unmapped_payment_method',
      'warn',
      `Payment method names with no matching method in the store: payment_method_id left empty, name kept (${[...unmappedMethods.keys()].join(', ')}).`,
      [...unmappedMethods.values()].reduce((sum, n) => sum + n, 0)
    )
  }

  const includedConvexIds = new Set(convexOrderById.keys())
  const skippedConvexIds = new Set(sortedOrders.map((order) => order._id).filter((id) => !includedConvexIds.has(id)))

  // ── Items ──────────────────────────────────────────────────────────────
  const itemRows: PlatformOrderItemRow[] = []
  let nulledMenuLinks = 0
  const sortedItems = [...snapshot.orderItems].sort((a, b) => a._creationTime - b._creationTime || a._id.localeCompare(b._id))
  for (const item of sortedItems) {
    if (!includedConvexIds.has(item.orderId)) {
      if (!skippedConvexIds.has(item.orderId)) problems.add('orphan_item', 'warn', 'Order lines whose order is not in the snapshot: not imported.')
      continue
    }
    itemRows.push(mapItem(item, menuItems, problems, () => nulledMenuLinks++))
  }
  if (nulledMenuLinks > 0) {
    problems.add('menu_item_gone', 'info', 'Order lines for dishes no longer on the menu: dish link empty, name and price kept.', nulledMenuLinks)
  }

  // ── Payments: creation order, the way the refund guard will see them ──
  const paymentRows: PlatformOrderPaymentRow[] = []
  const sortedPayments = [...snapshot.orderPayments].sort(
    (a, b) => paymentTime(a) - paymentTime(b) || a._creationTime - b._creationTime || a._id.localeCompare(b._id)
  )
  const ledger = new Map<string, { rows: number; charged: number; refunded: number }>()
  for (const payment of sortedPayments) {
    if (!includedConvexIds.has(payment.orderId)) {
      if (!skippedConvexIds.has(payment.orderId)) problems.add('orphan_payment', 'warn', 'Payments whose order is not in the snapshot: not imported.')
      continue
    }
    const kind = payment.kind ?? 'charge'
    if (kind !== 'charge' && kind !== 'refund') {
      problems.add('bad_payment_kind', 'block', 'Payment rows that are neither a charge nor a refund.')
      continue
    }
    const cents = toCents(finite(payment.amount) ?? 0)
    if (cents <= 0) {
      problems.add('non_positive_payment', 'warn', 'Payment rows of ₱0 or less (the ledger refuses them): not imported.')
      continue
    }
    const orderId = idMap[payment.orderId]
    const order = orderById.get(orderId)!
    const state = ledger.get(orderId) ?? { rows: 0, charged: 0, refunded: 0 }
    if (kind === 'refund') {
      const charged = state.rows === 0 && (order.payment_status === 'paid' || order.payment_status === 'verified') ? toCents(order.total) : state.charged
      if (state.refunded + cents > charged) {
        problems.add('refund_exceeds_charges', 'block', 'Refunds larger than what was charged before them: order_payments_refund_guard would refuse the load.')
      }
      state.refunded += cents
    } else {
      state.charged += cents
    }
    state.rows++
    ledger.set(orderId, state)
    const convexOrder = convexOrderById.get(payment.orderId)!
    const methodName = text(payment.paymentMethodName) ?? text(convexOrder.paymentMethod)
    const claimedMethod = uuidOrNull(payment.paymentMethodId)
    const outlet = uuidOrNull(payment.outletId)
    const recordedBy = text(payment.recordedBy)
    if (recordedBy && !uuidOrNull(recordedBy)) problems.add('recorder_not_uuid', 'info', 'recorded_by values that are not user ids: left empty.')
    paymentRows.push({
      id: uuidV5(payment._id),
      tenant_id: tenantId,
      order_id: orderId,
      kind,
      amount: cents / 100,
      payment_method_id:
        claimedMethod && methodIds.has(claimedMethod) ? claimedMethod : methodName ? methodByName.get(norm(methodName)) ?? null : null,
      payment_method_name: methodName,
      reference: text(payment.reference),
      proof_url: text(payment.proofUrl),
      proof_public_id: text(payment.proofPublicId),
      recorded_by: uuidOrNull(recordedBy),
      outlet_id: outlet && outlets.has(outlet) ? outlet : null,
      note: text(payment.note),
      created_at: isoFromMillis(paymentTime(payment)),
    })
  }

  // amount_paid: the ledger when there is one, else what Convex said was collected.
  let amountPaidCents = 0
  let paidMismatch = 0
  for (const row of orderRows) {
    const state = ledger.get(row.id)
    const convexPaid = toCents(Math.max(0, finite(convexOrderById.get(String(row.customer_data.convex_order_id))?.amountPaid) ?? 0))
    const cents = state ? state.charged - state.refunded : convexPaid
    if (state && finite(convexOrderById.get(String(row.customer_data.convex_order_id))?.amountPaid) !== null && cents !== convexPaid) paidMismatch++
    row.amount_paid = cents / 100
    amountPaidCents += cents
  }
  if (paidMismatch > 0) {
    problems.add('amount_paid_differs', 'info', 'Orders whose Convex amountPaid differs from their payment rows: the platform takes the payment rows.', paidMismatch)
  }

  // ── Revisions ──────────────────────────────────────────────────────────
  const revisionRows: PlatformOrderRevisionRow[] = []
  const revisionKeys = new Set<string>()
  const sortedRevisions = [...snapshot.orderRevisions].sort((a, b) => a._creationTime - b._creationTime || a._id.localeCompare(b._id))
  for (const revision of sortedRevisions) {
    if (!includedConvexIds.has(revision.orderId)) {
      if (!skippedConvexIds.has(revision.orderId)) problems.add('orphan_revision', 'warn', 'Edits whose order is not in the snapshot: not imported.')
      continue
    }
    const number = finite(revision.revisionNumber)
    if (number === null || !Number.isInteger(number) || number < 1) {
      problems.add('revision_without_number', 'warn', 'Edits without a revision number: not imported.')
      continue
    }
    const orderId = idMap[revision.orderId]
    const key = `${orderId}#${number}`
    if (revisionKeys.has(key)) {
      problems.add('duplicate_revision_number', 'block', 'Two edits of one order with the same revision number (order_revisions_number_uq refuses the second).')
      continue
    }
    revisionKeys.add(key)
    const order = orderById.get(orderId)!
    order.revision_number = Math.max(order.revision_number, number)
    const outlet = uuidOrNull(revision.outletId)
    revisionRows.push({
      id: uuidV5(revision._id),
      tenant_id: tenantId,
      order_id: orderId,
      revision_number: number,
      items_before: revision.itemsBefore ?? [],
      items_after: revision.itemsAfter ?? [],
      total_before: pesos(revision.totalBefore),
      total_after: pesos(revision.totalAfter),
      reason: text(revision.reason),
      revised_by: uuidOrNull(revision.revisedBy),
      outlet_id: outlet && outlets.has(outlet) ? outlet : null,
      created_at: isoFromMillis(revision._creationTime),
    })
  }

  // ── Product costs → public.product_costs (read by order_items_cost_snapshot) ─
  const costRows: PlatformProductCostRow[] = []
  const platformCosts = new Set(platform.productCostMenuItemIds.map((id) => id.toLowerCase()))
  const latestCost = new Map<string, ConvexProductCost>()
  let droppedCosts = 0
  let costsAlreadyOnPlatform = 0
  for (const cost of snapshot.productCosts) {
    const menuItemId = uuidOrNull(cost.menuItemId)
    if (!menuItemId || !menuItems.has(menuItemId)) {
      droppedCosts++
      continue
    }
    const previous = latestCost.get(menuItemId)
    if (!previous || (finite(cost.updatedAt) ?? cost._creationTime) > (finite(previous.updatedAt) ?? previous._creationTime)) {
      latestCost.set(menuItemId, cost)
    }
  }
  for (const [menuItemId, cost] of [...latestCost.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (platformCosts.has(menuItemId)) {
      costsAlreadyOnPlatform++
      continue
    }
    const price = finite(cost.costPrice) ?? 0
    if (price < 0) {
      problems.add('negative_cost', 'warn', 'Product costs below zero: not imported.')
      continue
    }
    costRows.push({
      id: uuidV5(cost._id),
      tenant_id: tenantId,
      menu_item_id: menuItemId,
      cost_price: Math.round(price * 10000) / 10000,
      cost_notes: text(cost.costNotes),
      created_at: isoFromMillis(finite(cost.createdAt) ?? cost._creationTime),
      updated_at: isoFromMillis(finite(cost.updatedAt) ?? cost._creationTime),
    })
  }
  if (droppedCosts > 0) {
    problems.add('cost_menu_item_gone', 'info', 'Product costs for dishes no longer on the menu (product_costs needs the dish): not imported.', droppedCosts)
  }
  if (costsAlreadyOnPlatform > 0) {
    problems.add('cost_already_on_platform', 'info', 'Dishes that already have a platform cost: the platform cost is kept.', costsAlreadyOnPlatform)
  }

  // ── Summary ────────────────────────────────────────────────────────────
  const sumCents = (values: number[]) => values.reduce((sum, value) => sum + toCents(value), 0)
  const cancelled = orderRows.filter((row) => row.status === 'cancelled')
  const charges = paymentRows.filter((row) => row.kind === 'charge')
  const refunds = paymentRows.filter((row) => row.kind === 'refund')
  const businessTimes = included.map(({ order }) => orderBusinessTime(order))
  const creationTimes = [
    ...included.map(({ order }) => order._creationTime),
    ...snapshot.orderItems.filter((item) => includedConvexIds.has(item.orderId)).map((item) => item._creationTime),
    ...snapshot.orderPayments.filter((p) => includedConvexIds.has(p.orderId)).map((p) => p._creationTime),
    ...snapshot.orderRevisions.filter((r) => includedConvexIds.has(r.orderId)).map((r) => r._creationTime),
  ]
  const convexKeyedIds = (table: RekeyTable) => platform.convexKeyed[table] ?? []
  const rekey = Object.fromEntries(
    REKEY_TABLES.map((table) => [table, convexKeyedIds(table).filter((id) => idMap[id] !== undefined).length])
  ) as Record<RekeyTable, number>
  const strayKeyed = REKEY_TABLES.reduce(
    (sum, table) => sum + convexKeyedIds(table).filter((id) => idMap[id] === undefined).length,
    0
  )
  if (strayKeyed > 0) {
    problems.add('keyed_rows_without_order', 'warn', 'Stock rows keyed by a non-uuid order id that is not in this snapshot: left as they are.', strayKeyed)
  }
  const activityPlaced = new Set(platform.activityPlacedConvexIds)
  const activityPlacedDuplicates = [...includedConvexIds].filter((id) => activityPlaced.has(id)).length
  const newOrders = orderRows.filter((row) => !existingIds.has(row.id)).length
  if (activityPlacedDuplicates > 0) {
    problems.add(
      'activity_placed_twice',
      'warn',
      'Orders whose sale the Store Activity feed already shows (captured from Convex): store_activity_orders_insert writes a second “order placed” row for each. No restore setting suppresses it and store_activity is append-only.',
      activityPlacedDuplicates
    )
  }
  const nativeTimes = nativeOrders.map((order) => order.createdAt).sort()
  const notMoved = Object.entries(snapshot.tableCounts)
    .filter(([table, rows]) => !IMPORTED_TABLES.has(table) && !table.startsWith('_') && rows > 0)
    .map(([table, rows]) => ({ table, rows, why: NOT_MOVED_TABLES[table] ?? 'not part of the order history (left in Convex)' }))
    .sort((a, b) => a.table.localeCompare(b.table))

  const summary: ImportSummary = {
    tenantId,
    slug: platform.tenant.slug,
    snapshotCounts: {
      orders: snapshot.orders.length,
      orderItems: snapshot.orderItems.length,
      orderPayments: snapshot.orderPayments.length,
      orderRevisions: snapshot.orderRevisions.length,
      productCosts: snapshot.productCosts.length,
    },
    orders: {
      count: orderRows.length,
      cents: sumCents(orderRows.map((row) => row.total)),
      cancelled: { count: cancelled.length, cents: sumCents(cancelled.map((row) => row.total)) },
      amountPaidCents,
    },
    items: {
      count: itemRows.length,
      cents: sumCents(itemRows.map((row) => row.subtotal)),
      quantity: itemRows.reduce((sum, row) => sum + row.quantity, 0),
      nulledMenuLinks,
    },
    payments: {
      charges: { count: charges.length, cents: sumCents(charges.map((row) => row.amount)) },
      refunds: { count: refunds.length, cents: sumCents(refunds.map((row) => row.amount)) },
    },
    revisions: { count: revisionRows.length },
    productCosts: {
      toInsert: costRows.length,
      alreadyOnPlatform: costsAlreadyOnPlatform,
      droppedNoMenuItem: droppedCosts,
      expectedPresent: costRows.length + costsAlreadyOnPlatform,
    },
    firstOrderAt: businessTimes.length ? isoFromMillis(Math.min(...businessTimes)) : null,
    lastOrderAt: businessTimes.length ? isoFromMillis(Math.max(...businessTimes)) : null,
    newestCreationTime: creationTimes.length ? Math.max(...creationTimes) : null,
    tradingDays: convexDays.size,
    alreadyOnPlatform: orderRows.length - newOrders,
    existingPlatformOrders: nativeOrders.length,
    existingPlatformRange: { first: nativeTimes[0] ?? null, last: nativeTimes[nativeTimes.length - 1] ?? null },
    daysSharedWithPlatform: sharedDays,
    renumbered,
    skippedSameClientOrderId: skippedSameClient,
    rekey,
    untouchedKeyed: platform.untouchedKeyed,
    customerLinks: platform.customerLinkedConvexIds.filter((id) => includedConvexIds.has(id)).length,
    activityRowsWritten: newOrders + paymentRows.filter((row) => !existingIds.has(row.order_id)).length +
      revisionRows.filter((row) => !existingIds.has(row.order_id)).length,
    activityPlacedDuplicates,
    notMoved,
    unmappedPaymentMethods: [...unmappedMethods.entries()].map(([name, orders]) => ({ name, orders })),
  }

  return {
    rows: {
      orders: orderRows,
      order_items: itemRows,
      order_payments: paymentRows,
      order_revisions: revisionRows,
      product_costs: costRows,
      idMap,
    },
    problems: problems.list(),
    summary,
  }
}

function mapItem(
  item: ConvexOrderItem,
  menuItems: Set<string>,
  problems: ProblemLog,
  onNulled: () => void
): PlatformOrderItemRow {
  const quantity = finite(item.quantity) ?? 1
  if (!Number.isInteger(quantity) || quantity < 1) {
    problems.add('bad_quantity', 'block', 'Order lines whose quantity is not a whole number of at least 1 (order_items_qty_ck).')
  }
  if ((finite(item.price) ?? 0) < 0 || (finite(item.subtotal) ?? 0) < 0) {
    problems.add('negative_line', 'block', 'Order lines with a price or subtotal below zero.')
  }
  const menuItemId = uuidOrNull(item.menuItemId)
  const keepsLink = menuItemId !== null && menuItems.has(menuItemId)
  if (!keepsLink) onNulled()

  const addonNames: string[] = []
  const addonDetails: Array<{ name: string; price: number | null; quantity: number }> = []
  for (const addon of item.addons ?? []) {
    if (typeof addon === 'string') {
      addonNames.push(addon)
      addonDetails.push({ name: addon, price: null, quantity: 1 })
    } else if (isRecord(addon) && typeof addon.name === 'string') {
      const portions = finite(addon.quantity)
      addonNames.push(addon.name)
      addonDetails.push({
        name: addon.name,
        price: finite(addon.price) === null ? null : pesos(addon.price),
        quantity: portions !== null && Number.isInteger(portions) && portions >= 1 ? portions : 1,
      })
    }
  }
  const selections = Array.isArray(item.variationSelections)
    ? item.variationSelections.filter(isRecord).map((selection) => ({
        typeName: typeof selection.typeName === 'string' ? selection.typeName : '',
        optionName: typeof selection.optionName === 'string' ? selection.optionName : '',
        priceAdjustment: finite(selection.priceAdjustment) ?? 0,
      }))
    : null
  if (item.presellDate) {
    problems.add('presell_date_dropped', 'info', 'Pre-sale pickup dates on order lines: the platform line has no such column (dropped).')
  }
  const bundleId = text(item.bundleId)
  return {
    id: uuidV5(item._id),
    order_id: uuidV5(item.orderId),
    menu_item_id: keepsLink ? menuItemId : null,
    menu_item_name: text(item.menuItemName) ?? 'Unknown item',
    variation: text(item.variation),
    addons: addonNames,
    addon_details: addonDetails.length > 0 ? addonDetails : null,
    quantity: Number.isInteger(quantity) ? quantity : Math.max(1, Math.round(quantity)),
    price: pesos(item.price),
    subtotal: pesos(item.subtotal),
    special_instructions: text(item.specialInstructions),
    variation_selections: selections && selections.length > 0 ? selections : null,
    is_upsell_item: item.isUpsellItem === true,
    is_bundle_item: item.isBundleItem === true,
    bundle_id: bundleId ? uuidOrNull(bundleId) : null,
    bundle_name: text(item.bundleName),
    slot_name: text(item.slotName),
  }
}

export const hasBlockingProblem = (plan: Pick<ImportPlan, 'problems'>): boolean =>
  plan.problems.some((problem) => problem.severity === 'block')

