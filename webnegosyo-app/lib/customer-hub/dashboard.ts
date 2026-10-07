/**
 * How the Reports dashboard says its numbers.
 *
 * Every figure is computed on the platform (`src/lib/customer-dashboard.ts`,
 * shipped as `overview.dashboard` by `/api/customers/hub-overview`); the shapes
 * below mirror it because the app cannot import `src/`. This module decides
 * only what to SAY: which slices of revenue to draw, which levers to show, and
 * which "bring them back" moves are worth a row today.
 *
 * The dashboard reads top to bottom as the questions a store owner asks:
 * am I growing and who pays for it (the revenue split), which lever moved
 * (customers, came back, spend per order), do I even know my buyers, and what
 * do I do about it now. Pure, so it runs under the node Jest project.
 */

import { formatCount, formatPeso } from "../format";

export interface DashboardItem {
  key: string;
  menuItemId: string | null;
  name: string;
  quantity: number;
}

export interface DashboardCustomer {
  key: string;
  customerId: string | null;
  name: string | null;
  phoneTail: string | null;
  visits: number;
  spend: number;
  lastVisitAt: string;
}

export interface DashboardWindow {
  days: number;
  revenue: { total: number; returning: number; new: number; unknown: number };
  previousRevenue: number;
  orders: number;
  previousOrders: number;
  knownOrders: number;
  customers: number;
  previousCustomers: number;
  returningCustomers: number;
  newCustomers: number;
  repeatRate: number;
  previousRepeatRate: number;
  oneTimers: number;
  favourites: { returning: DashboardItem[]; new: DashboardItem[] };
  topCustomers: DashboardCustomer[];
}

export interface CustomerDashboard {
  windows: DashboardWindow[];
  slipping: number;
  lapsed: number;
  lifetimeValue: { regular: number | null; oneTime: number | null };
  /** False where only named guests' orders are visible (stores off the platform). */
  tillComplete: boolean;
}

/** The periods the dashboard offers, matching the platform's windows. */
export const DASHBOARD_WINDOWS = [7, 30, 90] as const;

/** Share of named orders at which a store knows its buyers well / fairly. */
const KNOWN_GOOD_PERCENT = 60;
const KNOWN_FAIR_PERCENT = 25;

export function selectDashboardWindow(dashboard: CustomerDashboard, days: number): DashboardWindow | null {
  return dashboard.windows.find((window) => window.days === days) ?? null;
}

/** Change as a fraction of the earlier figure (0.2 = up 20%); null with nothing to compare. */
export function changeRatio(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
  return (current - previous) / previous;
}

function plural(count: number, one: string, many: string): string {
  return `${formatCount(count)} ${count === 1 ? one : many}`;
}

/* ---------------------------------------------------------------- revenue */

export type RevenueSegmentKey = "returning" | "new" | "unknown";

export interface RevenueSegment {
  key: RevenueSegmentKey;
  label: string;
  amount: number;
  /** Fraction of the drawn total, 0..1. */
  share: number;
}

const SEGMENT_LABELS: Record<RevenueSegmentKey, string> = {
  returning: "Regulars",
  new: "First-timers",
  unknown: "Unnamed",
};

/**
 * The slices of the revenue bar, biggest-meaning first. Where the till is not
 * fully visible the unnamed slice is left out rather than drawn as zero — a
 * zero would claim every buyer was named.
 */
export function revenueSegments(window: DashboardWindow, tillComplete: boolean): RevenueSegment[] {
  const keys: RevenueSegmentKey[] = tillComplete ? ["returning", "new", "unknown"] : ["returning", "new"];
  const drawnTotal = keys.reduce((total, key) => total + window.revenue[key], 0);
  if (drawnTotal <= 0) return [];
  return keys
    .filter((key) => window.revenue[key] > 0)
    .map((key) => ({
      key,
      label: SEGMENT_LABELS[key],
      amount: window.revenue[key],
      share: window.revenue[key] / drawnTotal,
    }));
}

/* ----------------------------------------------------------------- levers */

export type LeverChange = { kind: "ratio"; value: number } | { kind: "points"; value: number };

export interface LeverTile {
  label: string;
  value: string;
  /** What it says about this number, under it. */
  hint: string;
  change: LeverChange | null;
}

function ratioChange(current: number, previous: number): LeverChange | null {
  const value = changeRatio(current, previous);
  return value === null ? null : { kind: "ratio", value };
}

/**
 * Revenue = customers × how often they come back × what they spend. These are
 * the three dials a store can actually turn, so they sit right under the total.
 */
export function leverTiles(window: DashboardWindow): LeverTile[] {
  const spend = window.orders > 0 ? window.revenue.total / window.orders : null;
  const previousSpend = window.previousOrders > 0 ? window.previousRevenue / window.previousOrders : null;
  const hasPreviousGuests = window.previousCustomers > 0;

  return [
    {
      label: "Customers",
      value: formatCount(window.customers),
      hint: "Named guests who bought",
      change: ratioChange(window.customers, window.previousCustomers),
    },
    {
      label: "Came back",
      value: `${Math.round(window.repeatRate)}%`,
      hint: "Ordered again",
      change: hasPreviousGuests ? { kind: "points", value: Math.round(window.repeatRate - window.previousRepeatRate) } : null,
    },
    {
      label: "Spend per order",
      value: spend === null ? "—" : formatPeso(spend, 0),
      hint: "Every order, named or not",
      change: spend === null || previousSpend === null ? null : ratioChange(spend, previousSpend),
    },
  ];
}

