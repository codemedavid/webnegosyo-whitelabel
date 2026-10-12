/**
 * The sales-book reads and the review write, against a recorded Supabase
 * chain. What matters: every read is bounded by the tenant and the window and
 * paged with `.range`, and a review that did not land is never reported as
 * saved (RLS refusals can be silent).
 */

const calls: { table: string; method: string; args: unknown[] }[] = [];
let responder: (table: string, ops: { method: string; args: unknown[] }[]) => { data: unknown; error: unknown } = () => ({
  data: [],
  error: null,
});

jest.mock("../supabase", () => ({
  supabase: {
    from: (table: string) => {
      const ops: { method: string; args: unknown[] }[] = [];
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "insert", "eq", "gte", "lt", "order", "range"]) {
        chain[method] = (...args: unknown[]) => {
          ops.push({ method, args });
          calls.push({ table, method, args });
          return chain;
        };
      }
      chain.then = (resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) =>
        Promise.resolve(responder(table, ops)).then(resolve, reject);
      return chain;
    },
  },
}));

import { fetchGovLedger, submitGovReview } from "./service";
import { resolveGovReportPeriod } from "./period";

const NOW = Date.parse("2026-10-12T04:00:00.000Z");

beforeEach(() => {
  calls.length = 0;
  responder = () => ({ data: [], error: null });
});

const grantRow = {
  id: "c1",
  event: "granted",
  kind: "senior",
  backend: "platform",
  external_order_id: "o1",
  revision: 1,
  claimant_ref: "x",
  reduction: 160,
  occurred_at: "2026-10-05T00:00:00Z",
};

describe("fetchGovLedger", () => {
  it("reads the window for the tenant, newest first, paged", async () => {
    responder = (table) => ({ data: table === "gov_discount_claims" ? [grantRow] : [], error: null });
    const period = resolveGovReportPeriod("month", NOW);
    const ledger = await fetchGovLedger("tenant-1", period, NOW);

    expect(ledger.rows.map((row) => row.id)).toEqual(["c1"]);
    expect(ledger.isTruncated).toBe(false);
    const claimOps = calls.filter((c) => c.table === "gov_discount_claims");
    expect(claimOps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: "eq", args: ["tenant_id", "tenant-1"] }),
        expect.objectContaining({ method: "gte", args: ["occurred_at", period.startIso] }),
        expect.objectContaining({ method: "lt", args: ["occurred_at", period.endIso] }),
        expect.objectContaining({ method: "range", args: [0, 999] }),
      ]),
    );
    // Reviews are read only because there was a grant to review.
    expect(calls.some((c) => c.table === "gov_discount_reviews")).toBe(true);
  });

  it("skips later reversals for a window that has not ended", async () => {
    await fetchGovLedger("tenant-1", resolveGovReportPeriod("month", NOW), NOW);
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "event")).toBe(false);
  });

  it("looks for later reversals of a finished window", async () => {
    await fetchGovLedger("tenant-1", resolveGovReportPeriod("last_month", NOW), NOW);
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "event" && c.args[1] === "reversed")).toBe(true);
  });

  it("fails loudly on a read error", async () => {
    responder = () => ({ data: null, error: { message: "permission denied" } });
    await expect(fetchGovLedger("tenant-1", resolveGovReportPeriod("today", NOW), NOW)).rejects.toThrow(
      "permission denied",
    );
  });
});

describe("submitGovReview", () => {
  const write = { tenantId: "tenant-1", claimId: "c1", verdict: "problem" as const, note: "ID mismatch" };

  it("inserts the verdict and never a reviewer", async () => {
    responder = () => ({ data: [{ id: "r1" }], error: null });
    await submitGovReview(write);
    const insert = calls.find((c) => c.method === "insert");
    expect(insert?.table).toBe("gov_discount_reviews");
    expect(insert?.args[0]).toEqual({ tenant_id: "tenant-1", claim_id: "c1", verdict: "problem", note: "ID mismatch" });
  });

  it("reports a silent refusal as not saved", async () => {
    responder = () => ({ data: [], error: null });
    await expect(submitGovReview(write)).rejects.toThrow(/not recorded/);
  });

  it("explains an RLS refusal in words", async () => {
    responder = () => ({ data: null, error: { code: "42501", message: "new row violates row-level security" } });
    await expect(submitGovReview(write)).rejects.toThrow(/review permission/);
  });
});
