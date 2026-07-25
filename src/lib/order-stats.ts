/**
 * Today-at-a-glance order figures for the admin dashboard.
 *
 * Pure, and shared by every order backend: the platform database
 * (`orders-service`) and a tenant's own Supabase project
 * (`tenant-supabase-orders-read`) must report the same numbers from the same
 * rows, or merchants comparing screens would see two different "today".
 */

export interface OrderStatsRow {
  status?: string | null;
  total?: number | string | null;
}

export interface OrderStats {
  todayOrders: number;
  todayRevenue: number;
  pendingOrders: number;
  confirmedOrders: number;
  preparingOrders: number;
  readyOrders: number;
}

const CANCELLED = "cancelled";

function countByStatus(rows: OrderStatsRow[], status: string): number {
  return rows.filter((row) => row.status === status).length;
}

/**
 * Revenue and the headline order count exclude cancelled orders, so cancelling
 * an order immediately lowers both (matching the Convex dashboard). The
 * per-status breakdown still covers every row so nothing disappears from view.
 */
export function summarizeOrderStats(
  rows: OrderStatsRow[] | null | undefined
): OrderStats {
  const allRows = rows ?? [];
  const active = allRows.filter((row) => row.status !== CANCELLED);

  return {
    todayOrders: active.length,
    todayRevenue: active.reduce((sum, row) => sum + Number(row.total ?? 0), 0),
    pendingOrders: countByStatus(allRows, "pending"),
    confirmedOrders: countByStatus(allRows, "confirmed"),
    preparingOrders: countByStatus(allRows, "preparing"),
    readyOrders: countByStatus(allRows, "ready"),
  };
}

/** Local midnight for the given moment, as the ISO string postgrest expects. */
export function startOfTodayISO(now: Date = new Date()): string {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  return midnight.toISOString();
}
