import { buildGovReport } from "./report";
import { cashierAttribution, grantsWithStatus, groupTotals, sumClaims, twinKey, ZERO_TOTALS } from "./netting";
import { GOV_REPORT_PERIODS, manilaDayKey, rangeLabel, resolveGovReportPeriod } from "./period";
import { checkReview, latestVerdict, needsALook, REVIEW_NOTE_MAX, visibleFlags } from "./review-queue";
import { mapRows, toLedgerClaim, toLedgerReview, toReversalStamp } from "./rows";
import { formatManilaDateTime, formatPesoCentavos, formatSalesCount, orderReference } from "./format";
import { readAllPages } from "./paging";
import type { GrantEntry, LedgerClaim, LedgerReview } from "./types";

function claim(overrides: Partial<LedgerClaim> = {}): LedgerClaim {
  return {
    id: "c1",
    outletId: null,
    backend: "platform",
    externalOrderId: "order-1",
    orderLabel: "#01",
    revision: 1,
    event: "granted",
    claimantRef: "cl-1",
    kind: "senior",
    claimantName: "Juan Dela Cruz",
    idNumber: "12345",
    allocationMode: "items",
    diners: null,
    vatStatus: "vat",
    grossShare: 560,
    vatExemptSales: 500,
    vatRemoved: 60,
    discount: 100,
    netDue: 400,
    reduction: 160,
    verification: "verified",
    flags: [],
    grantedByName: "Ana",
    approvedByName: null,
    reversedByName: null,
    source: "pos",
    occurredAt: "2026-10-05T04:00:00.000Z",
    ...overrides,
  };
}

function review(overrides: Partial<LedgerReview> = {}): LedgerReview {
  return {
    id: "r1",
    claimId: "c1",
    verdict: "ok",
    note: null,
    reviewerName: "Owner",
    createdAt: "2026-10-06T00:00:00.000Z",
    ...overrides,
  };
}

const reversalOf = (grant: LedgerClaim, occurredAt: string, id = `${grant.id}-rev`): LedgerClaim => ({
  ...grant,
  id,
  event: "reversed",
  grantedByName: "Ben",
  occurredAt,
});

