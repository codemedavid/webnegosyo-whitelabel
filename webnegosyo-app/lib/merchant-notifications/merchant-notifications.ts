// The bell's pure rules: who sees it, what a notice says, what is unread.
//
// Rows live in the platform Supabase `merchant_notifications` table for every
// store (stock is always on the platform DB, whatever serves the orders),
// written by a trigger on `stock_alerts`. The web push route words the same
// notice in `src/lib/push/merchant-notification-push.ts` — change both.
//
// Cash kinds (CONTRACTS W3.3, written by cash.notify_overdue_shifts and the
// remittance trigger, 20261027190000): `shift_overdue` (a shift still open
// after its business day plus the grace) and `remittance_pending` (cash
// waiting over an hour). Their row reuses the table: item_name = the person,
// plus shift_id / remittance_id / drawer_name / cash_cents.

export type StockNotificationKind = "stock_low" | "stock_out";
export type CashNotificationKind = "shift_overdue" | "remittance_pending";
export type MerchantNotificationKind = StockNotificationKind | CashNotificationKind;

export const CASH_NOTIFICATION_KINDS: readonly CashNotificationKind[] = ["shift_overdue", "remittance_pending"];

export function isCashNotificationKind(kind: string): kind is CashNotificationKind {
  return (CASH_NOTIFICATION_KINDS as readonly string[]).includes(kind);
}

export interface MerchantNotification {
  id: string;
  kind: MerchantNotificationKind;
  /** Null = about the whole store. */
  outletId: string | null;
  outletName: string | null;
  inventoryItemId: string | null;
  itemName: string;
  unit: string | null;
  quantity: number | null;
  reorderLevel: number | null;
  createdAt: string;
  /** The stock has since recovered (the alert behind it is resolved). */
  isResolved: boolean;
  /** Cash kinds only. */
  shiftId?: string | null;
  remittanceId?: string | null;
  drawerName?: string | null;
  cashCents?: number | null;
}

export interface MerchantNotificationRow {
  id: string;
  kind: string;
  outlet_id: string | null;
  outlet_name: string | null;
  inventory_item_id: string | null;
  item_name: string;
  unit: string | null;
  quantity: number | string | null;
  reorder_level: number | string | null;
  created_at: string;
  stock_alerts: { resolved_at: string | null } | null;
  shift_id?: string | null;
  remittance_id?: string | null;
  drawer_name?: string | null;
  cash_cents?: number | string | null;
}

/** Staff need this permission to open Stock — the bell follows it. */
const STOCK_PERMISSION = "menu";
/** Cash notices go to whoever receives cash (CONTRACTS W3.3). */
const CASH_PERMISSION = "cash_manage";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const JUST_NOW_MS = MINUTE_MS;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface NotificationSessionState {
  isAuthenticated: boolean;
  isDemo: boolean;
  isOwner: boolean;
  isSuperadmin: boolean;
  impersonatedTenantId: string | null;
  permissions: string[] | null;
}

/**
 * Mirrors the table's RLS (`app_user_may_read_merchant_notifications`): the
 * owner, full-access admins and staff who can open Stock. The demo is a quiet
 * showroom, and a superadmin borrowing a store has no row of their own there.
 */
export function canSeeMerchantNotifications(state: NotificationSessionState): boolean {
  if (!state.isAuthenticated || state.isDemo) return false;
  if (state.isSuperadmin && state.impersonatedTenantId !== null) return false;
  if (state.isOwner || state.isSuperadmin || state.permissions === null) return true;
  return state.permissions.includes(STOCK_PERMISSION);
}

/**
 * The cash kinds' half of the table's RLS (W3.3): owner, full access, or
 * `cash_manage`. Branch confinement is the server's.
 */
export function canSeeCashNotifications(state: NotificationSessionState): boolean {
  if (!state.isAuthenticated || state.isDemo) return false;
  if (state.isSuperadmin && state.impersonatedTenantId !== null) return false;
  if (state.isOwner || state.isSuperadmin || state.permissions === null) return true;
  return state.permissions.includes(CASH_PERMISSION);
}

/** The bell exists for anyone who can read at least one kind of notice. */
export function canOpenMerchantBell(state: NotificationSessionState): boolean {
  return canSeeMerchantNotifications(state) || canSeeCashNotifications(state);
}

