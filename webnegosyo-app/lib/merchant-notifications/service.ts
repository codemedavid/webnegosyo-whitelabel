// Reads and writes for the bell.
//
// `merchant_notifications` lives on the platform Supabase for every store, so
// no backend routing: RLS hands each account only its store's rows, confined
// to its branch, and only if it may open Stock. A failure throws; resolving to
// [] on error would render a broken read as "nothing new".

import { supabase } from "../supabase";
import {
  toMerchantNotification,
  type MerchantNotification,
  type MerchantNotificationRow,
} from "./merchant-notifications";

const STOCK_COLUMNS =
  "id, kind, outlet_id, outlet_name, inventory_item_id, item_name, unit, quantity, reorder_level, created_at, stock_alerts(resolved_at)";
/** The cash kinds' columns (20261027190000); read only once they exist. */
const COLUMNS = `${STOCK_COLUMNS}, shift_id, remittance_id, drawer_name, cash_cents`;
/** Postgres "no such column": the cash alerts migration is not applied yet. */
const UNDEFINED_COLUMN = "42703";

/** The list shows the latest notices; older ones are history nobody scrolls to. */
const MAX_LIST = 100;

export interface MerchantNotificationInbox {
  items: MerchantNotification[];
  /** When this account last opened the list; null = never. */
  seenAt: string | null;
}

async function listMerchantNotifications(tenantId: string): Promise<MerchantNotification[]> {
  const read = (columns: string) =>
    supabase
      .from("merchant_notifications")
      .select(columns)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(MAX_LIST);
  // The bell must keep working for stock while the cash columns are not there yet.
  let { data, error } = await read(COLUMNS);
  if (error?.code === UNDEFINED_COLUMN) ({ data, error } = await read(STOCK_COLUMNS));
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as MerchantNotificationRow[]).map(toMerchantNotification);
}

async function readSeenAt(tenantId: string, userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("merchant_notification_seen")
    .select("seen_at")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.seen_at as string | undefined) ?? null;
}

export async function loadMerchantNotificationInbox(
  tenantId: string,
  userId: string
): Promise<MerchantNotificationInbox> {
  const [items, seenAt] = await Promise.all([
    listMerchantNotifications(tenantId),
    readSeenAt(tenantId, userId),
  ]);
  return { items, seenAt };
}

/**
 * Opening the list clears the badge. Asserts the write landed: an RLS refusal
 * on upsert is silent, and the badge would then never clear.
 */
export async function markMerchantNotificationsSeen(
  tenantId: string,
  userId: string,
  seenAt: string
): Promise<void> {
  const { data, error } = await supabase
    .from("merchant_notification_seen")
    .upsert({ tenant_id: tenantId, user_id: userId, seen_at: seenAt }, { onConflict: "user_id,tenant_id" })
    .select("seen_at");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Could not mark notifications as seen");
}
