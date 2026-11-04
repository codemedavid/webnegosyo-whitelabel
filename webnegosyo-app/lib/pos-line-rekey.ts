/**
 * Moving what the register holds BY LINE KEY when a line changes key.
 *
 * A cart line's key is its identity (item + options + note — `lineKey`), so a
 * kitchen note written on a line gives it a new key (`setLineNote`). Item
 * discounts, voucher unit picks, Senior/PWD claims and — while a placed order
 * is being edited — its stored one-dish discounts all name dishes by that key.
 * Left alone they would point at a key that no longer exists, and
 * `discountAfterCartChange` would drop them: the note would silently put the
 * dish back at full price.
 *
 * Pure: every function returns a new value, or the SAME value when nothing
 * referred to the old key, so the store's state identity does not churn.
 */

import type { ManualItemDiscount } from "./pos-discount";
import type { PosDiscountSession } from "./pos-discount-session";
import type { PosGovSession } from "./pos-gov-discount";
import type { OrderDiscountPayload } from "./order-discount";
import type { UnitPicks } from "./vouchers/types";

/** `units` with `from`'s count moved onto `to` (added when both exist). */
function rekeyUnits(
  units: Readonly<Record<string, number>>,
  from: string,
  to: string,
): Readonly<Record<string, number>> {
  if (!(from in units)) return units;
  const rest: Record<string, number> = Object.fromEntries(
    Object.entries(units).filter(([key]) => key !== from),
  );
  return { ...rest, [to]: (rest[to] ?? 0) + units[from] };
}

function isSameTerms(a: ManualItemDiscount, b: ManualItemDiscount): boolean {
  return a.kind === b.kind && a.value === b.value && a.reason.trim() === b.reason.trim();
}

/**
 * One item discount per line. The edited line's discount follows it; when the
 * line it merges into has its own, identical terms add their units and
 * different terms let the edited line's win (the cashier is acting on it).
 */
function rekeyItemDiscounts(
  held: readonly ManualItemDiscount[],
  from: string,
  to: string,
): readonly ManualItemDiscount[] {
  const moving = held.find((discount) => discount.lineKey === from);
  if (!moving) return held;

  const existing = held.find((discount) => discount.lineKey === to);
  const others = held.filter((discount) => discount !== moving && discount !== existing);
  const units =
    existing && isSameTerms(existing, moving) ? existing.units + moving.units : moving.units;
  return [...others, { ...moving, lineKey: to, units }];
}

function rekeyUnitPicks(
  picks: Readonly<Record<string, UnitPicks>>,
  from: string,
  to: string,
): Readonly<Record<string, UnitPicks>> {
  const hasFrom = Object.values(picks).some((byLine) => from in byLine);
  if (!hasFrom) return picks;
  return Object.fromEntries(
    Object.entries(picks).map(([code, byLine]) => [code, rekeyUnits(byLine, from, to)]),
  );
}

/**
 * Claimed units move with the dish. The approval is kept: a re-key moves no
 * money, and `govApprovalPending` re-asks if the reduction ever grows.
 */
function rekeyGovSession(session: PosGovSession, from: string, to: string): PosGovSession {
  let isChanged = false;
  const claimants = session.claimants.map((claimant) => {
    if (claimant.allocation.mode !== "items" || !(from in claimant.allocation.units)) {
      return claimant;
    }
    isChanged = true;
    return {
      ...claimant,
      allocation: { mode: "items" as const, units: rekeyUnits(claimant.allocation.units, from, to) },
    };
  });
  return isChanged ? { ...session, claimants } : session;
}

/** The register's discount session with every reference to `from` moved to `to`. */
export function rekeyDiscountSession(
  session: PosDiscountSession,
  from: string,
  to: string,
): PosDiscountSession {
  if (from === to) return session;

  const itemDiscounts = session.itemDiscounts
    ? rekeyItemDiscounts(session.itemDiscounts, from, to)
    : undefined;
  const unitPicks = session.unitPicks ? rekeyUnitPicks(session.unitPicks, from, to) : undefined;
  const government = session.government
    ? rekeyGovSession(session.government, from, to)
    : undefined;

  const isUnchanged =
    itemDiscounts === session.itemDiscounts &&
    unitPicks === session.unitPicks &&
    government === session.government;
  if (isUnchanged) return session;

  return {
    ...session,
    ...(itemDiscounts ? { itemDiscounts } : {}),
    ...(unitPicks ? { unitPicks } : {}),
    ...(government ? { government } : {}),
  };
}

