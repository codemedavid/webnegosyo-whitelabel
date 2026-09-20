/**
 * What one person did to orders — the pure half, app side.
 *
 * The drawer answers "how much cash did Ana take"; this answers "which web
 * orders did Ana confirm, cancel or complete". They are kept apart on
 * purpose: a confirmed web order is the store's money, never the drawer's
 * (see shift-drawer.ts), so activity is counted and totalled but never added
 * to expected cash.
 *
 * Mirrors src/lib/staff-activity/order-event.ts on the web; the app cannot
 * import across repos, so the two must be changed together.
 */

export type ActivityKind = "pos_sale" | "confirmed" | "cancelled" | "completed" | "progressed";

export interface OrderActivityEvent {
  id: string;
  externalOrderId: string;
  event: "placed" | "status_changed";
  status: string;
  source: "pos" | "online" | null;
  orderTotal: number | null;
  actorUserId: string | null;
  actorName: string;
  occurredAt: string;
}

export interface ActivityWindow {
  startMs: number;
  endMs: number;
}

export interface ActivitySummary {
  posSales: number;
  posSalesTotal: number;
  confirmed: number;
  confirmedTotal: number;
  cancelled: number;
  completed: number;
  progressed: number;
}

export const EMPTY_ACTIVITY: ActivitySummary = {
  posSales: 0,
  posSalesTotal: 0,
  confirmed: 0,
  confirmedTotal: 0,
  cancelled: 0,
  completed: 0,
  progressed: 0,
};

export function classifyActivity(event: Pick<OrderActivityEvent, "event" | "status">): ActivityKind {
  if (event.event === "placed") return "pos_sale";
  if (event.status === "confirmed") return "confirmed";
  if (event.status === "cancelled") return "cancelled";
  if (event.status === "delivered") return "completed";
  return "progressed";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function inWindow(event: OrderActivityEvent, window: ActivityWindow): boolean {
  const at = Date.parse(event.occurredAt);
  return at >= window.startMs && at <= window.endMs;
}

function add(summary: ActivitySummary, event: OrderActivityEvent): ActivitySummary {
  const total = event.orderTotal ?? 0;
  switch (classifyActivity(event)) {
    case "pos_sale":
      return { ...summary, posSales: summary.posSales + 1, posSalesTotal: round2(summary.posSalesTotal + total) };
    case "confirmed":
      return { ...summary, confirmed: summary.confirmed + 1, confirmedTotal: round2(summary.confirmedTotal + total) };
    case "cancelled":
      return { ...summary, cancelled: summary.cancelled + 1 };
    case "completed":
      return { ...summary, completed: summary.completed + 1 };
    case "progressed":
      return { ...summary, progressed: summary.progressed + 1 };
  }
}

/** One person's activity inside a window (a shift, or a report period). */
export function summarizeActorActivity(
  events: readonly OrderActivityEvent[],
  actorUserId: string,
  window: ActivityWindow,
): ActivitySummary {
  return events
    .filter((event) => event.actorUserId === actorUserId && inWindow(event, window))
    .reduce(add, EMPTY_ACTIVITY);
}

/** Everyone's activity inside a window, keyed by actor, busiest first. */
export function summarizeTeamActivity(
  events: readonly OrderActivityEvent[],
  window: ActivityWindow,
): { actorUserId: string; actorName: string; summary: ActivitySummary }[] {
  const byActor = new Map<string, { actorName: string; summary: ActivitySummary }>();
  for (const event of events) {
    if (!event.actorUserId || !inWindow(event, window)) continue;
    const current = byActor.get(event.actorUserId) ?? { actorName: event.actorName, summary: EMPTY_ACTIVITY };
    byActor.set(event.actorUserId, { actorName: event.actorName, summary: add(current.summary, event) });
  }
  const count = (s: ActivitySummary) => s.posSales + s.confirmed + s.cancelled + s.completed + s.progressed;
  return [...byActor.entries()]
    .map(([actorUserId, row]) => ({ actorUserId, ...row }))
    .sort((a, b) => count(b.summary) - count(a.summary));
}

/** A one-line reading for a card. */
export function describeActivity(summary: ActivitySummary): string {
  const parts: string[] = [];
  if (summary.confirmed) parts.push(`confirmed ${summary.confirmed}`);
  if (summary.completed) parts.push(`completed ${summary.completed}`);
  if (summary.cancelled) parts.push(`cancelled ${summary.cancelled}`);
  if (summary.progressed) parts.push(`moved ${summary.progressed}`);
  return parts.length === 0 ? "No web orders handled" : `Web orders: ${parts.join(" · ")}`;
}
