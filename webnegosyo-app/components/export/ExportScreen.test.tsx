import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import ExportScreen from "../../app/(main)/export";
import { downloadServerExport } from "../../lib/export/server-export";
import { fetchExportPreview, parseCatalogue } from "../../lib/export/server-export-api";

const TENANT = "72a2d4c2-a1b7-4afe-a2a2-04ab74c094d2";

let mockParams: Record<string, string> = {};
let mockAccount = { tenantId: TENANT, impersonatedTenantId: null, isDemo: false, orderBackend: "platform" as string | null };
let mockCaller: { role: string; isOwner: boolean; permissions: string[] | null } = { role: "admin", isOwner: true, permissions: null };
const mockUseResource = jest.fn();

jest.mock("expo-router", () => ({ useLocalSearchParams: () => mockParams, router: { back: jest.fn(), push: jest.fn() } }));
jest.mock("../../stores/auth-store", () => ({ useAuthStore: (select: (state: unknown) => unknown) => select(mockAccount) }));
jest.mock("../../lib/use-tab-visibility-context", () => ({ useTabVisibilityContext: () => ({ caller: mockCaller }) }));
jest.mock("../../lib/query/use-resource", () => ({ useResource: (...args: unknown[]) => mockUseResource(...args) }));
jest.mock("../../lib/use-screen-top-inset", () => ({ useScreenTopInset: () => 0 }));
jest.mock("./ExportDayPicker", () => ({ ExportDayPicker: () => null }));
jest.mock("../../lib/export/server-export", () => ({ downloadServerExport: jest.fn() }));
jest.mock("../../lib/export/server-export-api", () => ({
  ...jest.requireActual("../../lib/export/server-export-api"),
  fetchExportCatalogue: jest.fn(),
  fetchExportPreview: jest.fn(),
  exportToken: jest.fn(async () => "tok"),
}));
jest.mock("../../lib/authorized-post", () => ({ getAccessTokenBounded: jest.fn() }));
jest.mock("../../lib/web-app-url", () => ({ getWebAppUrl: () => "https://web.example" }));

const card = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, name, rowIs: `one ${name.toLowerCase()}`, columns: ["A", "B"], isDetail: false, lockedNote: null, ...extra });
const CATALOGUE = parseCatalogue({
  catalogue: {
    groups: [
      { id: "sales", label: "Sales", cards: [card("summary", "Summary"), card("items", "Items sold")] },
      { id: "orders", label: "Orders", cards: [card("orders", "Orders", { isDetail: true }), card("order_lines", "Order lines", { isDetail: true })] },
      { id: "books", label: "Expenses and profit", cards: [card("expenses", "Expenses", { lockedNote: "Not on your account: needs Expenses." })] },
    ],
    packs: [{ id: "everything", label: "Everything that happened", about: "All of it.", sheets: ["summary", "items", "orders", "order_lines"] }],
    defaults: ["summary", "orders"],
    maxDetailDays: 93,
    today: "2026-11-14",
    branchLabel: null,
    isMixedBackend: false,
  },
});

const hidden = { includeHiddenElements: true } as const;
const isTicked = (id: string) => screen.getByTestId(`export-sheet-${id}`, hidden).props.accessibilityState.checked;

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockAccount = { tenantId: TENANT, impersonatedTenantId: null, isDemo: false, orderBackend: "platform" };
  mockCaller = { role: "admin", isOwner: true, permissions: null };
  mockUseResource.mockReturnValue({ data: CATALOGUE, isLoading: false, error: null, refetch: jest.fn() });
});

it("opens with the screen's own start, and downloads exactly what is ticked", async () => {
  (downloadServerExport as jest.Mock).mockResolvedValue("shop-export-2026-11-14.xlsx");
  render(<ExportScreen />);
  expect(isTicked("summary")).toBe(true);
  expect(isTicked("orders")).toBe(true);
  expect(isTicked("items")).toBe(false);
  // A sheet the account may not have cannot be ticked.
  fireEvent.press(screen.getByTestId("export-sheet-expenses", hidden));
  expect(isTicked("expenses")).toBe(false);

  fireEvent.press(screen.getByTestId("export-sheet-items", hidden));
  fireEvent.press(screen.getByTestId("export-download-xlsx", hidden));
  await waitFor(() => expect(downloadServerExport).toHaveBeenCalledTimes(1));
  expect((downloadServerExport as jest.Mock).mock.calls[0][0]).toBe(`/api/exports?tenantId=${TENANT}&sheets=summary,items,orders&period=today&format=xlsx&source=page`);
  expect(await screen.findByText("shop-export-2026-11-14.xlsx is ready.", hidden)).toBeTruthy();
});

it("arrives from a report's Export button with that report's sheets and days", async () => {
  mockParams = { sheets: "orders,order_lines", period: "", from: "2026-11-01", to: "2026-11-07", days: "" };
  (downloadServerExport as jest.Mock).mockResolvedValue("x.zip");
  render(<ExportScreen />);
  expect(["summary", "items", "orders", "order_lines"].map(isTicked)).toEqual([false, false, true, true]);
  fireEvent.press(screen.getByTestId("export-download-csv", hidden));
  await waitFor(() => expect(downloadServerExport).toHaveBeenCalledTimes(1));
  expect((downloadServerExport as jest.Mock).mock.calls[0][0]).toBe(
    `/api/exports?tenantId=${TENANT}&sheets=orders,order_lines&period=custom&from=2026-11-01&to=2026-11-07&format=csv&source=page`,
  );
});

