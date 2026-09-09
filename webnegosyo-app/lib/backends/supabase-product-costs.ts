/**
 * Serves the app's `productCosts:*` function refs from the shared platform
 * Supabase (`public.product_costs`, one row per tenant and menu item).
 *
 * Mirrors `convex-template/convex/productCosts.ts`: the product editor and the
 * product list read costs, the editor and the BCG screen write them. Reads and
 * writes are tenant-scoped in the query itself, and the write is validated
 * before it reaches PostgREST so a malformed cost never lands as `NaN`.
 */

import {
  STATS_LIMIT,
  asRecord,
  optionalString,
  requireTenant,
  toNumber,
  unwrap,
  type PlatformClient,
} from "./platform-client";

const QUERY_REFS = ["productCosts:getCost", "productCosts:getAllCosts"] as const;
const MUTATION_REFS = ["productCosts:setCost"] as const;

export function isPlatformProductCostRef(ref: string): boolean {
  return (
    (QUERY_REFS as readonly string[]).includes(ref) ||
    (MUTATION_REFS as readonly string[]).includes(ref)
  );
}

const COST_COLUMNS = "id, menu_item_id, cost_price, cost_notes, created_at, updated_at";
const COST_CONFLICT_KEY = "tenant_id,menu_item_id";

interface ProductCostRow {
  id: string;
  menu_item_id: string;
  cost_price: unknown;
  cost_notes: string | null;
  created_at: string;
  updated_at: string | null;
}

/** The shape `productCosts:getCost` returns on Convex. */
export interface ProductCostDto {
  _id: string;
  _creationTime: number;
  menuItemId: string;
  costPrice: number;
  costNotes?: string;
  createdAt: number;
  updatedAt: number;
}

function toDto(row: ProductCostRow): ProductCostDto {
  const createdAt = Date.parse(row.created_at);
  return {
    _id: row.id,
    _creationTime: createdAt,
    menuItemId: row.menu_item_id,
    costPrice: toNumber(row.cost_price),
    costNotes: row.cost_notes ?? undefined,
    createdAt,
    updatedAt: row.updated_at ? Date.parse(row.updated_at) : createdAt,
  };
}

function requireMenuItemId(params: Record<string, unknown>): string {
  const menuItemId = optionalString(params.menuItemId);
  if (!menuItemId) throw new Error("A menu item is required to read or write its cost.");
  return menuItemId;
}

/** A finite, non-negative cost. Anything else is refused before the write. */
function requireCostPrice(value: unknown): number {
  const cost = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(cost) || cost < 0) {
    throw new Error("Cost price must be a number of zero or more.");
  }
  return cost;
}

async function getCost(client: PlatformClient, tenantId: string, params: Record<string, unknown>) {
  const row = await unwrap<ProductCostRow | null>(
    client
      .from("product_costs")
      .select(COST_COLUMNS)
      .eq("tenant_id", tenantId)
      .eq("menu_item_id", requireMenuItemId(params))
      .maybeSingle()
  );
  return row ? toDto(row) : null;
}

async function getAllCosts(client: PlatformClient, tenantId: string) {
  const rows = await unwrap<ProductCostRow[] | null>(
    client.from("product_costs").select(COST_COLUMNS).eq("tenant_id", tenantId).limit(STATS_LIMIT)
  );
  return (rows ?? []).map(toDto);
}

async function setCost(client: PlatformClient, tenantId: string, params: Record<string, unknown>) {
  const menuItemId = requireMenuItemId(params);
  const costPrice = requireCostPrice(params.costPrice);
  const costNotes = optionalString(params.costNotes);

  const row = await unwrap<{ id: string } | null>(
    client
      .from("product_costs")
      .upsert(
        {
          tenant_id: tenantId,
          menu_item_id: menuItemId,
          cost_price: costPrice,
          cost_notes: costNotes,
          updated_at: new Date().toISOString(),
        },
        { onConflict: COST_CONFLICT_KEY }
      )
      .select("id")
      .single()
  );
  if (!row) throw new Error("Cost upsert returned no row.");
  return row.id;
}

export async function runPlatformProductCostQuery(
  client: PlatformClient,
  tenantId: string,
  ref: string,
  args: unknown
): Promise<unknown> {
  const tenant = requireTenant(tenantId);
  const params = asRecord(args);

  switch (ref) {
    case "productCosts:getCost":
      return getCost(client, tenant, params);
    case "productCosts:getAllCosts":
      return getAllCosts(client, tenant);
    default:
      throw new Error(`Query "${ref}" is not supported by the platform backend.`);
  }
}

export async function runPlatformProductCostMutation(
  client: PlatformClient,
  tenantId: string,
  ref: string,
  args: unknown
): Promise<unknown> {
  const tenant = requireTenant(tenantId);
  const params = asRecord(args);

  switch (ref) {
    case "productCosts:setCost":
      return setCost(client, tenant, params);
    default:
      throw new Error(`Mutation "${ref}" is not supported by the platform backend.`);
  }
}
