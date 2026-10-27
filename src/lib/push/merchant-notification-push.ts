/**
 * Pushes for the merchant app's bell: low / out of stock, and cash alerts
 * (a shift still open past its business day, a remittance waiting to be
 * accepted — CONTRACTS W3.3).
 *
 * `merchant_notifications` rows are written by a statement trigger on
 * `stock_alerts` (migration 20261012120000), which posts their ids to
 * `/api/push/notify-merchant`. This pure core decides who hears about them and
 * what the push says; the route owns the I/O.
 *
 * Who hears what mirrors the table's RLS
 * (`app_user_may_read_merchant_notifications`), so a push never announces a
 * row the recipient's bell would then refuse to show.
 *
 * The app composes the same text for its list, and mirrors the recipient rule
 * for its bell (`webnegosyo-app/lib/merchant-notifications/
 * merchant-notifications.ts`) — change both; `tests/unit/merchant-notification-
 * parity.test.ts` fails when the wording drifts.
 */
import { z } from 'zod'

/** A batch is one stock_alerts statement; this bounds a hostile replay. */
const MAX_NOTIFICATIONS_PER_REQUEST = 200

/** Names shown in a folded push before "and N more". */
const NAMES_PER_GROUP = 2

/** Staff need this permission to open the app's Stock screen. */
const STOCK_PERMISSION = 'menu'

/** Cash alerts are for the people who handle cash (W3.3). */
const CASH_PERMISSION = 'cash_manage'

export const CASH_NOTIFICATION_KINDS: readonly CashNotificationKind[] = ['shift_overdue', 'remittance_pending']

export function isCashNotificationKind(kind: unknown): kind is CashNotificationKind {
  return kind === 'shift_overdue' || kind === 'remittance_pending'
}

const notifyMerchantPayloadSchema = z.object({
  notification_ids: z.array(z.string().uuid()).min(1).max(MAX_NOTIFICATIONS_PER_REQUEST),
})

export type NotifyMerchantPayload = z.infer<typeof notifyMerchantPayloadSchema>

export type StockNotificationKind = 'stock_low' | 'stock_out'

export interface StockNotification {
  id: string
  tenant_id: string
  /** NULL = about the whole store. */
  outlet_id: string | null
  kind: StockNotificationKind
  inventory_item_id: string | null
  item_name: string
  unit: string | null
  outlet_name: string | null
  quantity: number | null
  reorder_level: number | null
}

export interface DeviceTokenRow {
  token: string
  user_id: string
  tenant_id: string | null
}

export interface AccountRow {
  user_id: string
  tenant_id: string | null
  role: string
  is_owner: boolean | null
  permissions: string[] | null
  outlet_id: string | null
}

/** A device, with the store account it is signed into. */
export interface DeviceAccount extends AccountRow {
  token: string
}

export type CashNotificationKind = 'shift_overdue' | 'remittance_pending'

/** A cash bell row (W3.3): `item_name` is the person's name at notice time. */
export interface CashNotification {
  id: string
  tenant_id: string
  outlet_id: string | null
  kind: CashNotificationKind
  item_name: string
  outlet_name: string | null
  drawer_name: string | null
  /** remittance_pending only; null = an uncounted hand-over. */
  cash_cents: number | null
  shift_id: string | null
  remittance_id: string | null
}

export type CashPushData = { type: 'cash_alert'; kind: CashNotificationKind; shiftId?: string; remittanceId?: string }

export interface MerchantPushMessage {
  to: string
  sound: 'default'
  /**
   * Android channel created by the app (`lib/notifications.ts`). Not the
   * order ringtone. `cash-alerts` must be created by the app too; until it
   * is, Android shows those pushes on its quiet fallback channel.
   */
  channelId: 'stock-alerts' | 'cash-alerts'
  priority: 'high'
  title: string
  body: string
  data: { type: 'stock_alert'; inventoryItemId?: string } | CashPushData
}

/** The trigger payload, or null when the caller sent something else. */
export function parseNotifyMerchantPayload(body: unknown): NotifyMerchantPayload | null {
  const parsed = notifyMerchantPayloadSchema.safeParse(body)
  return parsed.success ? parsed.data : null
}

function canOpenStock(account: AccountRow): boolean {
  return (
    account.is_owner === true ||
    account.role === 'superadmin' ||
    account.permissions === null ||
    account.permissions.includes(STOCK_PERMISSION)
  )
}

function canReachBranch(account: AccountRow, outletId: string | null): boolean {
  return (
    outletId === null ||
    account.outlet_id === null ||
    account.is_owner === true ||
    account.outlet_id === outletId
  )
}

/** Mirrors `app_user_may_read_merchant_notifications`. */
export function canReadMerchantNotification(
  account: AccountRow,
  notification: Pick<StockNotification, 'tenant_id' | 'outlet_id'>,
): boolean {
  if (account.tenant_id !== notification.tenant_id) return false
  if (account.role !== 'admin' && account.role !== 'superadmin') return false
  return canOpenStock(account) && canReachBranch(account, notification.outlet_id)
}

/** "2.5 kg", "5 kg", "3" — at most two decimals, no trailing zeros. */
export function formatStockQuantity(quantity: number, unit: string | null): string {
  const rounded = String(Math.round(quantity * 100) / 100)
  return unit ? `${rounded} ${unit}` : rounded
}