describe("netting", () => {
  it("adds grants and subtracts their reversals, in centavos", () => {
    const a = claim({ id: "a", reduction: 0.1, discount: 0.1 });
    const b = claim({ id: "b", claimantRef: "cl-2", reduction: 0.2, discount: 0.2 });
    const totals = sumClaims([a, b, reversalOf(a, "2026-10-06T00:00:00.000Z")]);
    expect(totals.sales).toBe(1);
    expect(totals.reduction).toBe(0.2);
    expect(totals.discount).toBe(0.2);
  });

  it("nets a grant and its reversal to zero", () => {
    const grant = claim();
    expect(sumClaims([grant, reversalOf(grant, "2026-10-06T00:00:00.000Z")])).toEqual(ZERO_TOTALS);
  });

  it("does not drift over many small amounts", () => {
    const rows = Array.from({ length: 1000 }, (_, i) => claim({ id: `c${i}`, claimantRef: `r${i}`, vatRemoved: 0.01 }));
    expect(sumClaims(rows).vatRemoved).toBe(10);
  });

  it("charges a reversal to the cashier who gave the discount", () => {
    const grant = claim();
    const rows = [grant, reversalOf(grant, "2026-10-06T00:00:00.000Z")];
    const byCashier = groupTotals(rows, cashierAttribution(rows), (key) => key);
    expect(byCashier).toHaveLength(1);
    expect(byCashier[0]).toMatchObject({ key: "Ana", totals: { sales: 0, reduction: 0 } });
  });

  it("charges a reversal to its own signer when the grant is outside the window", () => {
    const orphan = reversalOf(claim(), "2026-10-06T00:00:00.000Z");
    expect(cashierAttribution([orphan])(orphan)).toBe("Ben");
  });

  it("orders groups by the amount taken off, largest first", () => {
    const rows = [
      claim({ id: "a", grantedByName: "Ana", reduction: 50 }),
      claim({ id: "b", claimantRef: "x", grantedByName: "Cy", reduction: 90 }),
    ];
    expect(groupTotals(rows, (row) => row.grantedByName, (key) => key).map((g) => g.key)).toEqual(["Cy", "Ana"]);
  });

  it("marks a grant reversed by a row in the window or after it", () => {
    const inWindow = claim({ id: "a" });
    const later = claim({ id: "b", claimantRef: "cl-2" });
    const standing = claim({ id: "c", claimantRef: "cl-3" });
    const grants = grantsWithStatus(
      [inWindow, later, standing, reversalOf(inWindow, "2026-10-07T00:00:00.000Z")],
      [{ ...later, occurredAt: "2026-11-02T00:00:00.000Z" }],
      [],
    );
    const byId = Object.fromEntries(grants.map((g) => [g.id, g.reversedAt]));
    expect(byId).toEqual({
      a: "2026-10-07T00:00:00.000Z",
      b: "2026-11-02T00:00:00.000Z",
      c: null,
    });
  });

  it("lists grants only, newest first, with their reviews newest first", () => {
    const older = claim({ id: "a", occurredAt: "2026-10-01T00:00:00.000Z" });
    const newer = claim({ id: "b", claimantRef: "x", occurredAt: "2026-10-09T00:00:00.000Z" });
    const grants = grantsWithStatus(
      [older, newer, reversalOf(older, "2026-10-02T00:00:00.000Z")],
      [],
      [review({ id: "r1", claimId: "a", createdAt: "2026-10-03T00:00:00.000Z" }), review({ id: "r2", claimId: "a", createdAt: "2026-10-04T00:00:00.000Z", verdict: "problem" })],
    );
    expect(grants.map((g) => g.id)).toEqual(["b", "a"]);
    expect(grants[1].reviews.map((r) => r.id)).toEqual(["r2", "r1"]);
    expect(latestVerdict(grants[1])).toBe("problem");
  });

  it("keys twins on backend, order, revision and claimant", () => {
    expect(twinKey(claim())).toBe("platform|order-1|1|cl-1");
  });
});

describe("needs a look", () => {
  const entry = (overrides: Partial<GrantEntry>): GrantEntry => ({ ...claim(), reversedAt: null, reviews: [], ...overrides });

  it("asks about standing, unreviewed grants with a high or medium flag", () => {
    const grants = [
      entry({ id: "high", flags: ["amount_mismatch"] }),
      entry({ id: "medium", flags: ["id_reused_today"], occurredAt: "2026-10-09T00:00:00.000Z" }),
      entry({ id: "low", flags: ["self_approved"] }),
      entry({ id: "clean" }),
      entry({ id: "reversed", flags: ["amount_mismatch"], reversedAt: "2026-10-06T00:00:00.000Z" }),
      entry({ id: "reviewed", flags: ["amount_mismatch"], reviews: [review()] }),
    ];
    expect(needsALook(grants).map((g) => g.id)).toEqual(["medium", "high"]);
  });

  it("explains each flag in words", () => {
    expect(visibleFlags(["approval_missing"])[0]).toMatchObject({ flag: "approval_missing", label: "No approval", severity: "high" });
  });
});

describe("checkReview", () => {
  it("accepts OK without a note and stores blank as null", () => {
    expect(checkReview({ verdict: "ok", note: "  " })).toEqual({ ok: true, verdict: "ok", note: null });
  });

  it("needs a note for a problem", () => {
    expect(checkReview({ verdict: "problem", note: "" }).ok).toBe(false);
    expect(checkReview({ verdict: "problem", note: " ID looked fake " })).toEqual({
      ok: true,
      verdict: "problem",
      note: "ID looked fake",
    });
  });

  it("refuses a note longer than the database allows", () => {
    expect(checkReview({ verdict: "ok", note: "x".repeat(REVIEW_NOTE_MAX + 1) }).ok).toBe(false);
  });
});

