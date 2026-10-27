/**
 * POST /api/push/notify-merchant — rings merchant devices for new bell
 * notifications: low / out of stock, and cash alerts (W3.3: a shift still
 * open past its day, a remittance waiting to be accepted).
 *
 * Called by a statement trigger on `public.merchant_notifications` (via
 * pg_net), which is itself fed by `stock_alerts`, so every stock write path
 * notifies without each caller having to remember to.
 *
 * The caller is unauthenticated (pg_net cannot hold a secret a migration would
 * not leak), so nothing in the payload is trusted: rows are re-read by id with
 * the service role, and claiming `push_claimed_at` (only where still NULL)
 * makes replays silent no-ops. Recipients mirror the table's RLS, see
 * `merchant-notification-push.ts`.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  buildCashNotificationMessages,
  buildMerchantNotificationMessages,
  isCashNotificationKind,
  joinDeviceAccounts,
  parseNotifyMerchantPayload,
  type AccountRow,
  type CashNotification,
  type DeviceAccount,
  type DeviceTokenRow,
  type NotifyMerchantPayload,
  type StockNotification,
  type StockNotificationKind,
} from '@/lib/push/merchant-notification-push'
import {
  chaseExpoReceipts,
  describePushFailures,
  sendExpoPushMessages,
  type PushFailure,
  type PushReceiptHandle,
} from '@/lib/push/expo-delivery'
import { afterResponse, pruneStaleTokens } from '@/lib/push/push-route-helpers'

const LOG_LABEL = 'notify-merchant'

type AdminClient = ReturnType<typeof createAdminClient>

/**
 * Every column: the cash columns (shift_id, remittance_id, drawer_name,
 * cash_cents) arrive with migration 20261027190000, and naming them before it
 * is applied would fail the claim and stop stock pushes too.
 */
const NOTIFICATION_COLUMNS = '*'

interface NotificationRow {
  id: string
  tenant_id: string
  outlet_id: string | null
  kind: string
  inventory_item_id: string | null
  item_name: string
  unit: string | null
  outlet_name: string | null
  quantity: number | string | null
  reorder_level: number | string | null
  shift_id?: string | null
  remittance_id?: string | null
  drawer_name?: string | null
  cash_cents?: number | string | null
}

interface ClaimedNotifications {
  stock: StockNotification[]
  cash: CashNotification[]
  ids: string[]
  tenantIds: string[]
}

function toNumber(value: number | string | null): number | null {
  if (value === null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toStockNotification(row: NotificationRow): StockNotification {
  const kind: StockNotificationKind = row.kind === 'stock_out' ? 'stock_out' : 'stock_low'
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    outlet_id: row.outlet_id,
    kind,
    inventory_item_id: row.inventory_item_id,
    item_name: row.item_name,
    unit: row.unit,
    outlet_name: row.outlet_name,
    quantity: toNumber(row.quantity),
    reorder_level: toNumber(row.reorder_level),
  }
}

function toCashNotification(row: NotificationRow & { kind: CashNotification['kind'] }): CashNotification {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    outlet_id: row.outlet_id,
    kind: row.kind,
    item_name: row.item_name,
    outlet_name: row.outlet_name,
    drawer_name: row.drawer_name ?? null,
    cash_cents: toNumber(row.cash_cents ?? null),
    shift_id: row.shift_id ?? null,
    remittance_id: row.remittance_id ?? null,
  }
}

function splitByKind(rows: readonly NotificationRow[]): ClaimedNotifications {
  const cash = rows.filter((row): row is NotificationRow & { kind: CashNotification['kind'] } => isCashNotificationKind(row.kind))
  const stock = rows.filter((row) => !isCashNotificationKind(row.kind))
  return {
    stock: stock.map(toStockNotification),
    cash: cash.map(toCashNotification),
    ids: rows.map((row) => row.id),
    tenantIds: [...new Set(rows.map((row) => row.tenant_id))],
  }
}

/**
 * Gives a claim back when nothing was sent, so `push_claimed_at` keeps meaning
 * "a push went out" and a later replay can still deliver it. Nothing retries
 * on its own — pg_net fires once — but the bell row is there either way.
 */
async function releaseClaims(admin: AdminClient, ids: readonly string[]) {
  const { error } = await admin
    .from('merchant_notifications')
    .update({ push_claimed_at: null })
    .in('id', [...ids])
  if (error) console.error(`[${LOG_LABEL}] claim release failed:`, error.message)
}

type Outcome<T> = { ok: true; value: T } | { ok: false; response: NextResponse }

/**
 * Claims the rows still waiting for a push and returns them. Only rows whose
 * `push_claimed_at` is still NULL come back, so a replay claims nothing.
 */
