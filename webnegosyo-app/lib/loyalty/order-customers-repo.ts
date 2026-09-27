/**
 * Order customers ↔ platform.
 *
 * A failure is returned, never swallowed into "nobody is a member": the order
 * screen says so and offers a retry, and the queue simply draws no chips.
 */

import { callLoyaltyApi } from "./repo";
import { chunkOrderQueries, type OrderCustomerQuery, type OrderCustomerSummary } from "./order-customers";

const ORDER_CUSTOMERS_PATH = "/api/loyalty/order-customers";

export type OrderCustomersResult =
  | { ok: true; isLoyaltyLive: boolean; customers: OrderCustomerSummary[] }
  | { ok: false; reason: "forbidden" | "unavailable" };

async function fetchChunk(
  tenantId: string,
  backend: string,
  orders: OrderCustomerQuery[],
): Promise<OrderCustomersResult> {
  const result = await callLoyaltyApi(ORDER_CUSTOMERS_PATH, "POST", {
    tenantId,
    body: { backend, orders },
  });
  if (result.status === 401 || result.status === 403) return { ok: false, reason: "forbidden" };
  if (result.status !== 200 || !result.body || !Array.isArray(result.body.customers)) {
    return { ok: false, reason: "unavailable" };
  }
  return {
    ok: true,
    isLoyaltyLive: result.body.isLoyaltyLive === true,
    customers: result.body.customers as OrderCustomerSummary[],
  };
}

/** `backend` is the platform's name for it (`convex`, `platform_supabase`, `tenant_supabase`). */
export async function fetchOrderCustomers(
  tenantId: string,
  backend: string,
  orders: OrderCustomerQuery[],
): Promise<OrderCustomersResult> {
  if (orders.length === 0) return { ok: true, isLoyaltyLive: false, customers: [] };

  const results = await Promise.all(
    chunkOrderQueries(orders).map((chunk) => fetchChunk(tenantId, backend, chunk)),
  );
  const failed = results.find((result) => !result.ok);
  if (failed) return failed;

  const ok = results as Array<Extract<OrderCustomersResult, { ok: true }>>;
  return {
    ok: true,
    isLoyaltyLive: ok.some((result) => result.isLoyaltyLive),
    customers: ok.flatMap((result) => result.customers),
  };
}
