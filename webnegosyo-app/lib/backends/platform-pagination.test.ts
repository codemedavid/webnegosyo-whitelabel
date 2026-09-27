import { PLATFORM_PAGE_SIZE, readAllPages } from "./platform-client";
import { fakePlatformClient, opsOf } from "./testing/fake-platform-client";

/**
 * The platform project answers at most PLATFORM_PAGE_SIZE rows per request no
 * matter what `.limit()` asks for. A read that asked for 10 000 and got 1 000
 * used to be summed as if it were complete — a busy store's week read short.
 */

function rows(count: number, offset = 0) {
  return Array.from({ length: count }, (_, i) => ({ id: `r${offset + i}` }));
}

describe("readAllPages", () => {
  it("keeps reading pages until a short page ends the result", async () => {
    // Arrange
    const { client, calls } = fakePlatformClient({
      orders: [
        { data: rows(PLATFORM_PAGE_SIZE), error: null },
        { data: rows(PLATFORM_PAGE_SIZE, PLATFORM_PAGE_SIZE), error: null },
        { data: rows(37, PLATFORM_PAGE_SIZE * 2), error: null },
      ],
    });

    // Act
    const result = await readAllPages<{ id: string }>(() =>
      client.from("orders").select("id").eq("tenant_id", "t1")
    );

    // Assert
    expect(result).toHaveLength(PLATFORM_PAGE_SIZE * 2 + 37);
    expect(opsOf(calls, "range")).toEqual([
      [0, PLATFORM_PAGE_SIZE - 1],
      [PLATFORM_PAGE_SIZE, PLATFORM_PAGE_SIZE * 2 - 1],
      [PLATFORM_PAGE_SIZE * 2, PLATFORM_PAGE_SIZE * 3 - 1],
    ]);
    // Every page is a fresh query carrying the caller's filters.
    expect(calls).toHaveLength(3);
    for (const call of calls) {
      expect(call.ops).toContainEqual({ method: "eq", args: ["tenant_id", "t1"] });
    }
  });

  it("stops at maxRows and never asks for more than the cap", async () => {
    // Arrange
    const { client, calls } = fakePlatformClient({
      orders: [
        { data: rows(PLATFORM_PAGE_SIZE), error: null },
        { data: rows(500, PLATFORM_PAGE_SIZE), error: null },
      ],
    });

    // Act
    const result = await readAllPages(() => client.from("orders").select("id"), 1500);

    // Assert
    expect(result).toHaveLength(1500);
    expect(opsOf(calls, "range")).toEqual([
      [0, PLATFORM_PAGE_SIZE - 1],
      [PLATFORM_PAGE_SIZE, 1499],
    ]);
  });

  it("makes a single request when the first page is short", async () => {
    // Arrange
    const { client, calls } = fakePlatformClient({ orders: [{ data: rows(3), error: null }] });

    // Act
    const result = await readAllPages(() => client.from("orders").select("id"));

    // Assert
    expect(result).toHaveLength(3);
    expect(calls).toHaveLength(1);
  });

  it("treats a null page as empty", async () => {
    // Arrange
    const { client } = fakePlatformClient({ orders: [{ data: null, error: null }] });

    // Act
    const result = await readAllPages(() => client.from("orders").select("id"));

    // Assert
    expect(result).toEqual([]);
  });

  it("throws the database error instead of returning a partial result", async () => {
    // Arrange
    const { client } = fakePlatformClient({
      orders: [
        { data: rows(PLATFORM_PAGE_SIZE), error: null },
        { data: null, error: { message: "statement timeout" } },
      ],
    });

    // Act + Assert
    await expect(readAllPages(() => client.from("orders").select("id"))).rejects.toThrow(
      "statement timeout"
    );
  });
});

describe("platform reads past the per-request cap", () => {
  const TENANT = "11111111-1111-4111-8111-111111111111";

  function orderRows(count: number, offset = 0) {
    return Array.from({ length: count }, (_, i) => ({
      id: `o${offset + i}`,
      tenant_id: TENANT,
      created_at: new Date(Date.UTC(2026, 8, 23, 4) - (offset + i) * 1000).toISOString(),
      status: "delivered",
      total: "100",
    }));
  }

  it("returns every order a 2000-order request matches, not the first 1000", async () => {
    // Arrange
    const { runPlatformQuery } = await import("./supabase-adapter");
    const { client } = fakePlatformClient({
      orders: [
        { data: orderRows(PLATFORM_PAGE_SIZE), error: null },
        { data: orderRows(83, PLATFORM_PAGE_SIZE), error: null },
      ],
    });

    // Act
    const orders = (await runPlatformQuery(client, TENANT, "orders:getOrders", {
      limit: 2000,
    })) as unknown[];

    // Assert
    expect(orders).toHaveLength(PLATFORM_PAGE_SIZE + 83);
  });

  it("sums a period's takings across every page", async () => {
    // Arrange
    const { runPlatformQuery } = await import("./supabase-adapter");
    const { client } = fakePlatformClient({
      orders: [
        { data: orderRows(PLATFORM_PAGE_SIZE), error: null },
        { data: orderRows(83, PLATFORM_PAGE_SIZE), error: null },
      ],
    });

    // Act
    const stats = (await runPlatformQuery(client, TENANT, "orders:getDashboardStatsByPeriod", {
      startDate: Date.UTC(2026, 7, 1),
      endDate: Date.UTC(2026, 8, 24),
    })) as { totalOrders: number; totalRevenue: number };

    // Assert
    expect(stats.totalOrders).toBe(PLATFORM_PAGE_SIZE + 83);
    expect(stats.totalRevenue).toBe((PLATFORM_PAGE_SIZE + 83) * 100);
  });
});
