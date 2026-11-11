/**
 * The Sales screen over a realistic answer from `POST /api/reports/query`:
 * the cards the owner tracks, what changed, the trend, the lists, and the
 * two sheets. The data hook is stubbed; the numbers are the server's.
 */

import React from "react";
import { fireEvent, render as renderPlain, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

const METRICS_INSETS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const render = (ui: React.ReactElement) => renderPlain(<SafeAreaProvider initialMetrics={METRICS_INSETS}>{ui}</SafeAreaProvider>);

import type { MetricDef, ReportPayload } from "../../lib/sales-report/types";

const mockUseSalesReport = jest.fn();

jest.mock("../../lib/sales-report/use-sales-report", () => ({ useSalesReport: (query: unknown) => mockUseSalesReport(query) }));
jest.mock("../../lib/sales-report/card-prefs", () => ({
  readCardPrefs: jest.fn(async () => null),
  writeCardPrefs: jest.fn(async () => undefined),
}));
jest.mock("../../lib/business-day/use-trading-day", () => ({ useTradingDay: () => ({ schedule: [] }) }));
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("../../stores/auth-store", () => {
  const state = { tenantId: "tenant-1", impersonatedTenantId: null, userId: "user-1", role: "admin", isOwner: true, permissions: [] };
  return { useAuthStore: (select: (s: typeof state) => unknown) => select(state) };
});

import { SalesOverview } from "./SalesOverview";

const def = (id: MetricDef["id"], label: string, format: MetricDef["format"] = "money", extra: Partial<MetricDef> = {}): MetricDef => ({
  id,
  label,
  hint: `${label} hint`,
  definition: `${label} means something plain.`,
  format,
  aggregation: "sum",
  goodDirection: "up",
  permission: "reports",
  scopes: ["summary", "period", "breakdown"],
  ...extra,
});

const PAYLOAD: ReportPayload = {
  context: {
    period: { preset: "this_month", from: "2026-11-01", to: "2026-11-05", label: "This month", phrase: "this month", isPartial: true, grain: "day" },
    compare: { label: "last month", phrase: "on last month", kind: "previous_period" },
    compareTo: "previous",
    branch: null,
    branchOptions: null,
    lockedBranchLabel: null,
    isMultiBranch: false,
    presets: [],
    today: "2026-11-05",
    periodError: null,
    isScheduleFallback: false,
  },
  metrics: [
    def("net_sales", "Sales"),
    def("orders", "Orders", "count"),
    def("aov", "Average order"),
    def("avg_orders_per_day", "Orders per day", "decimal", { scopes: ["summary"] }),
    def("items_sold", "Items sold", "count"),
    def("money_received", "Money received"),
    def("still_to_collect", "Still to collect", "money", { goodDirection: "down", scopes: ["summary"] }),
    def("gross_margin_pct", "Gross margin", "percent", { permission: "costs", scopes: ["summary", "period"] }),
  ],
  sections: {
    summary: {
      ok: true,
      data: {
        days: 5,
        values: { net_sales: 4_821_000, orders: 193, aov: 24_979, avg_orders_per_day: 38.6, items_sold: 412, still_to_collect: 111_000 },
        previous: { net_sales: 4_207_000, orders: 175, aov: 24_040, avg_orders_per_day: 35, items_sold: 380 },
      },
    },
    profit: { ok: true, data: { values: { gross_margin_pct: 0.61 }, previous: { gross_margin_pct: 0.63 }, ingredientBasis: "recipes", findings: [] } },
    periods: {
      ok: true,
      data: {
        grain: "day",
        rows: ["Nov 1", "Nov 2", "Nov 3", "Nov 4", "Nov 5"].map((label, index) => ({
          key: `2026-11-0${index + 1}`,
          label,
          values: { net_sales: 900_000 + index * 10_000, orders: 38 },
          previous: { net_sales: 800_000, orders: 35 },
        })),
      },
    },
    items: {
      ok: true,
      data: {
        rows: [
          { key: "a", label: "Iced Spanish Latte", values: { net_sales: 840_000, items_sold: 96 }, previous: { net_sales: 610_000 } },
          { key: "b", label: "Tapsilog", values: { net_sales: 520_000, items_sold: 52 }, previous: { net_sales: 560_000 } },
        ],
      },
    },
    order_types: { ok: true, data: { rows: [{ key: "Dine In", label: "Dine In", values: { net_sales: 2_600_000 } }] } },
    payments: { ok: true, data: { rows: [{ key: "id:cash", label: "Cash", values: { money_received: 2_300_000 } }] } },
  },
};

function ready() {
  mockUseSalesReport.mockReturnValue({ data: { ok: true, payload: PAYLOAD }, isLoading: false, error: null, refetch: jest.fn(), isRefetching: false, dataUpdatedAt: 1 });
}

beforeEach(() => mockUseSalesReport.mockReset());

describe("SalesOverview", () => {
  it("asks for this month, compared with before, with profit for a cost holder", () => {
    ready();
    render(<SalesOverview />);
    expect(mockUseSalesReport).toHaveBeenLastCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        period: { preset: "this_month" },
        compare: "previous",
        sections: ["summary", "periods", "items", "order_types", "payments", "profit"],
      }),
    );
  });

  it("shows the tracked figures with their change, and what changed", () => {
    ready();
    render(<SalesOverview />);
    expect(screen.getByText("₱48,210")).toBeTruthy();
    expect(screen.getByText("61.0%")).toBeTruthy();
    expect(screen.getAllByText(/▲ ₱6,140 \(\+15%\)/).length).toBeGreaterThan(0);
    expect(screen.getByText("Sales are up ₱6,140 (+15%) on last month.")).toBeTruthy();
    expect(screen.getByText("Iced Spanish Latte brought in ₱2,300 more than before.")).toBeTruthy();
    expect(screen.getByText("₱1,110 is still to collect.")).toBeTruthy();
    expect(screen.getByText("96 sold")).toBeTruthy();
  });

  it("explains a figure in plain words when tapped", () => {
    ready();
    render(<SalesOverview />);
    fireEvent.press(screen.getByLabelText(/^Orders, 193/));
    expect(screen.getByText("Orders means something plain.")).toBeTruthy();
  });

  it("switching the period asks again for that period", () => {
    ready();
    render(<SalesOverview />);
    fireEvent.press(screen.getByLabelText("Period This year"));
    expect(mockUseSalesReport).toHaveBeenLastCalledWith(expect.objectContaining({ period: { preset: "this_year" } }));
    fireEvent.press(screen.getByLabelText("Compare vs last year"));
    expect(mockUseSalesReport).toHaveBeenLastCalledWith(expect.objectContaining({ compare: "last_year" }));
  });

  it("a refusal says so instead of showing zeros", () => {
    mockUseSalesReport.mockReturnValue({
      data: { ok: false, reason: "forbidden", message: "You need the Reports permission to see this. Ask the store owner." },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      isRefetching: false,
      dataUpdatedAt: 1,
    });
    render(<SalesOverview />);
    expect(screen.getByText("You need the Reports permission to see this. Ask the store owner.")).toBeTruthy();
    expect(screen.queryByText("₱0")).toBeNull();
  });
});
