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
const ROW_CEILING = 2000;

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
  let request = db
    .from("order_status_events")
    .select(COLUMNS)
    .eq("tenant_id", tenantId)
    .gte("occurred_at", query.sinceIso)
    .order("occurred_at", { ascending: false })
    .limit(ROW_CEILING);
  if (query.actorUserId) request = request.eq("actor_user_id", query.actorUserId);
  if (query.outletId) request = request.eq("outlet_id", query.outletId);

  const { data, error } = await request;
  if (error) throw new Error(`Order activity could not be read. (${error.message ?? "unknown"})`);
  return ((data ?? []) as unknown as EventRow[]).map(toEvent);
}
