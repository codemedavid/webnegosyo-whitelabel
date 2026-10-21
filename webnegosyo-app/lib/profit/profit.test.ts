import {
  bucketKeys,
  checkCustomRange,
  previousFullWindow,
  profitCaption,
  resolveProfitWindow,
  trendGrainFor,
} from "./profit-period";
import { toExpenseCategoryTotals, toProfitFigures, toProfitPeriods } from "./profit-rows";
import { callProfit, composeProfit, readProfit, PROFIT_FAILED_MESSAGE, type ProfitRpcClient } from "./profit-service";
import {
  PROFIT_LOCKED_MESSAGE,
  canSeeProfit,
  findingPhrase,
  findingRow,
  formatMoney,
  formatRatio,
  moneyBars,
  notInProfitLine,
  profitVerdict,
} from "./profit-view";

// Wed 2026-10-21 12:00 in Manila.
const NOW = Date.parse("2026-10-21T04:00:00Z");
const MANILA = (day: string) => Date.parse(`${day}T00:00:00Z`) - 8 * 3600_000;

const summaryRow = {
  orders: 120,
  net_sales_cents: 18_240_000,
  collected_cents: "18000000",
  sale_movements: 0,
  ledger_cogs_cents: 0,
  fallback_cogs_cents: 0,
  fallback_orders: 0,
  waste_cents: 0,
  count_variance_cents: 0,
  uncosted_movements: 0,
  sold_quantity: 300,
  costed_quantity: 0,
  sold_dishes: 31,
  costed_dishes: 0,
  dish_costs_visible: true,
  ingredients_cents: 6_410_000,
  ingredient_stock_cents: 0,
  staff_cents: 1_480_000,
  occupancy_cents: 0,
  utilities_cents: 857_000,
  operating_cents: 296_000,
  admin_cents: 0,
  other_cents: 0,
  capex_cents: 2_500_000,
  not_expense_cents: 500_000,
  expense_count: 14,
  store_wide_expense_cents: 0,
  unsorted_payouts: 2,
  unsorted_payout_cents: 45_000,
};

const categoryRows = [
  { category_id: "wages", name: "Salaries & wages (Sahod)", icon: "SW", category_group: "staff", system_key: "wages", cents: 1_480_000, stock_purchase_cents: 0, expenses: 2 },
  { category_id: "elec", name: "Electricity (Kuryente)", icon: "EL", category_group: "utilities", system_key: "electricity", cents: 482_000, stock_purchase_cents: 0, expenses: 1 },
  { category_id: "lpg", name: "Gas / LPG", icon: "LP", category_group: "utilities", system_key: "lpg", cents: 375_000, stock_purchase_cents: 0, expenses: 3 },
  { category_id: "rider", name: "Delivery & rider fees", icon: "DF", category_group: "operating", system_key: "delivery_fees", cents: 296_000, stock_purchase_cents: 0, expenses: 8 },
  { category_id: "ing", name: "Ingredients (Palengke)", icon: "IN", category_group: "ingredients", system_key: "ingredients", cents: 6_410_000, stock_purchase_cents: 0, expenses: 9 },
];
const previousRows = [
  { category_id: "rent", name: "Rent (Upa)", icon: "RE", category_group: "occupancy", system_key: "rent", cents: 1_500_000, stock_purchase_cents: 0, expenses: 1 },
];

