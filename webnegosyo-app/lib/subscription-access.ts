/**
 * PORT of `src/lib/billing/subscription-status.ts`.
 *
 * Kept byte-for-byte equivalent in behaviour, the same arrangement as
 * `staff-permissions.ts`: the app cannot import from the Next.js `src/` tree, so
 * the rule is copied rather than shared. `subscription-access.test.ts` locks the
 * two implementations to the same answers.
 *
 * The bias is one-directional and deliberate: EVERY uncertain case resolves to
 * open. Being wrongly open costs the platform days of one ₱649 subscription;
 * being wrongly closed stops a restaurant taking orders, and the merchant
 * cannot fix it themselves.
 */

/** Hours Manila runs ahead of UTC. Mirrors `lib/inventory/business-day.ts`. */
const MANILA_UTC_OFFSET_HOURS = 8;

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Days a merchant keeps access after their paid period ends. */
export const DEFAULT_GRACE_DAYS = 3;

/** Statuses that close the door on their own, whatever the dates say. */
const TERMINAL_STATUSES = new Set(["cancelled", "paused"]);

export type SubscriptionState = "active" | "grace" | "paused";

/** The subset of a `tenant_subscriptions` row this module needs. */
export interface SubscriptionRow {
  status?: string | null;
  paid_through?: string | null;
  grace_days?: number | null;
}

export interface SubscriptionAccess {
  state: SubscriptionState;
  isBlocked: boolean;
  daysOverdue: number;
  paidThroughDayKey: string | null;
  blockedFromDayKey: string | null;
}

const OPEN: SubscriptionAccess = {
  state: "active",
  isBlocked: false,
  daysOverdue: 0,
  paidThroughDayKey: null,
  blockedFromDayKey: null,
};

function isDayKey(value: unknown): value is string {
  if (typeof value !== "string" || !DAY_KEY_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Which Manila day an instant falls on. */
function toManilaDayKey(iso: string): string {
  const instant = Date.parse(iso);
  if (Number.isNaN(instant)) throw new Error(`Expected an ISO timestamp, received "${iso}"`);
  return new Date(instant + MANILA_UTC_OFFSET_HOURS * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function addDays(dayKey: string, days: number): string {
  const shifted = Date.parse(`${dayKey}T00:00:00.000Z`) + days * MILLISECONDS_PER_DAY;
  return new Date(shifted).toISOString().slice(0, 10);
}

function resolveGraceDays(graceDays: number | null | undefined): number {
  if (graceDays === null || graceDays === undefined) return DEFAULT_GRACE_DAYS;
  if (!Number.isFinite(graceDays)) return DEFAULT_GRACE_DAYS;
  return Math.max(0, Math.floor(graceDays));
}

/** The access verdict for a subscription at a given instant. */
export function resolveSubscriptionAccess(
  subscription: SubscriptionRow | null | undefined,
  nowIso: string
): SubscriptionAccess {
  if (!subscription) return OPEN;

  const paidThroughDayKey = isDayKey(subscription.paid_through) ? subscription.paid_through : null;

  if (TERMINAL_STATUSES.has((subscription.status ?? "").toLowerCase())) {
    return {
      state: "paused",
      isBlocked: true,
      daysOverdue: 0,
      paidThroughDayKey,
      blockedFromDayKey: null,
    };
  }

  if (!paidThroughDayKey) return { ...OPEN, paidThroughDayKey: null };

  let today: string;
  try {
    today = toManilaDayKey(nowIso);
  } catch {
    return { ...OPEN, paidThroughDayKey };
  }

  const graceDays = resolveGraceDays(subscription.grace_days);
  const blockedFromDayKey = addDays(paidThroughDayKey, graceDays + 1);

  if (today <= paidThroughDayKey) {
    return { state: "active", isBlocked: false, daysOverdue: 0, paidThroughDayKey, blockedFromDayKey };
  }

  const daysOverdue = Math.round(
    (Date.parse(`${today}T00:00:00.000Z`) - Date.parse(`${paidThroughDayKey}T00:00:00.000Z`)) /
      MILLISECONDS_PER_DAY
  );

  if (daysOverdue <= graceDays) {
    return { state: "grace", isBlocked: false, daysOverdue, paidThroughDayKey, blockedFromDayKey };
  }

  return { state: "paused", isBlocked: true, daysOverdue, paidThroughDayKey, blockedFromDayKey };
}
