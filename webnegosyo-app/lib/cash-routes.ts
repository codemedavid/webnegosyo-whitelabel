/**
 * Routes of the cashier shift / remittance / business-day screens
 * (CONTRACTS §7) and where each is entered from.
 *
 * None of them is a tab: each is a utility screen (`href: null` in
 * app/(main)/_layout.tsx) that gates itself, so no account's bar or hub changes
 * shape. They are param-driven (a shift, a remittance, a business day), which a
 * hub row cannot carry, and the permission each needs is in TAB_PERMISSIONS /
 * TAB_ANY_OF so a door can ask `isTabAllowed` before drawing itself.
 *
 * Hrefs are fully substituted strings, the same contract as lib/navigation.ts.
 */

import { servicePeriodWindow, type ServicePeriodTimes } from "./business-day/service-periods";
import { tradingDayWindow, type CutoffSchedule } from "./business-day/trading-day";

export const CASH_SCREENS = ["shift-sales", "end-shift", "remittance", "remittances", "day-close", "cash-rules"] as const;
export type CashScreen = (typeof CASH_SCREENS)[number];

/** The screen each one is reached from — the door the merchant uses (06 §3). */
export const CASH_SCREEN_DOORS: Readonly<Record<CashScreen, readonly string[]>> = {
  // The cashier's own shift from the Drawer; past shifts and named shifts from Reports.
  "shift-sales": ["pos-sales", "reports"],
  "end-shift": ["pos-sales"],
  "remittance": ["end-shift", "remittances"],
  // The receiver's inbox: Reports (Cash section) and the Home strip.
  "remittances": ["reports", "dashboard"],
  "day-close": ["remittances"],
  "cash-rules": ["cash-drawers", "menu"],
};

export const CASH_RULES_ROUTE = "/(main)/cash-rules" as const;
export const REMITTANCES_ROUTE = "/(main)/remittances" as const;

const enc = encodeURIComponent;

/** One clocked-in shift's sales (live while open, final once closed). */
export function shiftSalesHref(shiftId: string): `/(main)/shift-sales?${string}` {
  return `/(main)/shift-sales?shift=${enc(shiftId)}`;
}

export interface PeriodSalesTarget {
  /** Half-open window, ISO instants. */
  fromIso: string;
  toIso: string;
  /** The named shift (service period) the window is, if any. */
  periodId?: string | null;
}

/** Sales for a past window: a business day, or one named shift of it. */
export function periodSalesHref(target: PeriodSalesTarget): `/(main)/shift-sales?${string}` {
  const base = `/(main)/shift-sales?from=${enc(target.fromIso)}&to=${enc(target.toIso)}` as const;
  return target.periodId ? `${base}&period=${enc(target.periodId)}` : base;
}

export function endShiftHref(shiftId: string): `/(main)/end-shift?${string}` {
  return `/(main)/end-shift?shift=${enc(shiftId)}`;
}

export function remittanceHref(remittanceId: string): `/(main)/remittance?${string}` {
  return `/(main)/remittance?id=${enc(remittanceId)}`;
}

/** Day close for business day `dayKey`; `outletId` null = the store-wide close. */
export function dayCloseHref(dayKey: string, outletId: string | null = null): `/(main)/day-close?${string}` {
  const base = `/(main)/day-close?day=${enc(dayKey)}` as const;
  return outletId ? `${base}&outlet=${enc(outletId)}` : base;
}

/**
 * Reports → Shifts: the window for business day `dayKey`, or for one named
 * shift of it (a night shift runs into the next calendar day). Business-day
 * maths is bizday's (`lib/business-day/*`), never redone here.
 */
export function pastShiftTarget(
  dayKey: string,
  period: (ServicePeriodTimes & { id: string }) | null,
  schedule: CutoffSchedule,
): PeriodSalesTarget {
  const window = period ? servicePeriodWindow(dayKey, period, schedule) : tradingDayWindow(dayKey, schedule);
  return { fromIso: window.startIso, toIso: window.endIso, periodId: period?.id ?? null };
}