export function describeStockNotification(notification: StockNotification): {
  title: string
  body: string
} {
  const isOut = notification.kind === 'stock_out'
  const title = isOut
    ? `${notification.item_name} is out of stock`
    : `${notification.item_name} is running low`

  const quantity = notification.quantity ?? 0
  const left = isOut || quantity <= 0 ? 'None left' : `${formatStockQuantity(quantity, notification.unit)} left`
  const reorder =
    notification.reorder_level && notification.reorder_level > 0
      ? `reorder at ${formatStockQuantity(notification.reorder_level, notification.unit)}`
      : null

  const parts = [notification.outlet_id ? notification.outlet_name : null, left, reorder].filter(
    (part): part is string => Boolean(part),
  )
  return { title, body: parts.join(' · ') }
}

function listNames(names: readonly string[]): string {
  if (names.length <= NAMES_PER_GROUP) return names.join(', ')
  const shown = names.slice(0, NAMES_PER_GROUP).join(', ')
  return `${shown} and ${names.length - NAMES_PER_GROUP} more`
}

function describeBatch(notifications: readonly StockNotification[]): { title: string; body: string } {
  const out = notifications.filter((n) => n.kind === 'stock_out').map((n) => n.item_name)
  const low = notifications.filter((n) => n.kind !== 'stock_out').map((n) => n.item_name)
  const body = [out.length ? `Out: ${listNames(out)}` : null, low.length ? `Low: ${listNames(low)}` : null]
    .filter((part): part is string => Boolean(part))
    .join(' · ')
  return { title: `${notifications.length} ingredients need restocking`, body }
}

/**
 * One message per device, holding only what that device's account may read.
 * A batch folds into one push so a single order that drains three ingredients
 * buzzes once.
 */
export function buildMerchantNotificationMessages(
  notifications: readonly StockNotification[],
  devices: readonly DeviceAccount[],
): MerchantPushMessage[] {
  return devices.flatMap((device): MerchantPushMessage[] => {
    const visible = notifications.filter((n) => canReadMerchantNotification(device, n))
    if (visible.length === 0) return []

    const single = visible.length === 1 ? visible[0] : null
    const text = single ? describeStockNotification(single) : describeBatch(visible)
    const data: MerchantPushMessage['data'] =
      single?.inventory_item_id
        ? { type: 'stock_alert', inventoryItemId: single.inventory_item_id }
        : { type: 'stock_alert' }

    return [
      {
        to: device.token,
        sound: 'default',
        channelId: 'stock-alerts',
        priority: 'high',
        title: text.title,
        body: text.body,
        data,
      },
    ]
  })
}

/** Pairs each device with the store account it signed into; drops strays. */
export function joinDeviceAccounts(
  tokens: readonly DeviceTokenRow[],
  accounts: readonly AccountRow[],
): DeviceAccount[] {
  return tokens.flatMap((row): DeviceAccount[] => {
    if (!row.tenant_id) return []
    const match = accounts.find((a) => a.user_id === row.user_id && a.tenant_id === row.tenant_id)
    return match ? [{ ...match, token: row.token }] : []
  })
}

// ── Cash alerts (W3.3) ─────────────────────────────────────────────────────

/** `cash_manage` is opt-in: full access (`permissions: null`) does not hold it. */
function canHandleCash(account: AccountRow): boolean {
  return (
    account.is_owner === true ||
    account.role === 'superadmin' ||
    (account.permissions !== null && account.permissions.includes(CASH_PERMISSION))
  )
}

/** Mirrors `app_user_may_read_merchant_notifications` for the cash kinds: `cash_manage` + branch reach. */
export function canReadCashNotification(
  account: AccountRow,
  notification: Pick<CashNotification, 'tenant_id' | 'outlet_id'>,
): boolean {
  if (account.tenant_id !== notification.tenant_id) return false
  if (account.role !== 'admin' && account.role !== 'superadmin') return false
  return canHandleCash(account) && canReachBranch(account, notification.outlet_id)
}

/** "₱6,345" for whole pesos, "₱6,345.50" otherwise. */
export function formatCashAlertAmount(cents: number): string {
  const isWhole = cents % 100 === 0
  return `₱${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: isWhole ? 0 : 2,
  })}`
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || 'Someone'
}

/** W3.3 wording — identical to the app's `describeCashNotification` (parity-tested). */
export function describeCashNotification(notification: CashNotification): { title: string; body: string } {
  const first = firstName(notification.item_name)
  const where = [notification.outlet_id ? notification.outlet_name : null, notification.drawer_name]
  if (notification.kind === 'shift_overdue') {
    const parts = [...where, 'End it from the Drawer'].filter((part): part is string => Boolean(part))
    return { title: `${first}'s shift is still open`, body: parts.join(' · ') }
  }
  const title =
    notification.cash_cents === null
      ? `${first}'s remittance is waiting to be accepted`
      : `${first}'s ${formatCashAlertAmount(notification.cash_cents)} is waiting to be accepted`
  const parts = [...where, 'Accept it in Remittances'].filter((part): part is string => Boolean(part))
  return { title, body: parts.join(' · ') }
}

function cashPushData(notification: CashNotification): CashPushData {
  return {
    type: 'cash_alert',
    kind: notification.kind,
    ...(notification.shift_id ? { shiftId: notification.shift_id } : {}),
    ...(notification.remittance_id ? { remittanceId: notification.remittance_id } : {}),
  }
}

/** One push per alert per device that may read it (cash alerts are about one person each). */
export function buildCashNotificationMessages(
  notifications: readonly CashNotification[],
  devices: readonly DeviceAccount[],
): MerchantPushMessage[] {
  return devices.flatMap((device) =>
    notifications
      .filter((notification) => canReadCashNotification(device, notification))
      .map((notification): MerchantPushMessage => {
        const text = describeCashNotification(notification)
        return {
          to: device.token,
          sound: 'default',
          channelId: 'cash-alerts',
          priority: 'high',
          title: text.title,
          body: text.body,
          data: cashPushData(notification),
        }
      }),
  )
}