/* ------------------------------------------------------------ known buyers */

export type KnownTone = "good" | "fair" | "poor";

export interface KnownBuyers {
  percent: number;
  tone: KnownTone;
  headline: string;
  advice: string;
}

/**
 * How many of this window's orders carried a name or number — the ceiling on
 * every customer figure above it, and the reason loyalty exists. Null where it
 * cannot be known (only named orders are visible) or nothing sold.
 */
export function describeKnownBuyers(window: DashboardWindow, dashboard: CustomerDashboard): KnownBuyers | null {
  if (!dashboard.tillComplete || window.orders <= 0) return null;
  const percent = Math.round((window.knownOrders / window.orders) * 100);
  const tone: KnownTone = percent >= KNOWN_GOOD_PERCENT ? "good" : percent >= KNOWN_FAIR_PERCENT ? "fair" : "poor";
  const { regular, oneTime } = dashboard.lifetimeValue;

  const worth =
    regular !== null && oneTime !== null
      ? `A regular has spent ${formatPeso(regular, 0)} with you so far; a one-time guest, ${formatPeso(oneTime, 0)}. `
      : "";
  const advice =
    tone === "good"
      ? `${worth}Keep asking every guest for their number.`
      : `${worth}Ask every guest for their number at the counter, or give them a reward card — you can only bring back a guest you can reach.`;

  return { percent, tone, headline: `You know ${percent}% of your buyers`, advice };
}

/* ---------------------------------------------------------- bring them back */

/** Campaign presets the dashboard can open (lib/sms/campaign-presets.ts). */
export type BringBackPreset = "slipping_regulars" | "win_back" | "second_visit";

export type BringBackTarget =
  | { kind: "campaign"; preset: BringBackPreset }
  | { kind: "loyalty" }
  | { kind: "guests" };

export interface BringBackAction {
  key: "slipping" | "lapsed" | "one_timers" | "rewards";
  title: string;
  detail: string;
  cta: string;
  target: BringBackTarget;
}

/** What the dashboard knows about the store's reward cards; null when this account cannot see them. */
export interface RewardsSnapshot {
  hasActiveProgram: boolean;
  members: number;
  rewardsWaiting: number;
}

function textOrGuests(canText: boolean, preset: BringBackPreset, textCta: string): Pick<BringBackAction, "cta" | "target"> {
  return canText
    ? { cta: textCta, target: { kind: "campaign", preset } }
    : { cta: "See guests", target: { kind: "guests" } };
}

function rewardsAction(rewards: RewardsSnapshot): BringBackAction {
  if (!rewards.hasActiveProgram) {
    return {
      key: "rewards",
      title: "Start a reward card",
      detail: "Guests give their number to collect stamps, which is how you get to know them.",
      cta: "Set up",
      target: { kind: "loyalty" },
    };
  }
  if (rewards.rewardsWaiting > 0) {
    return {
      key: "rewards",
      title: `${plural(rewards.rewardsWaiting, "reward is", "rewards are")} waiting`,
      detail: "Earned and not yet used. A reminder brings them in.",
      cta: "View",
      target: { kind: "loyalty" },
    };
  }
  return {
    key: "rewards",
    title: `${plural(rewards.members, "member is", "members are")} collecting stamps`,
    detail: "See who is closest to a reward.",
    cta: "Open",
    target: { kind: "loyalty" },
  };
}

/**
 * Today's moves, most urgent money first: regulars drifting (cheapest to keep),
 * regulars gone quiet, first-timers who never came back, then reward cards.
 * A move with nobody in it is not shown.
 */
export function bringBackActions(input: {
  dashboard: CustomerDashboard;
  window: DashboardWindow;
  canText: boolean;
  rewards: RewardsSnapshot | null;
}): BringBackAction[] {
  const { dashboard, window, canText, rewards } = input;
  const actions: BringBackAction[] = [];

  if (dashboard.slipping > 0) {
    actions.push({
      key: "slipping",
      title: `${plural(dashboard.slipping, "regular is", "regulars are")} slipping away`,
      detail: "Quieter than their usual rhythm. A nudge now is the cheapest sale you'll make.",
      ...textOrGuests(canText, "slipping_regulars", "Text them"),
    });
  }
  if (dashboard.lapsed > 0) {
    actions.push({
      key: "lapsed",
      title: `${plural(dashboard.lapsed, "regular has", "regulars have")} gone quiet`,
      detail: "They used to come often and stopped. Give them a reason to return.",
      ...textOrGuests(canText, "win_back", "Win back"),
    });
  }
  if (window.oneTimers > 0) {
    actions.push({
      key: "one_timers",
      title: `${plural(window.oneTimers, "guest", "guests")} came once`,
      detail: `In the last ${window.days} days. A second visit is what turns a guest into a regular.`,
      ...textOrGuests(canText, "second_visit", "Invite back"),
    });
  }
  if (rewards) actions.push(rewardsAction(rewards));

  return actions;
}

/* -------------------------------------------------------------- customers */

export function customerLabel(customer: DashboardCustomer): string {
  if (customer.name?.trim()) return customer.name.trim();
  return customer.phoneTail ? `Guest ending ${customer.phoneTail}` : "Guest";
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function lastVisitLabel(iso: string, nowMs: number): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return "";
  const days = Math.max(0, Math.floor((nowMs - at) / DAY_MS));
  if (days === 0) return "Last visit today";
  if (days === 1) return "Last visit yesterday";
  return `Last visit ${days} days ago`;
}
