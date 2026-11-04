import {
  ITEM_SUMMARY_FAILED_MESSAGE,
  ITEM_SUMMARY_FORBIDDEN_MESSAGE,
  ITEM_SUMMARY_PAGE_SIZE,
  REPORT_MAX_WINDOW_DAYS,
  fetchItemSummary,
  itemSummaryBranchArgs,
  itemSummaryNotes,
  resolveItemSummaryAccess,
  splitReportWindow,
  type ItemSummaryRpcClient,
  type ItemSummaryRpcPage,
} from "./item-summary";

const DAY_MS = 24 * 60 * 60 * 1000;
const START = Date.parse("2026-11-01T16:00:00.000Z"); // Nov 2, Manila midnight
const TENANT = "d0b006a9-0000-4000-8000-000000000001";
const OUTLET = "0b8e3f1c-0000-4000-8000-000000000002";

interface Call {
  fn: string;
  args: Record<string, unknown>;
  page?: ItemSummaryRpcPage;
}

function summaryRow(overrides: Record<string, number> = {}) {
  return {
    orders: 3,
    gross_cents: 50000,
    discount_cents: 0,
    net_cents: 50000,
    orders_without_lines: 0,
    orders_lines_mismatch: 0,
    ...overrides,
  };
}

function itemRow(key: string, label: string, quantity: number, netCents: number, extra: Record<string, unknown> = {}) {
  return {
    item_key: key,
    menu_item_id: null,
    label,
    category_label: null,
    orders: 1,
    quantity,
    gross_cents: netCents,
    discount_cents: 0,
    net_cents: netCents,
    is_unrecorded: false,
    ...extra,
  };
}

type Reply = { data: unknown; error: { code?: string; message?: string } | null };

function fakeClient(answer: (call: Call) => Reply): { client: ItemSummaryRpcClient; calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    client: {
      rpc: (fn, args, page) => {
        const call = { fn, args, page };
        calls.push(call);
        return Promise.resolve(answer(call));
      },
    },
  };
}

const oneDay = { tenantId: TENANT, startMs: START, endMs: START + DAY_MS, outletId: null, isUnassigned: false };