function toNumber(value: number | string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toKind(kind: string): MerchantNotificationKind {
  if (kind === "stock_out" || isCashNotificationKind(kind)) return kind;
  return "stock_low";
}

export function toMerchantNotification(row: MerchantNotificationRow): MerchantNotification {
  const isCash = isCashNotificationKind(row.kind);
  return {
    id: row.id,
    kind: toKind(row.kind),
    outletId: row.outlet_id,
    outletName: row.outlet_name,
    inventoryItemId: row.inventory_item_id,
    itemName: row.item_name,
    unit: row.unit,
    quantity: toNumber(row.quantity),
    reorderLevel: toNumber(row.reorder_level),
    createdAt: row.created_at,
    isResolved: Boolean(row.stock_alerts?.resolved_at),
    ...(isCash
      ? {
          shiftId: row.shift_id ?? null,
          remittanceId: row.remittance_id ?? null,
          drawerName: row.drawer_name ?? null,
          cashCents: toNumber(row.cash_cents ?? null),
        }
      : {}),
  };
}

const firstName = (name: string): string => name.trim().split(/\s+/)[0] || name;

/** ₱6,345 (whole pesos) or ₱6,345.50 — the same as the push route. */
function pesosFromCents(cents: number): string {
  const whole = cents % 100 === 0;
  return `₱${(cents / 100).toLocaleString("en-PH", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 })}`;
}

/** The cash notices' words (CONTRACTS W3.3); the push route words them identically. */
export function describeCashNotification(n: MerchantNotification): { title: string; body: string } {
  const who = firstName(n.itemName);
  const where = [n.outletId ? n.outletName : null, n.drawerName ?? null];
  if (n.kind === "shift_overdue") {
    return {
      title: `${who}'s shift is still open`,
      body: [...where, "End it from the Drawer"].filter((part): part is string => Boolean(part)).join(" · "),
    };
  }
  const amount = typeof n.cashCents === "number" ? pesosFromCents(n.cashCents) : null;
  return {
    title: amount ? `${who}'s ${amount} is waiting to be accepted` : `${who}'s remittance is waiting to be accepted`,
    body: [...where, "Accept it in Remittances"].filter((part): part is string => Boolean(part)).join(" · "),
  };
}

/** Any notice's words. */
export function describeNotification(n: MerchantNotification): { title: string; body: string } {
  return isCashNotificationKind(n.kind) ? describeCashNotification(n) : describeStockNotification(n);
}

/** "2.5 kg", "5 kg", "3" — at most two decimals, no trailing zeros. */
function formatQuantity(quantity: number, unit: string | null): string {
  const rounded = String(Math.round(quantity * 100) / 100);
  return unit ? `${rounded} ${unit}` : rounded;
}

export function describeStockNotification(n: MerchantNotification): { title: string; body: string } {
  const isOut = n.kind === "stock_out";
  const title = isOut ? `${n.itemName} is out of stock` : `${n.itemName} is running low`;

  const quantity = n.quantity ?? 0;
  const left = isOut || quantity <= 0 ? "None left" : `${formatQuantity(quantity, n.unit)} left`;
  const reorder =
    n.reorderLevel && n.reorderLevel > 0 ? `reorder at ${formatQuantity(n.reorderLevel, n.unit)}` : null;

  const parts = [n.outletId ? n.outletName : null, left, reorder].filter(
    (part): part is string => Boolean(part)
  );
  return { title, body: parts.join(" · ") };
}

/** One shelf of one ingredient: a "low" notice and its later "out" escalation share it. */
function stockIssueKey(n: MerchantNotification): string {
  // A cash notice is its own issue: two forgotten shifts are two things to do.
  if (isCashNotificationKind(n.kind)) return `cash|${n.id}`;
  return `${n.inventoryItemId ?? n.itemName}|${n.outletId ?? "store"}`;
}

/**
 * Ingredients that got a notice since the list was last opened and still need
 * doing, each shelf once. One that has already recovered is old news — it
 * should not ring the badge.
 */
export function unreadCount(items: readonly MerchantNotification[], seenAt: string | null): number {
  const seen = seenAt ? Date.parse(seenAt) : Number.NEGATIVE_INFINITY;
  const unread = items.filter((n) => !n.isResolved && Date.parse(n.createdAt) > seen);
  return new Set(unread.map(stockIssueKey)).size;
}

/**
 * What to store as "seen" when the list is opened: the newest notice's own
 * (server) timestamp, never the phone's clock — a phone a few minutes off
 * would otherwise leave the badge stuck or swallow the next notice. Null when
 * there is nothing newer than what is already stored.
 */
export function nextSeenAt(items: readonly MerchantNotification[], seenAt: string | null): string | null {
  const newest = items.reduce<string | null>(
    (latest, n) => (latest === null || Date.parse(n.createdAt) > Date.parse(latest) ? n.createdAt : latest),
    null
  );
  if (newest === null) return null;
  if (seenAt !== null && Date.parse(newest) <= Date.parse(seenAt)) return null;
  return newest;
}

/**
 * Ingredients that still need restocking, each shelf counted once: a "low"
 * notice and its later "out" escalation are the same problem.
 */
export function openStockIssueCount(items: readonly MerchantNotification[]): number {
  return new Set(items.filter((n) => !n.isResolved && !isCashNotificationKind(n.kind)).map(stockIssueKey)).size;
}

export interface NotificationGroup {
  title: "Today" | "Earlier";
  items: MerchantNotification[];
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Today / Earlier on the phone's own calendar, newest first, no empty groups. */
export function groupNotificationsByDay(
  items: readonly MerchantNotification[],
  now: Date
): NotificationGroup[] {
  const newestFirst = [...items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const today = newestFirst.filter((n) => isSameDay(new Date(n.createdAt), now));
  const earlier = newestFirst.filter((n) => !isSameDay(new Date(n.createdAt), now));
  const groups: NotificationGroup[] = [
    { title: "Today", items: today },
    { title: "Earlier", items: earlier },
  ];
  return groups.filter((g) => g.items.length > 0);
}

/** "Just now", "25m ago", "3h ago", "Yesterday", "Oct 3". */
export function formatNotificationTime(iso: string, now: Date): string {
  const at = new Date(iso);
  const elapsed = now.getTime() - at.getTime();
  if (isSameDay(at, now)) {
    if (elapsed < JUST_NOW_MS) return "Just now";
    if (elapsed < HOUR_MS) return `${Math.floor(elapsed / MINUTE_MS)}m ago`;
    return `${Math.floor(elapsed / HOUR_MS)}h ago`;
  }
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (isSameDay(at, yesterday)) return "Yesterday";
  return `${MONTHS[at.getMonth()]} ${at.getDate()}`;
}
