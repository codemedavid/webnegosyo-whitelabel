/** The "Missing from sales book" rows, parsed from the web route (pure). */

export interface MissingOrder {
  orderId: string;
  label: string | null;
  occurredAt: string;
  outletId: string | null;
  total: number;
  claimantCount: number;
  reduction: number;
}

function isMissingOrder(value: unknown): value is MissingOrder {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Partial<MissingOrder>;
  return (
    typeof row.orderId === "string" &&
    typeof row.occurredAt === "string" &&
    typeof row.reduction === "number" &&
    typeof row.claimantCount === "number"
  );
}

/** The route's answer, keeping only well-formed rows. */
export function parseMissingOrders(json: Record<string, unknown>): MissingOrder[] {
  return Array.isArray(json.orders) ? json.orders.filter(isMissingOrder) : [];
}
