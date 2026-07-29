import {
  fetchTenantOrdersPage,
  fetchTenantOrderStats,
} from "@/lib/tenant-supabase-orders-read";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Branch scoping on the tenant-owned Supabase backend.
 *
 * This is the second of the three order backends. The platform path is already
 * scoped in `orders-service.ts`; without this, a branch account whose store
 * runs on its own Supabase project still reads every branch's orders.
 *
 * The filter has to go into the SQL, not into a `.filter()` on the result.
 * These queries are paginated with `count: 'exact'`: filtering after the fact
 * would hand back a 20-row page with 3 rows visible, above a total describing
 * a store the account is not allowed to see.
 */

interface QueryCall {
  table: string;
  eq: Array<[string, unknown]>;
}

function makeFakeClient(result: { data: unknown; count?: number | null }) {
  const calls: QueryCall[] = [];

  const makeBuilder = (call: QueryCall) => {
    const builder = {
      select: () => builder,
      eq(column: string, value: unknown) {
        call.eq.push([column, value]);
        return builder;
      },
      gte: () => builder,
      order: () => builder,
      range: () => Promise.resolve({ ...result, error: null }),
      then(onFulfilled: (r: unknown) => unknown) {
        return Promise.resolve({ ...result, error: null }).then(onFulfilled);
      },
    };
    return builder;
  };

  const client = {
    from(table: string) {
      const call: QueryCall = { table, eq: [] };
      calls.push(call);
      return makeBuilder(call);
    },
  };

  return { client: client as unknown as SupabaseClient, calls };
}

const BRANCH = { kind: "branch", outletId: "outlet-north" } as const;
const ALL = { kind: "all" } as const;

function outletFilters(calls: QueryCall[]): Array<[string, unknown]> {
  return calls.flatMap((c) => c.eq.filter(([column]) => column === "outlet_id"));
}

describe("fetchTenantOrdersPage branch scoping", () => {
  it("filters the query to the account's branch", async () => {
    const { client, calls } = makeFakeClient({ data: [], count: 0 });

    await fetchTenantOrdersPage(client, "tenant-1", {}, BRANCH);

    expect(outletFilters(calls)).toEqual([["outlet_id", "outlet-north"]]);
  });

  it("leaves the query alone for a store-wide account", async () => {
    const { client, calls } = makeFakeClient({ data: [], count: 0 });

    await fetchTenantOrdersPage(client, "tenant-1", {}, ALL);

    expect(outletFilters(calls)).toEqual([]);
  });

  it("still scopes to the tenant as well as the branch", async () => {
    // The branch filter must narrow the tenant filter, never replace it.
    const { client, calls } = makeFakeClient({ data: [], count: 0 });

    await fetchTenantOrdersPage(client, "tenant-1", {}, BRANCH);

    expect(calls[0].eq).toContainEqual(["tenant_id", "tenant-1"]);
  });

  it("defaults to store-wide when no scope is given", async () => {
    // Existing callers pass no scope; they must keep working unchanged.
    const { client, calls } = makeFakeClient({ data: [], count: 0 });

    await fetchTenantOrdersPage(client, "tenant-1", {});

    expect(outletFilters(calls)).toEqual([]);
  });
});

describe("fetchTenantOrderStats branch scoping", () => {
  it("filters today's figures to the account's branch", async () => {
    // Otherwise the branch reads its own order list under store-wide takings.
    const { client, calls } = makeFakeClient({ data: [] });

    await fetchTenantOrderStats(client, "tenant-1", new Date("2026-07-29T10:00:00Z"), BRANCH);

    expect(outletFilters(calls)).toEqual([["outlet_id", "outlet-north"]]);
  });

  it("leaves the figures store-wide for an unscoped account", async () => {
    const { client, calls } = makeFakeClient({ data: [] });

    await fetchTenantOrderStats(client, "tenant-1", new Date("2026-07-29T10:00:00Z"), ALL);

    expect(outletFilters(calls)).toEqual([]);
  });
});
