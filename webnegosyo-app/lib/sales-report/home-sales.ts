/**
 * Home's "today" figure from the web's one sales definition.
 *
 * Home used to add up order totals (`orders:getDashboardStats`), so it said
 * ₱2,615 the same day Sales said ₱2,585 net — the difference a ₱30 delivery
 * fee (Koko Coffee, 2026-11-24). On a platform store whose account may read
 * reports, Home now shows the reports' Net sales, orders and average order,
 * compared the way Sales compares today (the same time last week).
 *
 * Everyone else keeps the order-total figure, labelled for what it is:
 * "Orders total", never "Revenue" beside a different "Net sales" on Sales.
 * Pure: the query and the mapping are tested here; the screen only renders.
 */

import { hasPermission, type StaffPermissionHolder } from "../staff-permissions";
import type { OrderBackend } from "../order-backend";
import type { ReportPayload, ReportQuery } from "./types";

export interface HomeSalesFigures {
  /** Pesos. */
  netSales: number;
  orders: number;
  /** Pesos. */
  avgOrder: number;
  /** Pesos; null when the compared window could not be read. */
  previousNetSales: number | null;
  /** "the same time last week". */
  compareLabel: string | null;
}

export function canHomeReadNetSales(backend: OrderBackend | null | undefined, user: StaffPermissionHolder): boolean {
  return backend === "platform" && hasPermission(user, "reports");
}

export function homeSalesQuery(tenantId: string, branch: string | null): ReportQuery {
  return { tenantId, period: { preset: "today" }, compare: "previous", branch, sections: ["summary"] };
}

const pesos = (cents: number | null | undefined): number | null =>
  typeof cents === "number" && Number.isFinite(cents) ? cents / 100 : null;

/** Null when the summary did not answer: the screen then keeps the order-total figure. */
export function homeSalesFigures(payload: ReportPayload | null | undefined): HomeSalesFigures | null {
  const summary = payload?.sections.summary;
  if (!summary?.ok) return null;
  const net = pesos(summary.data.values.net_sales);
  const orders = summary.data.values.orders;
  if (net === null || typeof orders !== "number") return null;
  return {
    netSales: net,
    orders,
    avgOrder: pesos(summary.data.values.aov) ?? (orders > 0 ? net / orders : 0),
    previousNetSales: pesos(summary.data.previous?.net_sales ?? null),
    compareLabel: payload?.context.compare?.label ?? null,
  };
}

/** Eyebrow word for the hero: what the number IS. */
export function homeHeroTitle(hasNetSales: boolean, backend: OrderBackend | null | undefined): string {
  if (hasNetSales) return "Net sales";
  return backend === "platform" ? "Orders total" : "Revenue";
}

/**
 * One business day's net sales, for the daily report's food cost %. Food cost
 * is cost of food over SALES — delivery fees are not sales — so on platform
 * stores the denominator is the reports' net sales, not Σ order totals.
 */
export function daySalesQuery(tenantId: string, dayKey: string, branch: string | null): ReportQuery {
  return { tenantId, period: { preset: "custom", from: dayKey, to: dayKey }, compare: "none", branch, sections: ["summary"] };
}

/** Net sales in pesos, or undefined when the summary did not answer. */
export function netSalesPesos(payload: ReportPayload | null | undefined): number | undefined {
  const summary = payload?.sections.summary;
  if (!summary?.ok) return undefined;
  return pesos(summary.data.values.net_sales) ?? undefined;
}
