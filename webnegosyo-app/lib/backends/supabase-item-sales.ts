/**
 * `analytics:getItemSales` on the platform backend: every line sold in a
 * window, with the options it carried and the moment its order was placed.
 *
 * The product performance screens slice these into products, variations and
 * add-ons on the phone (`lib/product-performance`). Reading lines through a
 * join on their order — rather than "the last N orders, then their items by
 * id" — is one windowed read instead of dozens of id-chunked ones, and it
 * cannot silently drop the start of a busy window.
 */

import type { BranchScope } from "../branch-scope";
import { isUuid } from "../uuid";
import type { SalesLine } from "../product-performance/types";
import {
  readAllPages,
  scopeToBranch,
  toNumber,
  type PlatformClient,
} from "./platform-client";
import type { OrderVariationSelection } from "./supabase-orders";

/**
 * The most lines one read returns. A store taking ~500 lines a day fits a
 * month; past this the screen is told its figures are partial rather than
 * being handed a short answer that looks whole.
 */
export const ITEM_SALES_LIMIT = 30000;

/** Only what the performance arithmetic reads. */
const ITEM_SALES_COLUMNS =
  "id, order_id, menu_item_id, menu_item_name, quantity, subtotal, variation, variation_selections, addons, orders!inner(tenant_id, created_at, status, source, outlet_id)";

interface ItemSalesRow {
  order_id: string;
  menu_item_id: string | null;
  menu_item_name: string | null;
  quantity: unknown;
  subtotal: unknown;
  variation: string | null;
  variation_selections: OrderVariationSelection[] | null;
  addons: string[] | null;
  orders: { created_at: string; source: string | null } | null;
}

export interface ItemSalesArgs {
  startMs: number;
  endMs: number;
  menuItemId?: string;
}

export interface ItemSalesResult {
  lines: SalesLine[];
  isTruncated: boolean;
}

function toSalesLine(row: ItemSalesRow): SalesLine | null {
  // A line whose product was deleted keeps its name but loses its id; it cannot
  // be charted against a product, so it is left out rather than lumped together.
  if (!row.menu_item_id || !row.orders) return null;
  return {
    orderId: row.order_id,
    createdAtMs: Date.parse(row.orders.created_at),
    source: row.orders.source ?? undefined,
    menuItemId: row.menu_item_id,
    menuItemName: row.menu_item_name ?? "",
    quantity: toNumber(row.quantity),
    subtotal: toNumber(row.subtotal),
    variation: row.variation ?? undefined,
    variationSelections: row.variation_selections?.length ? row.variation_selections : undefined,
    // The platform stores add-on names only; the price is resolved later.
    addons: (row.addons ?? []).map((name) => ({ name, price: 0 })),
  };
}

/** The window and optional product a screen sent, validated. */
export function parseItemSalesArgs(params: Record<string, unknown>): ItemSalesArgs {
  const startMs = Number(params.startMs);
  const endMs = Number(params.endMs);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    throw new Error("Item sales need a window — startMs and endMs as epoch milliseconds, end after start.");
  }
  if (params.menuItemId === undefined) return { startMs, endMs };
  if (!isUuid(params.menuItemId)) {
    throw new Error("Item sales were asked for a product id this store cannot hold.");
  }
  return { startMs, endMs, menuItemId: params.menuItemId as string };
}

export async function readItemSales(
  client: PlatformClient,
  tenantId: string,
  scope: BranchScope,
  args: ItemSalesArgs
): Promise<ItemSalesResult> {
  const build = () => {
    let builder = scopeToBranch(
      client
        .from("order_items")
        .select(ITEM_SALES_COLUMNS)
        .eq("orders.tenant_id", tenantId)
        .gte("orders.created_at", new Date(args.startMs).toISOString())
        .lt("orders.created_at", new Date(args.endMs).toISOString())
        .neq("orders.status", "cancelled"),
      scope,
      "orders.outlet_id"
    );
    if (args.menuItemId) builder = builder.eq("menu_item_id", args.menuItemId);
    return builder
      .order("orders(created_at)", { ascending: false })
      .order("id", { ascending: false });
  };

  const rows = await readAllPages<ItemSalesRow>(build, ITEM_SALES_LIMIT);
  return {
    lines: rows.map(toSalesLine).filter((line): line is SalesLine => line !== null),
    isTruncated: rows.length >= ITEM_SALES_LIMIT,
  };
}