describe("profit rows", () => {
  it("maps the summary, reading bigint strings", () => {
    const figures = toProfitFigures([summaryRow]);
    expect(figures.collectedCents).toBe(18_000_000);
    expect(figures.groupCents.utilities).toBe(857_000);
    expect(figures.dishCostsVisible).toBe(true);
  });

  it("fails loudly on a row without the promised shape instead of showing ₱0", () => {
    expect(() => toProfitFigures([{ ...summaryRow, net_sales_cents: "12.5" }])).toThrow(/net_sales_cents/);
    expect(() => toProfitFigures([])).toThrow(/no row/);
    expect(() => toExpenseCategoryTotals([{ ...categoryRows[0], category_group: "fun" }])).toThrow(/category_group/);
    expect(() => toProfitPeriods([{ bucket: "Oct 1" }])).toThrow(/bucket/);
  });

  it("sorts period rows oldest first", () => {
    const row = (bucket: string) => ({
      bucket, orders: 1, net_sales_cents: 0, collected_cents: 0, sale_movements: 0, ledger_cogs_cents: 0, fallback_cogs_cents: 0,
      waste_cents: 0, count_variance_cents: 0, ingredient_direct_cents: 0, ingredient_stock_cents: 0, expenses_cents: 0, cash_out_cents: 0,
    });
    expect(toProfitPeriods([row("2026-10-12"), row("2026-10-05")]).map((p) => p.bucket)).toEqual(["2026-10-05", "2026-10-12"]);
  });
});

describe("profit windows", () => {
  it("reads this month so far, from Manila midnight to now", () => {
    const w = resolveProfitWindow({ preset: "this_month" }, NOW);
    expect(w).toMatchObject({ start: MANILA("2026-10-01"), end: NOW, fullEnd: MANILA("2026-11-01"), isPartial: true, label: "October" });
    expect(profitCaption(w, "Main")).toBe("This month so far · Main");
  });

  it("reads last month whole, and this week from Monday", () => {
    expect(resolveProfitWindow({ preset: "last_month" }, NOW)).toMatchObject({
      start: MANILA("2026-09-01"),
      end: MANILA("2026-10-01"),
      isPartial: false,
      phrase: "last month",
    });
    expect(resolveProfitWindow({ preset: "this_week" }, NOW)).toMatchObject({ start: MANILA("2026-10-19"), fromKey: "2026-10-19", toKey: "2026-10-25" });
  });

  it("holds a custom range to the report functions' 93 days", () => {
    expect(checkCustomRange("2026-07-01", "2026-10-01", NOW)).toEqual({ ok: true });
    expect(checkCustomRange("2026-06-01", "2026-10-01", NOW)).toEqual({ ok: false, reason: "Pick 93 days or fewer." });
    expect(checkCustomRange("2026-10-05", "2026-10-01", NOW).ok).toBe(false);
    const w = resolveProfitWindow({ preset: "custom", fromKey: "2026-10-01", toKey: "2026-10-10" }, NOW);
    expect(w).toMatchObject({ start: MANILA("2026-10-01"), end: MANILA("2026-10-11"), isPartial: false, label: "Oct 1 – Oct 10" });
  });

  it("compares bills against the whole period before", () => {
    expect(previousFullWindow(resolveProfitWindow({ preset: "this_month" }, NOW))).toEqual({ start: MANILA("2026-09-01"), end: MANILA("2026-10-01") });
    expect(previousFullWindow(resolveProfitWindow({ preset: "custom", fromKey: "2026-10-20", toKey: "2026-10-21" }, NOW))).toBeNull();
  });

  it("buckets a month by week and a week by day", () => {
    const month = resolveProfitWindow({ preset: "this_month" }, NOW);
    expect(trendGrainFor(month)).toBe("week");
    expect(bucketKeys(month, "week")).toEqual(["2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19"]);
    const week = resolveProfitWindow({ preset: "this_week" }, NOW);
    expect(trendGrainFor(week)).toBe("day");
    expect(bucketKeys(week, "day")).toEqual(["2026-10-19", "2026-10-20", "2026-10-21"]);
  });
});

describe("profit access", () => {
  it("needs expenses AND costs on top of reports", () => {
    const staff = (permissions: string[]) => ({ role: "admin", isOwner: false, permissions });
    expect(canSeeProfit({ role: "admin", isOwner: true, permissions: null })).toBe(true);
    expect(canSeeProfit(staff(["reports", "expenses", "costs"]))).toBe(true);
    expect(canSeeProfit(staff(["reports", "expenses"]))).toBe(false);
    expect(canSeeProfit(staff(["reports", "costs"]))).toBe(false);
  });
});