describe("periods (Manila days)", () => {
  // 2026-10-12 is a Monday. 01:30 UTC on the 12th is 09:30 in Manila.
  const monday = Date.parse("2026-10-12T01:30:00.000Z");

  it("reads the Manila day, not the UTC one", () => {
    // 20:00 UTC on the 11th is already 04:00 on the 12th in Manila.
    expect(manilaDayKey(Date.parse("2026-10-11T20:00:00.000Z"))).toBe("2026-10-12");
  });

  it("covers today from Manila midnight to the next", () => {
    const today = resolveGovReportPeriod("today", monday);
    expect(today.startIso).toBe("2026-10-11T16:00:00.000Z");
    expect(today.endIso).toBe("2026-10-12T16:00:00.000Z");
    expect(today.fromDay).toBe("2026-10-12");
    expect(today.toDay).toBe("2026-10-12");
  });

  it("starts the week on Monday", () => {
    const sunday = Date.parse("2026-10-18T10:00:00.000Z");
    const week = resolveGovReportPeriod("week", sunday);
    expect(week.fromDay).toBe("2026-10-12");
    expect(week.toDay).toBe("2026-10-18");
    expect(week.label).toBe("Oct 12 – 18, 2026");
    expect(resolveGovReportPeriod("week", monday).fromDay).toBe("2026-10-12");
  });

  it("covers whole calendar months", () => {
    const month = resolveGovReportPeriod("month", monday);
    expect(month).toMatchObject({ fromDay: "2026-10-01", toDay: "2026-10-31", label: "October 2026" });
    expect(month.startIso).toBe("2026-09-30T16:00:00.000Z");
  });

  it("rolls last month back over a year end", () => {
    const january = Date.parse("2027-01-05T00:00:00.000Z");
    expect(resolveGovReportPeriod("last_month", january)).toMatchObject({
      fromDay: "2026-12-01",
      toDay: "2026-12-31",
      label: "December 2026",
    });
  });

  it("offers the four periods of the web report, minus custom", () => {
    expect(GOV_REPORT_PERIODS).toEqual(["today", "week", "month", "last_month"]);
  });

  it("labels ranges across months and years", () => {
    expect(rangeLabel("2026-09-28", "2026-10-04")).toBe("Sep 28 – Oct 4, 2026");
    expect(rangeLabel("2025-12-29", "2026-01-04")).toBe("Dec 29, 2025 – Jan 4, 2026");
  });
});

describe("rows", () => {
  it("parses a database row, numbers sent as strings included", () => {
    const parsed = toLedgerClaim({
      id: "c1",
      event: "granted",
      kind: "pwd",
      gross_share: "560.00",
      reduction: "160.50",
      flags: ["edited", "amount_mismatch", "nonsense"],
      granted_by_name: "",
      revision: "2",
      occurred_at: "2026-10-05T04:00:00Z",
    });
    expect(parsed).toMatchObject({ kind: "pwd", grossShare: 560, reduction: 160.5, revision: 2, grantedByName: "Staff" });
    expect(parsed?.flags).toEqual(["amount_mismatch", "edited"]);
  });

  it("drops rows the ledger's constraints would never allow", () => {
    expect(mapRows([{ event: "voided", kind: "senior" }, { event: "granted", kind: "student" }], toLedgerClaim)).toEqual([]);
    expect(toLedgerReview({ verdict: "maybe" })).toBeNull();
  });

  it("reads reviews and reversal stamps", () => {
    expect(toLedgerReview({ id: "r", claim_id: "c", verdict: "problem", note: "", reviewer_name: "Ana", created_at: "t" })).toEqual({
      id: "r",
      claimId: "c",
      verdict: "problem",
      note: null,
      reviewerName: "Ana",
      createdAt: "t",
    });
    expect(toReversalStamp({ backend: "platform", external_order_id: "o", revision: 3, claimant_ref: "x", occurred_at: "t" })).toEqual({
      backend: "platform",
      externalOrderId: "o",
      revision: 3,
      claimantRef: "x",
      occurredAt: "t",
    });
  });
});

