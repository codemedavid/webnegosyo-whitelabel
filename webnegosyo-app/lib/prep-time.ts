// The kitchen's promise: how long this ticket will take, and therefore when it
// will be ready. Pure functions only — no React, no backend — because what is
// decided here leaves the kitchen and lands on a customer's phone.
//
// The rule the whole feature rests on: a prep time is stored as an ABSOLUTE
// instant, stamped at the moment the chef taps. A stored duration has no way to
// know when its clock started — the order was placed at 7:00, confirmed at
// 7:04, and tapped at 7:06 — so "15 minutes" would mean three different things
// and would still read "15 minutes" an hour later. `prepMinutes` is kept beside
// it as the merchant's own record of what was chosen, never as the countdown.

import type { OrderBackend } from "./order-backend";

/** The quick taps a cook reaches for without thinking. */
export const PREP_MINUTE_PRESETS = [10, 15, 20, 30] as const;

/**
 * The second row, behind "More". A kitchen tablet is used with wet or gloved
 * hands and often has no comfortable keyboard, so "custom" is a wider set of
 * taps rather than a numeric field.
 */
export const PREP_MINUTE_EXTENDED = [5, 45, 60, 90] as const;

/** How much "+5" pushes a promise back when the line falls behind. */
export const PREP_EXTEND_MINUTES = 5;

export const MIN_PREP_MINUTES = 1;
/** Four hours. Past this it is not a prep estimate, it is a scheduled order. */
export const MAX_PREP_MINUTES = 240;

/**
 * The Convex bundle in which `orders:setPrepTime` and its two fields exist.
 *
 * Same gating idea as `convex-order-scope.ts`: most tenants run several
 * versions behind head, and calling a mutation their deployment does not have
 * throws. The chips are hidden below this version rather than failing on tap.
 */
export const PREP_TIME_SCHEMA_VERSION = 24;

const MS_PER_MINUTE = 60_000;

export interface PrepTimeCapability {
  orderBackend: OrderBackend | null;
  convexSchemaVersion: number | null;
}

/**
 * Whether this store can store a prep time at all.
 *
 * `platform` needs only the migration, which applies once to the shared
 * database. `supabase` is the separate per-tenant project track, for which the
 * app ships no adapter. `convex` needs its own deployment to carry the bundle.
 */
export function isPrepTimeSupported({
  orderBackend,
  convexSchemaVersion,
}: PrepTimeCapability): boolean {
  if (orderBackend === "platform") return true;
  if (orderBackend === "supabase") return false;
  return (convexSchemaVersion ?? 0) >= PREP_TIME_SCHEMA_VERSION;
}

/**
 * Validate minutes at the boundary. Returns null for anything that must not
 * reach the backend — a NaN would stamp an Invalid Date onto a live order and
 * the customer's page would render nothing with no clue why.
 */
export function normalizePrepMinutes(input: unknown): number | null {
  const minutes = typeof input === "string" ? Number(input) : input;
  if (typeof minutes !== "number" || !Number.isInteger(minutes)) return null;
  if (minutes < MIN_PREP_MINUTES || minutes > MAX_PREP_MINUTES) return null;
  return minutes;
}

/** The instant being promised, counted from the tap — never from the order. */
export function promisedReadyAt(nowMs: number, minutes: number): number {
  return nowMs + minutes * MS_PER_MINUTE;
}

export type PrepPromiseState =
  | { kind: "none" }
  | { kind: "due"; minutesRemaining: number }
  | { kind: "late"; minutesLate: number };

/**
 * Where a promise stands right now. Rounds remaining time UP so a promise 30
 * seconds out reads "1 min" rather than "0 min", and reports lateness as a
 * positive number so no caller can render a negative countdown.
 */
export function prepPromiseState(
  promisedMs: number | null | undefined,
  nowMs: number,
): PrepPromiseState {
  if (promisedMs === null || promisedMs === undefined || Number.isNaN(promisedMs)) {
    return { kind: "none" };
  }

  const remaining = promisedMs - nowMs;
  if (remaining < 0) {
    return { kind: "late", minutesLate: Math.floor(-remaining / MS_PER_MINUTE) };
  }
  return { kind: "due", minutesRemaining: Math.ceil(remaining / MS_PER_MINUTE) };
}

/** A wall clock the cook and the customer can both read: "7:21 PM". */
export function formatClock(ms: number, timeZone?: string): string {
  return new Date(ms).toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  });
}

/**
 * Committing to a time IS starting the cook, so a confirmed ticket moves to
 * preparing on the same tap. Revising the time on a ticket already being cooked
 * changes nothing about its status.
 */
// The current status is accepted and deliberately ignored, so call sites read
// as a transition and a future status-dependent rule needs no caller changes.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function prepTimeTargetStatus(currentStatus: string): "preparing" {
  return "preparing";
}