function fakeClient(answers: Record<string, { data: unknown; error: { code?: string; message?: string } | null }[]>) {
  const calls: [string, Record<string, unknown>][] = [];
  const client: ProfitRpcClient = {
    rpc: (fn, args) => {
      calls.push([fn, args]);
      return Promise.resolve(answers[fn]?.shift() ?? { data: [], error: null });
    },
  };
  return { client, calls };
}

describe("reading profit", () => {
  const w = resolveProfitWindow({ preset: "this_month" }, NOW);

  it("reads as the user, with the branch only when one is chosen, and shapes the web's sentence", async () => {
    const { client, calls } = fakeClient({
      report_profit_summary: [{ data: [summaryRow], error: null }],
      report_expenses_by_category: [
        { data: categoryRows, error: null },
        { data: previousRows, error: null },
      ],
      report_profit_by_period: [{ data: [], error: null }],
    });

    const result = await readProfit(client, w, { tenantId: "t1", branch: { outletId: "o1", unassigned: false } });

    expect(calls[0]).toEqual([
      "report_profit_summary",
      { p_tenant: "t1", p_from: new Date(w.start).toISOString(), p_to: new Date(NOW).toISOString(), p_outlet: "o1" },
    ]);
    expect(calls[3][1]).toMatchObject({ p_grain: "week" });
    if (result.status !== "ready") throw new Error(result.status);
    const { report } = result;
    // Doesn't track stock: every ingredient purchase is the estimate.
    expect(report.ingredientBasis).toBe("purchases");
    expect(report.ingredientCostCents).toBe(6_410_000);
    expect(report.expensesCents).toBe(2_633_000);
    expect(report.profitCents).toBe(18_240_000 - 6_410_000 - 2_633_000);
    expect(notInProfitLine(report)).toBe("Not in profit: big purchases ₱25,000 · owner took cash, deposits & loans ₱5,000. See Cash flow.");
    // Rent was paid last month but not yet this month.
    const rows = report.findings.map((finding) => findingRow(finding, findingPhrase(w.phrase, w.isPartial)));
    expect(rows[0]).toEqual({
      key: "missing:rent",
      tone: "warning",
      text: "No Rent (Upa) recorded this month yet. Profit looks higher than it is.",
      action: { kind: "record", label: "Record", categoryId: "rent" },
    });
    expect(rows.find((row) => row.key === "unsorted_payouts")?.action).toEqual({ kind: "sort", label: "Sort" });
    expect(result.trend?.map((bar) => bar.label)).toEqual(["Sep 28", "Oct 5", "Oct 12", "Oct 19"]);
    expect(result.trend?.[3].isIncomplete).toBe(true);
  });

  it("says who to ask when the database refuses profit", async () => {
    const { client } = fakeClient({ report_profit_summary: [{ data: null, error: { code: "42501", message: "Profit needs…" } }] });
    expect(await readProfit(client, w, { tenantId: "t1", branch: { outletId: null, unassigned: false } })).toEqual({
      status: "locked",
      message: PROFIT_LOCKED_MESSAGE,
    });
  });

  it("passes the functions' own range sentence through, and hides anything else", async () => {
    const invalid = await callProfit(fakeClient({ f: [{ data: null, error: { code: "22023", message: "The period is longer than 93 days." } }] }).client, "f", {}, () => 1);
    expect(invalid).toEqual({ ok: false, kind: "invalid", message: "The period is longer than 93 days." });
    const broken = await callProfit(fakeClient({ f: [{ data: null, error: { code: "XX000", message: "relation secret" } }] }).client, "f", {}, () => 1);
    expect(broken).toEqual({ ok: false, kind: "failed", message: PROFIT_FAILED_MESSAGE });
  });

  it("keeps the sentence when only the trend fails", () => {
    const composed = composeProfit(w, {
      summary: { ok: true, data: toProfitFigures([summaryRow]) },
      categories: { ok: true, data: toExpenseCategoryTotals(categoryRows) },
      previousCategories: null,
      periods: { ok: false, kind: "failed", message: PROFIT_FAILED_MESSAGE },
    });
    expect(composed.status).toBe("ready");
    expect(composed.status === "ready" && composed.trend).toBeNull();
  });

  it("is first-run until the first expense", () => {
    const composed = composeProfit(w, {
      summary: { ok: true, data: toProfitFigures([{ ...summaryRow, expense_count: 0 }]) },
      categories: { ok: true, data: [] },
      previousCategories: null,
      periods: null,
    });
    expect(composed.status === "ready" && composed.isFirstRun).toBe(true);
  });
});