describe("fetchItemSummary", () => {
  it("returns items sorted by net sales with the summary's net as the total", async () => {
    // Arrange
    const { client } = fakeClient(({ fn }) =>
      fn === "report_sales_summary"
        ? { data: [summaryRow({ net_cents: 50000 })], error: null }
        : {
            data: [itemRow("id:a", "Iced Latte", 3, 15000), itemRow("id:b", "Pork Sisig", 2, 35000)],
            error: null,
          },
    );

    // Act
    const result = await fetchItemSummary(oneDay, client);

    // Assert
    if (!result.ok) throw new Error(result.message);
    expect(result.summary.rows.map((row) => row.label)).toEqual(["Pork Sisig", "Iced Latte"]);
    expect(result.summary.netCents).toBe(50000);
    expect(result.summary.itemsNetCents).toBe(50000);
    expect(result.summary.quantity).toBe(5);
    expect(result.summary.orders).toBe(3);
  });

  it("reads with the caller's window and branch, leaving defaults out", async () => {
    const { client, calls } = fakeClient(({ fn }) =>
      fn === "report_sales_summary" ? { data: [summaryRow()], error: null } : { data: [], error: null },
    );

    await fetchItemSummary({ ...oneDay, outletId: OUTLET }, client);

    expect(calls[0].args).toEqual({
      p_tenant: TENANT,
      p_from: new Date(START).toISOString(),
      p_to: new Date(START + DAY_MS).toISOString(),
      p_outlet: OUTLET,
    });
    expect(calls.map((call) => call.fn).sort()).toEqual(["report_sales_by_item", "report_sales_summary"]);
  });

  it("asks for the unassigned orders with p_unassigned", async () => {
    const { client, calls } = fakeClient(({ fn }) =>
      fn === "report_sales_summary" ? { data: [summaryRow()], error: null } : { data: [], error: null },
    );

    await fetchItemSummary({ ...oneDay, isUnassigned: true }, client);

    expect(calls[0].args.p_unassigned).toBe(true);
    expect(calls[0].args).not.toHaveProperty("p_outlet");
  });

  it("maps a refused read (42501) to the permission message", async () => {
    const { client } = fakeClient(() => ({ data: null, error: { code: "42501", message: "Sales reports need the Reports permission." } }));

    const result = await fetchItemSummary(oneDay, client);

    expect(result).toEqual({ ok: false, kind: "forbidden", message: ITEM_SUMMARY_FORBIDDEN_MESSAGE });
  });

  it("passes the function's own range sentence through for 22023", async () => {
    const { client } = fakeClient(() => ({ data: null, error: { code: "22023", message: "A report covers at most 93 days." } }));

    const result = await fetchItemSummary(oneDay, client);

    expect(result).toEqual({ ok: false, kind: "invalid", message: "A report covers at most 93 days." });
  });

  it("says the database is not ready when the function is missing", async () => {
    const { client } = fakeClient(() => ({ data: null, error: { code: "PGRST202", message: "Could not find the function" } }));

    const result = await fetchItemSummary(oneDay, client);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("not_set_up");
  });

  it("fails rather than drawing ₱0 when a reply has the wrong shape", async () => {
    const { client } = fakeClient(({ fn }) =>
      fn === "report_sales_summary" ? { data: [{ orders: "lots" }], error: null } : { data: [], error: null },
    );

    const result = await fetchItemSummary(oneDay, client);

    expect(result).toEqual({ ok: false, kind: "failed", message: ITEM_SUMMARY_FAILED_MESSAGE });
  });

  it("fails on a network error", async () => {
    const client: ItemSummaryRpcClient = { rpc: () => Promise.reject(new Error("offline")) };

    const result = await fetchItemSummary(oneDay, client);

    expect(result).toEqual({ ok: false, kind: "failed", message: ITEM_SUMMARY_FAILED_MESSAGE });
  });

  it("refuses a window that ends before it starts without asking the server", async () => {
    const { client, calls } = fakeClient(() => ({ data: [], error: null }));

    const result = await fetchItemSummary({ ...oneDay, endMs: START }, client);

    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("pages past the API's 1000-row cap", async () => {
    // Arrange: 1,200 dishes, served 1,000 at a time like PostgREST max-rows.
    const all = Array.from({ length: 1200 }, (_, i) => itemRow(`id:${String(i).padStart(4, "0")}`, `Dish ${i}`, 1, 100));
    const { client, calls } = fakeClient(({ fn, page }) => {
      if (fn === "report_sales_summary") return { data: [summaryRow({ net_cents: 120000, orders: 1200 })], error: null };
      const from = page?.from ?? 0;
      const to = Math.min(page?.to ?? ITEM_SUMMARY_PAGE_SIZE - 1, from + ITEM_SUMMARY_PAGE_SIZE - 1);
      return { data: all.slice(from, to + 1), error: null };
    });

    // Act
    const result = await fetchItemSummary(oneDay, client);

    // Assert
    if (!result.ok) throw new Error(result.message);
    expect(result.summary.rows).toHaveLength(1200);
    expect(result.summary.itemsNetCents).toBe(120000);
    const pages = calls.filter((call) => call.fn === "report_sales_by_item").map((call) => call.page);
    expect(pages).toEqual([
      { from: 0, to: 999 },
      { from: 1000, to: 1999 },
    ]);
  });

  it("splits a range over 93 days and merges the items by key", async () => {
    // Arrange: 120 days → two windows; the same dish sold in both.
    const range = { ...oneDay, endMs: START + 120 * DAY_MS };
    const { client, calls } = fakeClient(({ fn, args }) => {
      const isFirst = args.p_from === new Date(START).toISOString();
      if (fn === "report_sales_summary") {
        return { data: [summaryRow(isFirst ? { orders: 2, net_cents: 30000 } : { orders: 1, net_cents: 12000, orders_without_lines: 1 })], error: null };
      }
      return {
        data: isFirst
          ? [itemRow("id:a", "Old name", 2, 30000, { orders: 2 })]
          : [itemRow("id:a", "Iced Latte", 1, 10000), itemRow("unrecorded", "Items not recorded", 0, 2000, { is_unrecorded: true })],
        error: null,
      };
    });

    // Act
    const result = await fetchItemSummary(range, client);

    // Assert
    if (!result.ok) throw new Error(result.message);
    const summaryCalls = calls.filter((call) => call.fn === "report_sales_summary");
    expect(summaryCalls.map((call) => [call.args.p_from, call.args.p_to])).toEqual([
      [new Date(START).toISOString(), new Date(START + 93 * DAY_MS).toISOString()],
      [new Date(START + 93 * DAY_MS).toISOString(), new Date(START + 120 * DAY_MS).toISOString()],
    ]);
    expect(result.summary.orders).toBe(3);
    expect(result.summary.netCents).toBe(42000);
    expect(result.summary.ordersWithoutLines).toBe(1);
    const latte = result.summary.rows.find((row) => row.key === "id:a");
    // The newest window names the dish, as the server names it within one window.
    expect(latte).toMatchObject({ label: "Iced Latte", quantity: 3, netCents: 40000, orders: 3 });
    expect(result.summary.itemsNetCents).toBe(result.summary.netCents);
  });

  it("stops at the first failing window", async () => {
    const range = { ...oneDay, endMs: START + 120 * DAY_MS };
    const { client } = fakeClient(({ args }) =>
      args.p_from === new Date(START).toISOString()
        ? { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } }
        : { data: [summaryRow()], error: null },
    );

    const result = await fetchItemSummary(range, client);

    expect(result).toEqual({ ok: false, kind: "failed", message: ITEM_SUMMARY_FAILED_MESSAGE });
  });

  it("keeps the stand-in row for orders saved without their dishes, last among equals", async () => {
    const { client } = fakeClient(({ fn }) =>
      fn === "report_sales_summary"
        ? { data: [summaryRow({ net_cents: 20000, orders_without_lines: 1 })], error: null }
        : {
            data: [
              itemRow("unrecorded", "Items not recorded", 0, 10000, { is_unrecorded: true }),
              itemRow("id:a", "Iced Latte", 2, 10000),
            ],
            error: null,
          },
      );

    const result = await fetchItemSummary(oneDay, client);

    if (!result.ok) throw new Error(result.message);
    expect(result.summary.rows.map((row) => row.key)).toEqual(["id:a", "unrecorded"]);
    expect(result.summary.rows[1].isUnrecorded).toBe(true);
  });
});

describe("splitReportWindow", () => {
  it("keeps a window of 93 days or less whole", () => {
    expect(splitReportWindow(START, START + REPORT_MAX_WINDOW_DAYS * DAY_MS)).toEqual([
      { startMs: START, endMs: START + 93 * DAY_MS },
    ]);
  });

  it("tiles a long window with no gap or overlap", () => {
    const windows = splitReportWindow(START, START + 366 * DAY_MS);

    expect(windows).toHaveLength(4);
    expect(windows[0].startMs).toBe(START);
    expect(windows[windows.length - 1].endMs).toBe(START + 366 * DAY_MS);
    windows.slice(1).forEach((window, index) => expect(window.startMs).toBe(windows[index].endMs));
    windows.forEach((window) => expect(window.endMs - window.startMs).toBeLessThanOrEqual(93 * DAY_MS));
  });

  it("has nothing to read for an empty or reversed window", () => {
    expect(splitReportWindow(START, START)).toEqual([]);
    expect(splitReportWindow(START, START - 1)).toEqual([]);
  });
});

describe("itemSummaryNotes", () => {
  const base = {
    orders: 10,
    netCents: 100000,
    itemsNetCents: 100000,
    quantity: 20,
    ordersWithoutLines: 0,
    ordersLinesMismatch: 0,
    rows: [],
  };

  it("says nothing when the dishes add up and every order has them", () => {
    expect(itemSummaryNotes(base)).toEqual([]);
  });

  it("names orders saved without their dishes", () => {
    expect(itemSummaryNotes({ ...base, ordersWithoutLines: 2 })).toEqual([
      "2 orders were saved without their dishes. Their sales are listed as “Items not recorded”, so the rows still add up to net sales.",
    ]);
    expect(itemSummaryNotes({ ...base, ordersWithoutLines: 1 })[0]).toMatch(/^1 order was saved/);
  });

  it("names edited orders whose dishes were scaled to the bill", () => {
    expect(itemSummaryNotes({ ...base, ordersLinesMismatch: 1 })).toEqual([
      "1 edited order had dish prices that no longer matched the bill. Its dishes were scaled to the bill, so items add up to net sales exactly.",
    ]);
  });

  it("says how far the dishes are from net sales when they do not add up", () => {
    expect(itemSummaryNotes({ ...base, itemsNetCents: 98000 })).toEqual([
      "The dishes add up to ₱980.00, ₱20.00 less than net sales.",
    ]);
  });
});

describe("itemSummaryBranchArgs", () => {
  it("maps the branch pills onto the report's branch arguments", () => {
    expect(itemSummaryBranchArgs(null)).toEqual({ outletId: null, isUnassigned: false });
    expect(itemSummaryBranchArgs(OUTLET)).toEqual({ outletId: OUTLET, isUnassigned: false });
    expect(itemSummaryBranchArgs("__unassigned__")).toEqual({ outletId: null, isUnassigned: true });
  });
});

describe("resolveItemSummaryAccess", () => {
  const owner = { role: "admin", isOwner: true, permissions: null };
  const cashier = { role: "staff", isOwner: false, permissions: ["orders", "pos"] };
  const reporter = { role: "staff", isOwner: false, permissions: ["orders", "reports"] };

  it("hides the summary entirely from an account without the reports key", () => {
    expect(resolveItemSummaryAccess({ holder: cashier, route: "platform", isDated: true })).toBe("hidden");
  });

  it("hides it on the live queue", () => {
    expect(resolveItemSummaryAccess({ holder: owner, route: "platform", isDated: false })).toBe("hidden");
  });

  it("offers it to the owner and to staff holding reports on a platform store", () => {
    expect(resolveItemSummaryAccess({ holder: owner, route: "platform", isDated: true })).toBe("available");
    expect(resolveItemSummaryAccess({ holder: reporter, route: "platform", isDated: true })).toBe("available");
    expect(resolveItemSummaryAccess({ holder: { ...cashier, permissions: ["analytics"] }, route: "platform", isDated: true })).toBe(
      "available",
    );
  });

  it("explains instead of reading on Convex and tenant-database stores", () => {
    expect(resolveItemSummaryAccess({ holder: owner, route: "convex", isDated: true })).toBe("unavailable");
    expect(resolveItemSummaryAccess({ holder: owner, route: "unsupported", isDated: true })).toBe("unavailable");
  });
});