describe("buildGovReport", () => {
  it("totals, groups and queues one window", () => {
    const senior = claim({ id: "a", flags: ["approval_missing"] });
    const pwd = claim({ id: "b", claimantRef: "x", kind: "pwd", grantedByName: "Cy", reduction: 40, discount: 40 });
    const report = buildGovReport({
      rows: [senior, pwd, reversalOf(pwd, "2026-10-08T00:00:00.000Z")],
      laterReversals: [],
      reviews: [],
    });
    expect(report.totals.sales).toBe(1);
    expect(report.totals.reduction).toBe(160);
    expect(report.reversedCount).toBe(1);
    expect(report.byKind.map((g) => g.key)).toEqual(["senior", "pwd"]);
    expect(report.byCashier.map((g) => [g.key, g.totals.sales])).toEqual([
      ["Ana", 1],
      ["Cy", 0],
    ]);
    expect(report.grants).toHaveLength(2);
    expect(report.needsALook.map((g) => g.id)).toEqual(["a"]);
  });

  it("is empty for an empty window", () => {
    const report = buildGovReport({ rows: [], laterReversals: [], reviews: [] });
    expect(report.totals).toEqual(ZERO_TOTALS);
    expect(report.grants).toEqual([]);
  });
});

describe("format", () => {
  it("writes pesos with centavos and a real minus sign", () => {
    expect(formatPesoCentavos(1234.5)).toBe("₱1,234.50");
    expect(formatPesoCentavos(-60)).toBe("−₱60.00");
  });

  it("writes Manila time whatever the phone's zone", () => {
    expect(formatManilaDateTime("2026-10-12T06:30:00.000Z")).toBe("Oct 12, 2:30 PM");
    expect(formatManilaDateTime("2026-10-11T16:05:00.000Z", true)).toBe("Oct 12, 2026, 12:05 AM");
    expect(formatManilaDateTime("garbage")).toBe("—");
  });

  it("names the order and counts sales", () => {
    expect(orderReference({ orderLabel: null, externalOrderId: "abcdef0123456789" })).toBe("…23456789");
    expect(orderReference({ orderLabel: "#07", externalOrderId: "x" })).toBe("#07");
    expect(formatSalesCount(1)).toBe("1 sale");
    expect(formatSalesCount(-2)).toBe("-2 sales");
  });
});

describe("readAllPages", () => {
  const source = (total: number) => {
    const ranges: [number, number][] = [];
    const fetchPage = async (from: number, to: number) => {
      ranges.push([from, to]);
      const rows = Array.from({ length: Math.max(0, Math.min(to, total - 1) - from + 1) }, (_, i) => from + i);
      return { data: rows, error: null };
    };
    return { ranges, fetchPage };
  };

  it("reads past the 1000-row cap until a short page", async () => {
    const { ranges, fetchPage } = source(2500);
    const result = await readAllPages(fetchPage, { pageSize: 1000, maxRows: 5000 });
    expect(result.rows).toHaveLength(2500);
    expect(result.isTruncated).toBe(false);
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("stops at the ceiling and says there was more", async () => {
    const { fetchPage } = source(6000);
    const result = await readAllPages(fetchPage, { pageSize: 1000, maxRows: 5000 });
    expect(result.rows).toHaveLength(5000);
    expect(result.isTruncated).toBe(true);
  });

  it("is not truncated when the data ends exactly at the ceiling", async () => {
    const { fetchPage } = source(2000);
    const result = await readAllPages(fetchPage, { pageSize: 1000, maxRows: 2000 });
    expect(result).toMatchObject({ isTruncated: false });
    expect(result.rows).toHaveLength(2000);
  });

  it("fails loudly on a read error", async () => {
    await expect(
      readAllPages(async () => ({ data: null, error: { message: "boom" } }), { pageSize: 10, maxRows: 10 }),
    ).rejects.toThrow("boom");
  });
});