it("shows what is inside before downloading, and drops the check once the choice changes", async () => {
  (fetchExportPreview as jest.Mock).mockResolvedValue({
    periodLabel: "Nov 14, 2026",
    branchLabel: "Whole store",
    sheets: [{ id: "orders", name: "Orders", rowIs: "one order", columns: ["Order no."], rows: 44, notes: ["Cancelled orders are listed too."] }],
    leftOut: [{ name: "Shifts", note: "No shifts in these dates." }],
  });
  render(<ExportScreen />);
  fireEvent.press(screen.getByTestId("export-check", hidden));
  expect(await screen.findByText("44 rows", hidden)).toBeTruthy();
  expect(screen.getByText("Shifts is left out", hidden)).toBeTruthy();
  expect(fetchExportPreview).toHaveBeenCalledWith({ tenantId: TENANT, sheets: ["summary", "orders"], period: { preset: "today" } });
  expect(downloadServerExport).not.toHaveBeenCalled();

  fireEvent.press(screen.getByTestId("export-sheet-summary", hidden));
  expect(screen.queryByText("44 rows", hidden)).toBeNull();
  expect(screen.getByTestId("export-check", hidden)).toBeTruthy();
});

it("will not download nothing, and says the server's own sentence when a file is refused", async () => {
  (downloadServerExport as jest.Mock).mockRejectedValue(new Error("Orders lists every row, so one file covers up to 93 days."));
  render(<ExportScreen />);
  fireEvent.press(screen.getByTestId("export-sheet-summary", hidden));
  fireEvent.press(screen.getByTestId("export-sheet-orders", hidden));
  expect(screen.getByText("Tick at least one thing to include.", hidden)).toBeTruthy();
  fireEvent.press(screen.getByTestId("export-download-xlsx", hidden));
  expect(downloadServerExport).not.toHaveBeenCalled();

  fireEvent.press(screen.getByTestId("export-sheet-orders", hidden));
  fireEvent.press(screen.getByTestId("export-download-xlsx", hidden));
  expect(await screen.findByText("Orders lists every row, so one file covers up to 93 days.", hidden)).toBeTruthy();
});

it("stays shut for an account without Reports, a store on another order system, and the demo", () => {
  const shut = () => {
    const view = render(<ExportScreen />);
    // No catalogue is asked for: the read is disabled with a null key.
    expect(mockUseResource.mock.calls.at(-1)?.[0]).toBeNull();
    expect(screen.queryByTestId("export-download-xlsx", hidden)).toBeNull();
    view.unmount();
  };
  mockCaller = { role: "admin", isOwner: false, permissions: ["pos", "orders"] };
  shut();
  expect(mockUseResource).toHaveBeenCalled();
  mockCaller = { role: "admin", isOwner: true, permissions: null };
  mockAccount = { ...mockAccount, orderBackend: "convex" };
  shut();
  mockAccount = { ...mockAccount, orderBackend: "platform", isDemo: true };
  shut();
});

describe("My formats", () => {
  const F1 = "bbbbbbbb-0000-4000-8000-000000000001";
  const F2 = "bbbbbbbb-0000-4000-8000-000000000002";
  const withFormats = (formats: unknown[]) => ({ ...CATALOGUE, formats: parseCatalogue({ catalogue: { groups: [], packs: [], defaults: [], today: "2026-11-14", formats } })?.formats ?? [] });
  const saved = (extra: Record<string, unknown> = {}) => ({ id: F1, name: "Weekly owner report", kind: "custom", summary: "Sales by day · Day, Avg ticket", savedBy: "Ana", sheets: ["sales_by_day"], isDetail: false, lockedNote: null, ...extra });

  it("is not shown when the store has saved none", () => {
    render(<ExportScreen />);
    expect(screen.queryByText("My formats", hidden)).toBeNull();
  });

  it("makes a saved format for the dates picked, named by its id", async () => {
    (downloadServerExport as jest.Mock).mockResolvedValue("shop-average-order-per-day-2026-11-14.xlsx");
    mockUseResource.mockReturnValue({ data: withFormats([saved()]), isLoading: false, error: null, refetch: jest.fn() });
    render(<ExportScreen />);
    expect(screen.getByText("Weekly owner report", hidden)).toBeTruthy();
    expect(screen.getByText("Saved by Ana", hidden)).toBeTruthy();
    fireEvent.press(screen.getByTestId(`export-format-${F1}-xlsx`, hidden));
    await waitFor(() => expect(downloadServerExport).toHaveBeenCalledTimes(1));
    expect((downloadServerExport as jest.Mock).mock.calls[0][0]).toBe(`/api/exports?tenantId=${TENANT}&sheets=sales_by_day&period=today&format=xlsx&source=page&template=${F1}`);
    expect(await screen.findByText("shop-average-order-per-day-2026-11-14.xlsx is ready.", hidden)).toBeTruthy();
  });

  it("offers no download for a format this account cannot run, and says why", () => {
    mockUseResource.mockReturnValue({
      data: withFormats([saved({ id: F2, name: "Costs", lockedNote: "Not on your account: it uses a column your account does not have access to." })]),
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });
    render(<ExportScreen />);
    expect(screen.getByText("Not on your account: it uses a column your account does not have access to.", hidden)).toBeTruthy();
    expect(screen.queryByTestId(`export-format-${F2}-xlsx`, hidden)).toBeNull();
  });
});
