/**
 * Reading the store's business-day cutoffs (`business_day_cutoffs`) in the app.
 *
 * The table lives on the platform Supabase for EVERY store (it is a store
 * setting, not order data), so Convex and tenant-database stores read it the
 * same way.
 */
let mockAnswer: { data: unknown; error: unknown } | Error = { data: [], error: null };
const mockCalls: Record<string, unknown[]> = {};

jest.mock("../supabase", () => {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order"]) {
    chain[method] = (...args: unknown[]) => {
      mockCalls[method] = args;
      return chain;
    };
  }
  chain.limit = (...args: unknown[]) => {
    mockCalls.limit = args;
    return mockAnswer instanceof Error ? Promise.reject(mockAnswer) : Promise.resolve(mockAnswer);
  };
  return {
    supabase: {
      from: (table: string) => {
        mockCalls.from = [table];
        return chain;
      },
    },
  };
});

import {
  CUTOFF_ROW_LIMIT,
  CUTOFF_SCHEDULE_RESOURCE,
  cutoffScheduleKey,
  fetchCutoffSchedule,
} from "./schedule-service";

beforeEach(() => {
  mockAnswer = { data: [], error: null };
  for (const key of Object.keys(mockCalls)) delete mockCalls[key];
});

describe("fetchCutoffSchedule", () => {
  it("reads one store's rows, oldest first, bounded", async () => {
    mockAnswer = { data: [{ effective_from: "2026-10-28", cutoff_minutes: 240 }], error: null };

    await expect(fetchCutoffSchedule("t1")).resolves.toEqual([
      { effectiveFrom: "2026-10-28", cutoffMinutes: 240 },
    ]);
    expect(mockCalls.from).toEqual(["business_day_cutoffs"]);
    expect(mockCalls.eq).toEqual(["tenant_id", "t1"]);
    expect(mockCalls.order).toEqual(["effective_from", { ascending: true }]);
    expect(mockCalls.limit).toEqual([CUTOFF_ROW_LIMIT]);
  });

  it("treats no rows as midnight", async () => {
    await expect(fetchCutoffSchedule("t1")).resolves.toEqual([]);
  });

  it("treats a table that is not there yet as midnight", async () => {
    mockAnswer = { data: null, error: { code: "PGRST205", message: "Could not find the table" } };
    await expect(fetchCutoffSchedule("t1")).resolves.toEqual([]);
  });

  it("throws when the read fails, so the cache can fall back and say so", async () => {
    mockAnswer = { data: null, error: { code: "57014", message: "timeout" } };
    await expect(fetchCutoffSchedule("t1")).rejects.toThrow("timeout");
  });

  it("throws on rows it cannot trust", async () => {
    mockAnswer = { data: [{ effective_from: "2026-10-28", cutoff_minutes: 13 }], error: null };
    await expect(fetchCutoffSchedule("t1")).rejects.toThrow();
  });
});

describe("cutoffScheduleKey", () => {
  it("is a per-tenant resource key, so a store switch never reuses another store's day", () => {
    expect(cutoffScheduleKey("t1")).toEqual(["resource", CUTOFF_SCHEDULE_RESOURCE, "t1"]);
  });
});
