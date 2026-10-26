/**
 * Reading the platform's order activity log from the phone.
 *
 * Straight from Supabase, like shift-service.ts: `order_status_events` RLS
 * (migration 20260919120000) lets an account read the branches it may reach
 * plus its own acts, so a cashier's shift card can show their own confirms
 * and an owner's Team screen everyone's. The table is written only by the
 * platform, never from here.
 */

import { supabase } from "../supabase";
import type { OrderActivityEvent } from "./activity";

type Db = Pick<typeof supabase, "from">;

const COLUMNS = "id, external_order_id, event, status, source, order_total, actor_user_id, actor_name, occurred_at";

/**
 * PostgREST answers at most this many rows per request on the platform
 * project, whatever `.limit()` asks for. A single `.limit(2000)` read used to
 * return 1000 and drop every older act without a word.
 */
export const ACTIVITY_PAGE_SIZE = 1000;
/** The most rows one read will hold — two pages, bounded. */
export const ACTIVITY_ROW_CEILING = 2000;

interface EventRow {
  id: string;
  external_order_id: string;
  event: string;
  status: string;
  source: string | null;
  order_total: number | string | null;
  actor_user_id: string | null;
  actor_name: string | null;
  occurred_at: string;
}

function toEvent(row: EventRow): OrderActivityEvent {
  return {
    id: row.id,
    externalOrderId: row.external_order_id,
    event: row.event === "placed" ? "placed" : "status_changed",
    status: row.status,
    source: row.source === "pos" ? "pos" : row.source === "online" ? "online" : null,
    orderTotal: row.order_total === null ? null : Number(row.order_total),
    actorUserId: row.actor_user_id,
    actorName: row.actor_name ?? "Staff",
    occurredAt: row.occurred_at,
  };
}

export interface ActivityQuery {
  sinceIso: string;
  actorUserId?: string;
  outletId?: string;
}

/** Throws with a readable message, like listShifts: the panel says so. */
export async function listOrderActivity(
  tenantId: string,
  query: ActivityQuery,
  db: Db = supabase,
): Promise<OrderActivityEvent[]> {
  // A FRESH builder per page (a supabase-js builder runs once), ordered on a
  // total ordering so rows cannot shift between pages and be read twice.
  const buildPage = (from: number, to: number) => {
    let request = db
      .from("order_status_events")
      .select(COLUMNS)
      .eq("tenant_id", tenantId)
      .gte("occurred_at", query.sinceIso);
    if (query.actorUserId) request = request.eq("actor_user_id", query.actorUserId);
    if (query.outletId) request = request.eq("outlet_id", query.outletId);
    return request
      .order("occurred_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);
  };

  let rows: EventRow[] = [];
  while (rows.length < ACTIVITY_ROW_CEILING) {
    const from = rows.length;
    const size = Math.min(ACTIVITY_PAGE_SIZE, ACTIVITY_ROW_CEILING - from);
    const { data, error } = await buildPage(from, from + size - 1);
    if (error) throw new Error(`Order activity could not be read. (${error.message ?? "unknown"})`);
    const page = (data ?? []) as unknown as EventRow[];
    rows = [...rows, ...page];
    if (page.length < size) break;
  }
  return rows.map(toEvent);
}

/**
 * When this person last did anything, whatever period the screen shows.
 *
 * The directory only sees the chosen window, so a cashier who worked two
 * days ago read "No activity yet" under Today. One indexed row from each log
 * (`idx_order_status_events_actor`, `idx_staff_shifts_staff`) answers it.
 * Throws like the other reads: "never active" and "could not read" differ.
 */
export async function loadLastSeenAt(
  tenantId: string,
  actorUserId: string,
  db: Db = supabase,
): Promise<string | null> {
  const [events, shifts] = await Promise.all([
    db
      .from("order_status_events")
      .select("occurred_at")
      .eq("tenant_id", tenantId)
      .eq("actor_user_id", actorUserId)
      .order("occurred_at", { ascending: false })
      .limit(1),
    db
      .from("staff_shifts")
      .select("opened_at, closed_at")
      .eq("tenant_id", tenantId)
      .eq("staff_user_id", actorUserId)
      .order("opened_at", { ascending: false })
      .limit(1),
  ]);
  if (events.error) throw new Error(`Last activity could not be read. (${events.error.message ?? "unknown"})`);
  if (shifts.error) throw new Error(`Last shift could not be read. (${shifts.error.message ?? "unknown"})`);

  const eventAt = ((events.data ?? []) as unknown as { occurred_at: string }[])[0]?.occurred_at ?? null;
  const shift = ((shifts.data ?? []) as unknown as { opened_at: string; closed_at: string | null }[])[0];
  const candidates = [eventAt, shift?.opened_at ?? null, shift?.closed_at ?? null].filter(
    (value): value is string => value !== null && !Number.isNaN(Date.parse(value)),
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((latest, value) => (Date.parse(value) > Date.parse(latest) ? value : latest));
}