/**
 * A placed order's stored discount (cart-keyed while the order is open for an
 * edit — `cartKeyedDiscount`) with its dishes on `from` moved to `to`. Order
 * positions (`line-<index>`, `allocationsByLine`) are not cart keys and stay.
 */
export function rekeyEditDiscount(
  stored: OrderDiscountPayload | null,
  from: string,
  to: string,
): OrderDiscountPayload | null {
  if (!stored || from === to) return stored;
  const touches = stored.lines.some((line) => line.items?.some((item) => item.lineKey === from));
  if (!touches) return stored;

  return {
    ...stored,
    lines: stored.lines.map((line) =>
      line.items ? { ...line, items: mergeItems(line.items, from, to) } : line,
    ),
  };
}

type StoredItem = NonNullable<OrderDiscountPayload["lines"][number]["items"]>[number];

/** Dishes on `from` become `to`; two entries for one dish add up (a merge). */
function mergeItems(items: readonly StoredItem[], from: string, to: string): StoredItem[] {
  return items.reduce<StoredItem[]>((out, item) => {
    const renamed = item.lineKey === from ? { ...item, lineKey: to } : item;
    const at = out.findIndex((entry) => entry.lineKey === renamed.lineKey);
    if (at === -1) return [...out, renamed];
    const merged = {
      ...out[at],
      units: out[at].units + renamed.units,
      amount: Math.round((out[at].amount + renamed.amount) * 100) / 100,
    };
    return [...out.slice(0, at), merged, ...out.slice(at + 1)];
  }, []);
}

/** Why the register refused a note edit. */
export type LineNoteRefusal = "conflicting-discounts" | "placed-line-discount";

/** What `setLineNote` did: saved (or nothing to do), or refused with a reason. */
export type LineNoteResult = { ok: true } | { ok: false; reason: LineNoteRefusal };

export const LINE_NOTE_SAVED: LineNoteResult = { ok: true };

/**
 * True when re-keying `from` onto `to` would merge two lines that each carry
 * their own item discount on DIFFERENT terms. One line holds one item
 * discount, so the merge would silently drop one of them — the register
 * refuses it instead and asks the cashier to remove one first.
 */
export function hasConflictingItemDiscounts(
  session: PosDiscountSession,
  from: string,
  to: string,
): boolean {
  if (from === to) return false;
  const held = session.itemDiscounts ?? [];
  const moving = held.find((discount) => discount.lineKey === from);
  const existing = held.find((discount) => discount.lineKey === to);
  return Boolean(moving && existing && !isSameTerms(moving, existing));
}

/** True when an item discount, a voucher unit pick or a Senior/PWD claim names `key`. */
export function holdsLineKey(session: PosDiscountSession, key: string): boolean {
  const hasItemDiscount = (session.itemDiscounts ?? []).some((discount) => discount.lineKey === key);
  const hasUnitPick = Object.values(session.unitPicks ?? {}).some((byLine) => key in byLine);
  const hasGovUnits = (session.government?.claimants ?? []).some(
    (claimant) => claimant.allocation.mode === "items" && key in claimant.allocation.units,
  );
  return hasItemDiscount || hasUnitPick || hasGovUnits;
}

/** The cashier-facing reason a note was not saved on `itemName`. */
export function lineNoteRefusalMessage(reason: LineNoteRefusal, itemName: string): string {
  const dish = `“${itemName}”`;
  if (reason === "placed-line-discount") {
    return `${dish} with this note is already on the order. Remove the discount on the new ${dish} first.`;
  }
  return `Another ${dish} line already has this note with a different discount. Remove one discount first.`;
}
