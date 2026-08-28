/**
 * Scheduled-orders agenda logic — pure selection and grouping over the same
 * recent-order page every other operations screen reads.
 *
 * A schedule rides an order two ways, and both must be read (see
 * src/lib/advance-order-utils.ts on the web side): a UTC ISO in the
 * `scheduledFor` column/DTO field, and a customer-captured human label in
 * `customerData.scheduled_for_label`. Web-created Convex orders carry the ISO
 * only inside `customerData.scheduled_for`, so the reader falls back there.
 * The label is preferred over reformatting because it was captured in the
 * customer's local zone at checkout; a server or CI zone can't drift it.
 *
 * All formatting is hand-rolled (no toLocaleString) to match the platform's
 * label shape exactly: "Thu, Jun 18 · 5:30 PM".
 */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const MS_PER_MINUTE = 60_000;

/** Order statuses still on the board — a delivered or cancelled pre-order is history, not agenda. */
export const ACTIVE_SCHEDULED_STATUSES = ["pending", "confirmed", "preparing", "ready"] as const;

/** Minutes before the requested time at which an order becomes "due soon". */
export const DEFAULT_DUE_SOON_MINUTES = 60;

/** Order-shaped subset the agenda needs, as both backends deliver it to the app. */
export interface ScheduledSourceOrder {
  _id: string;
  status: string;
  scheduledFor?: string | null;
  customerData?: Record<string, unknown> | null;
}

export type ScheduledOrder<T extends ScheduledSourceOrder = ScheduledSourceOrder> = T & {
  /** Epoch ms of the requested fulfillment time. */
  scheduledAtMs: number;
};

export type ScheduleBand = "overdue" | "due-soon" | "upcoming";

export interface ScheduleDay {
  /** Local "YYYY-MM-DD" of the day. */
  key: string;
  /** "Today" / "Tomorrow" / "Sat, Jun 20". */
  label: string;
  count: number;
}

export interface TimeGroup<T extends ScheduledSourceOrder> {
  /** "5:30 PM" — the group's requested time. */
  label: string;
  orders: ScheduledOrder<T>[];
}

/** ISO of the requested time: the field first, then the customerData fallback. */
export function getScheduledISO(
  order: ScheduledSourceOrder | null | undefined,
): string | null {
  if (!order) return null;
  if (order.scheduledFor) return order.scheduledFor;
  const fromData = order.customerData?.scheduled_for;
  return typeof fromData === "string" && fromData ? fromData : null;
}

/** Display label, preferring the customer-captured one, else formatting the ISO. */
export function getScheduledLabel(
  order: ScheduledSourceOrder | null | undefined,
): string | null {
  if (!order) return null;
  const label = order.customerData?.scheduled_for_label;
  if (typeof label === "string" && label) return label;
  const iso = getScheduledISO(order);
  return iso ? formatScheduledFor(iso) : null;
}

/** "Thu, Jun 18 · 5:30 PM" in the runtime's local zone; "" for garbage input. */
export function formatScheduledFor(input: string | Date): string {
  const dt = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(dt.getTime())) return "";
  return `${WEEKDAYS[dt.getDay()]}, ${MONTHS[dt.getMonth()]} ${dt.getDate()} · ${formatTime12(dt)}`;
}

function formatTime12(dt: Date): string {
  const hours24 = dt.getHours();
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const minutes = String(dt.getMinutes()).padStart(2, "0");
  return `${hours12}:${minutes} ${hours24 < 12 ? "AM" : "PM"}`;
}

/** Active orders carrying a valid schedule, soonest first, stamped with epoch ms. */
export function selectScheduledOrders<T extends ScheduledSourceOrder>(
  orders: readonly T[] | undefined,
): ScheduledOrder<T>[] {
  if (!orders) return [];
  return orders
    .filter((order) =>
      (ACTIVE_SCHEDULED_STATUSES as readonly string[]).includes(order.status),
    )
    .flatMap((order) => {
      const iso = getScheduledISO(order);
      if (!iso) return [];
      const scheduledAtMs = new Date(iso).getTime();
      if (Number.isNaN(scheduledAtMs)) return [];
      return [{ ...order, scheduledAtMs }];
    })
    .sort((a, b) => a.scheduledAtMs - b.scheduledAtMs);
}

/** Urgency band of a requested time relative to now. */
export function getScheduleBand(
  scheduledAtMs: number,
  nowMs: number,
  dueSoonMinutes: number = DEFAULT_DUE_SOON_MINUTES,
): ScheduleBand {
  if (scheduledAtMs < nowMs) return "overdue";
  if (scheduledAtMs - nowMs <= dueSoonMinutes * MS_PER_MINUTE) return "due-soon";
  return "upcoming";
}

/** Local "YYYY-MM-DD" for an epoch ms. */
function dayKeyOf(ms: number): string {
  const dt = new Date(ms);
  const month = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${month}-${day}`;
}

/** Local day key for "now" — the strip's first chip and the screen's default day. */
export function todayKey(nowMs: number): string {
  return dayKeyOf(nowMs);
}

function dayLabel(key: string, nowMs: number): string {
  if (key === todayKey(nowMs)) return "Today";
  const [year, month, day] = key.split("-").map(Number);
  const dt = new Date(year, month - 1, day);
  const tomorrow = new Date(nowMs);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (key === dayKeyOf(tomorrow.getTime())) return "Tomorrow";
  return `${WEEKDAYS[dt.getDay()]}, ${MONTHS[dt.getMonth()]} ${dt.getDate()}`;
}

/**
 * Day chips for the agenda header: Today always (even empty, so the strip is
 * never blank), then each future day that has orders. Days already missed fold
 * into Today — a pre-order the store failed to hand off yesterday is today's
 * problem, not a chip nobody would think to tap.
 */
export function buildDateStrip(
  scheduled: readonly { scheduledAtMs: number }[],
  nowMs: number,
): ScheduleDay[] {
  const today = todayKey(nowMs);
  const counts = new Map<string, number>([[today, 0]]);
  for (const order of scheduled) {
    const key = dayKeyOf(order.scheduledAtMs);
    const bucket = key <= today ? today : key;
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => ({ key, label: dayLabel(key, nowMs), count }));
}

/** The day's agenda; Today additionally carries everything overdue from before. */
export function ordersForDay<T extends ScheduledSourceOrder>(
  scheduled: readonly ScheduledOrder<T>[],
  dayKey: string,
  nowMs: number,
): ScheduledOrder<T>[] {
  const isToday = dayKey === todayKey(nowMs);
  return scheduled.filter((order) => {
    const key = dayKeyOf(order.scheduledAtMs);
    return isToday ? key <= dayKey : key === dayKey;
  });
}

/** Same-minute orders under one time heading, in time order. Input is pre-sorted. */
export function groupByTime<T extends ScheduledSourceOrder>(
  scheduled: readonly ScheduledOrder<T>[],
): TimeGroup<T>[] {
  const groups: TimeGroup<T>[] = [];
  for (const order of scheduled) {
    const label = formatTime12(new Date(order.scheduledAtMs));
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      groups[groups.length - 1] = { ...last, orders: [...last.orders, order] };
    } else {
      groups.push({ label, orders: [order] });
    }
  }
  return groups;
}