describe("profit words", () => {
  const ready = composeProfit(resolveProfitWindow({ preset: "this_month" }, NOW), {
    summary: { ok: true, data: toProfitFigures([{ ...summaryRow, net_sales_cents: 5_000_000 }]) },
    categories: { ok: true, data: toExpenseCategoryTotals(categoryRows) },
    previousCategories: null,
    periods: null,
  });
  const report = ready.status === "ready" ? ready.report : null;

  it("calls a loss Lugi, with the word, never colour alone", () => {
    expect(report && profitVerdict(report)).toEqual({
      isLoss: true,
      text: "Lugi (loss) · −₱40,430 · 81% of sales",
      spoken: "Loss of ₱40,430",
    });
  });

  it("ranks where the money went, folding the tail into one bar", () => {
    const bars = report ? moneyBars(report, 2) : null;
    expect(bars?.bars.map((bar) => [bar.name, bar.cents])).toEqual([
      ["Salaries & wages", 1_480_000],
      ["Electricity", 482_000],
    ]);
    expect(bars?.restCents).toBe(375_000 + 296_000);
    expect(bars?.restCount).toBe(2);
  });

  it("writes money and ratios the way the web reports do", () => {
    expect(formatMoney(125_049)).toBe("₱1,250");
    expect(formatMoney(-320_000)).toBe("−₱3,200");
    expect(formatMoney(-40)).toBe("₱0");
    expect(formatRatio(0.438)).toBe("44%");
    expect(formatRatio(null)).toBe("—");
  });
});

describe("profit branch", () => {
  // Imported here so the suite above stays about the money.
  const { resolveProfitBranch, UNASSIGNED } = jest.requireActual<typeof import("./profit-branch")>("./profit-branch");
  const outlets = [
    { id: "o1", name: "Katipunan" },
    { id: "o2", name: "Maginhawa" },
  ];

  it("locks a branch account to its own branch, whatever was chosen", () => {
    expect(
      resolveProfitBranch({ account: { kind: "branch", outletId: "o2" }, accountOutletName: "Maginhawa", outlets, choice: "o1" }),
    ).toEqual({ branch: { outletId: "o2", unassigned: false }, canPick: false, label: "Maginhawa" });
  });

  it("offers branches only to a store-wide account in a multi-branch store", () => {
    const all = { kind: "all" as const };
    expect(resolveProfitBranch({ account: all, accountOutletName: null, outlets: [outlets[0]], choice: "o1" })).toEqual({
      branch: { outletId: null, unassigned: false },
      canPick: false,
      label: null,
    });
    expect(resolveProfitBranch({ account: all, accountOutletName: null, outlets, choice: "o1" }).branch).toEqual({ outletId: "o1", unassigned: false });
    expect(resolveProfitBranch({ account: all, accountOutletName: null, outlets, choice: UNASSIGNED }).branch).toEqual({ outletId: null, unassigned: true });
    expect(resolveProfitBranch({ account: all, accountOutletName: null, outlets, choice: "gone" }).label).toBe("All branches");
  });
});