async function claimNotifications(
  admin: AdminClient,
  ids: readonly string[],
): Promise<Outcome<ClaimedNotifications>> {
  const { data, error } = await admin
    .from('merchant_notifications')
    .update({ push_claimed_at: new Date().toISOString() })
    .in('id', [...ids])
    .is('push_claimed_at', null)
    .select(NOTIFICATION_COLUMNS)

  if (error) {
    console.error(`[${LOG_LABEL}] claim failed:`, error.message)
    return { ok: false, response: NextResponse.json({ error: 'Claim failed' }, { status: 500 }) }
  }
  return { ok: true, value: splitByKind((data ?? []) as NotificationRow[]) }
}

/** Every signed-in store device of these stores, with the account behind it. */
async function readRecipientDevices(
  admin: AdminClient,
  tenantIds: readonly string[],
): Promise<DeviceAccount[] | null> {
  const [tokensResult, accountsResult] = await Promise.all([
    admin.from('platform_device_tokens').select('token, user_id, tenant_id').in('tenant_id', [...tenantIds]),
    admin
      .from('app_users')
      .select('user_id, tenant_id, role, is_owner, permissions, outlet_id')
      .in('tenant_id', [...tenantIds])
      .in('role', ['admin', 'superadmin']),
  ])

  if (tokensResult.error || accountsResult.error) {
    console.error(
      `[${LOG_LABEL}] recipient read failed:`,
      tokensResult.error?.message ?? accountsResult.error?.message,
    )
    return null
  }
  return joinDeviceAccounts(
    (tokensResult.data ?? []) as DeviceTokenRow[],
    (accountsResult.data ?? []) as AccountRow[],
  )
}

/** After the response: read Expo's receipts and forget devices that are gone. */
function followUpDelivery(
  admin: AdminClient,
  tenantIds: readonly string[],
  accepted: readonly PushReceiptHandle[],
  ticketFailures: readonly PushFailure[],
): Promise<void> | void {
  return afterResponse(async () => {
    const receipts = await chaseExpoReceipts(accepted)
    const refusals = describePushFailures(receipts.failures)
    if (refusals) {
      console.error(`[${LOG_LABEL}] tenants ${tenantIds.join(',')} receipt refusals: ${refusals}`)
    }
    await pruneStaleTokens(admin, [...ticketFailures, ...receipts.failures], LOG_LABEL)
  })
}

async function readPayload(request: NextRequest): Promise<Outcome<NotifyMerchantPayload>> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return { ok: false, response: NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  }
  const payload = parseNotifyMerchantPayload(body)
  return payload
    ? { ok: true, value: payload }
    : { ok: false, response: NextResponse.json({ error: 'Invalid payload' }, { status: 400 }) }
}

export async function POST(request: NextRequest) {
  const payload = await readPayload(request)
  if (!payload.ok) return payload.response

  const admin = createAdminClient()

  // Claim first: exactly one send per row, however often the request replays.
  const claim = await claimNotifications(admin, payload.value.notification_ids)
  if (!claim.ok) return claim.response
  const { stock, cash, ids: notificationIds, tenantIds } = claim.value
  if (notificationIds.length === 0) {
    return NextResponse.json({ sent: 0, duplicate: true })
  }

  const devices = await readRecipientDevices(admin, tenantIds)
  if (!devices) {
    await releaseClaims(admin, notificationIds)
    return NextResponse.json({ error: 'Recipient read failed' }, { status: 500 })
  }

  // Stock alerts fold into one push per device; cash alerts are one per person.
  const messages = [...buildMerchantNotificationMessages(stock, devices), ...buildCashNotificationMessages(cash, devices)]
  if (messages.length === 0) {
    return NextResponse.json({ sent: 0 })
  }

  const { accepted, failures, failedChunks } = await sendExpoPushMessages(messages)

  const ticketRefusals = describePushFailures(failures)
  if (ticketRefusals) {
    console.error(`[${LOG_LABEL}] tenants ${tenantIds.join(',')} ticket refusals: ${ticketRefusals}`)
  }
  if (failedChunks > 0) {
    console.error(`[${LOG_LABEL}] ${failedChunks} chunk(s) never reached Expo`)
  }
  if (accepted.length === 0 && failures.length === 0 && failedChunks > 0) {
    // Expo was unreachable for every device: nothing went out.
    await releaseClaims(admin, notificationIds)
    return NextResponse.json({ error: 'Push service unreachable' }, { status: 502 })
  }

  await followUpDelivery(admin, tenantIds, accepted, failures)

  return NextResponse.json({ sent: accepted.length, refused: failures.length })
}
