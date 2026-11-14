import { readFileSync } from "fs";
import { join } from "path";

import { isServerExportPath } from "./server-export";
import {
  activePackId,
  exportDownloadPath,
  exportPeriod,
  exportPeriodProblem,
  exportStartChoice,
  fetchExportCatalogue,
  fetchExportPreview,
  openCards,
  parseCatalogue,
  parsePreview,
  previewRowsText,
  toggleSheet,
  type ExportCatalogue,
} from "./server-export-api";
import { EXPORT_ROUTE, SCREEN_EXPORT_SHEETS, canOpenExport, exportHref } from "./export-routes";
import { orderExportStart } from "../orders-history";

jest.mock("../web-app-url", () => ({ getWebAppUrl: () => "https://web.example" }));
const mockToken = jest.fn();
jest.mock("../authorized-post", () => ({ getAccessTokenBounded: (...args: unknown[]) => mockToken(...args) }));

const TENANT = "72a2d4c2-a1b7-4afe-a2a2-04ab74c094d2";

const card = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: id.toUpperCase(), rowIs: "one thing", columns: ["A", "B"], isDetail: false, lockedNote: null, ...extra });

const SERVER_CATALOGUE = {
  success: true,
  catalogue: {
    groups: [
      { id: "sales", label: "Sales", cards: [card("summary"), card("items")] },
      { id: "orders", label: "Orders", cards: [card("orders", { isDetail: true })] },
      { id: "books", label: "Books", cards: [card("expenses", { lockedNote: "Not on your account: needs Expenses." })] },
      { id: "empty", label: "Empty", cards: [] },
    ],
    packs: [
      { id: "everything", label: "Everything that happened", about: "All of it.", sheets: ["summary", "items", "orders"] },
      { id: "books", label: "Books", about: "Locked.", sheets: ["expenses"] },
    ],
    defaults: ["summary", "orders", "expenses", "made_up"],
    maxDetailDays: 93,
    today: "2026-11-14",
    branchLabel: null,
    isMixedBackend: false,
  },
};

const catalogue = parseCatalogue(SERVER_CATALOGUE) as ExportCatalogue;

describe("the catalogue the server sends", () => {
  it("keeps what this account may pick and never offers a locked or unknown sheet", () => {
    expect(catalogue.groups.map((group) => group.id)).toEqual(["sales", "orders", "books"]);
    expect(openCards(catalogue).map((entry) => entry.id)).toEqual(["summary", "items", "orders"]);
    expect(catalogue.defaults).toEqual(["summary", "orders"]);
    // A ready-made set made only of locked sheets is not offered.
    expect(catalogue.packs.map((pack) => pack.id)).toEqual(["everything"]);
  });

  it("refuses an answer that is not a catalogue", () => {
    expect(parseCatalogue(null)).toBeNull();
    expect(parseCatalogue({ success: true })).toBeNull();
    expect(parseCatalogue({ catalogue: { groups: [], today: "soon" } })).toBeNull();
  });
});

describe("choosing", () => {
  it("ticks in the catalogue's order and cannot tick a locked sheet", () => {
    expect(toggleSheet(["orders"], "summary", catalogue)).toEqual(["summary", "orders"]);
    expect(toggleSheet(["summary", "orders"], "summary", catalogue)).toEqual(["orders"]);
    expect(toggleSheet(["orders"], "expenses", catalogue)).toEqual(["orders"]);
  });

  it("names the ready-made set only while its sheets are exactly the ticked ones", () => {
    expect(activePackId(["orders", "summary", "items"], catalogue.packs)).toBe("everything");
    expect(activePackId(["orders"], catalogue.packs)).toBeNull();
  });

  it("checks a custom range before anything is asked of the server", () => {
    const picked = openCards(catalogue);
    const summaryOnly = picked.filter((entry) => !entry.isDetail);
    expect(exportPeriodProblem(exportPeriod("today", "x", "y"), picked, catalogue)).toBeNull();
    expect(exportPeriodProblem(exportPeriod("custom", "2026-11-10", "2026-11-01"), picked, catalogue)).toMatch(/after the end day/);
    expect(exportPeriodProblem(exportPeriod("custom", "2026-11-10", "2026-11-15"), picked, catalogue)).toMatch(/future/);
    expect(exportPeriodProblem(exportPeriod("custom", "2026-08-13", "2026-11-14"), picked, catalogue)).toMatch(/up to 93 days. You picked 94/);
    expect(exportPeriodProblem(exportPeriod("custom", "2026-08-14", "2026-11-14"), picked, catalogue)).toBeNull();
    // Totals-only files may go longer; the server holds their own limit.
    expect(exportPeriodProblem(exportPeriod("custom", "2026-01-01", "2026-11-14"), summaryOnly, catalogue)).toBeNull();
  });

  it("says how many rows, or that the file will count them", () => {
    expect(previewRowsText(1)).toBe("1 row");
    expect(previewRowsText(1250)).toBe("1,250 rows");
    expect(previewRowsText(null)).toBe("counted in the file");
  });
});

describe("the download link", () => {
  it("is the web Export page's own link, and one the downloader accepts", () => {
    const path = exportDownloadPath({ tenantId: TENANT, sheets: ["summary", "orders"], period: exportPeriod("custom", "2026-11-01", "2026-11-14") }, "csv");
    expect(path).toBe(`/api/exports?tenantId=${TENANT}&sheets=summary,orders&period=custom&from=2026-11-01&to=2026-11-14&format=csv&source=page`);
    expect(isServerExportPath(path)).toBe(true);
    expect(exportDownloadPath({ tenantId: TENANT, sheets: ["items"], period: exportPeriod("last_month", "2026-11-01", "2026-11-14") }, "xlsx")).toBe(
      `/api/exports?tenantId=${TENANT}&sheets=items&period=last_month&format=xlsx&source=page`,
    );
  });

  it("matches what the server's link builder writes", () => {
    // The server's exportHref (src/lib/exports/request-schema.ts) is the contract: same keys, same order of meaning.
    const server = readFileSync(join(__dirname, "..", "..", "..", "src", "lib", "exports", "request-schema.ts"), "utf8");
    for (const key of ["tenantId", "sheets", "period", "from", "to", "format", "source"]) expect(server).toMatch(new RegExp(`\\b${key}: z\\.`));
    expect(server).toMatch(/mode: z\.enum\(\['preview', 'file', 'catalogue'\]\)/);
  });
});

describe("talking to the server", () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    jest.clearAllMocks();
    mockToken.mockResolvedValue("tok");
    (globalThis as { fetch: unknown }).fetch = fetchMock;
  });

  const answer = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

  it("asks for the catalogue as this account and reads no order", async () => {
    fetchMock.mockResolvedValue(answer(200, SERVER_CATALOGUE));
    const result = await fetchExportCatalogue(TENANT);
    expect(result.today).toBe("2026-11-14");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://web.example/api/exports");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body)).toEqual({ tenantId: TENANT, mode: "catalogue", sheets: ["summary"], period: { preset: "today" } });
  });

  it("asks for a preview of exactly the choice", async () => {
    fetchMock.mockResolvedValue(
      answer(200, {
        success: true,
        preview: {
          header: { periodLabel: "2026-11-14", branchLabel: "All branches" },
          sheets: [{ id: "orders", name: "Orders", rowIs: "one order", columns: ["Order"], rows: 12, notes: ["A note."], peek: [["secret row"]] }],
          leftOut: [{ id: "expenses", name: "Expenses", note: "Needs the Expenses permission." }],
        },
      }),
    );
    const preview = await fetchExportPreview({ tenantId: TENANT, sheets: ["orders", "expenses"], period: exportPeriod("today", "a", "b") });
    expect(preview).toEqual({
      periodLabel: "2026-11-14",
      branchLabel: "All branches",
      sheets: [{ id: "orders", name: "Orders", rowIs: "one order", columns: ["Order"], rows: 12, notes: ["A note."] }],
      leftOut: [{ name: "Expenses", note: "Needs the Expenses permission." }],
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ tenantId: TENANT, mode: "preview", sheets: ["orders", "expenses"], period: { preset: "today" } });
    expect(parsePreview({ preview: {} })).toBeNull();
  });

  it("passes the server's own sentence on, and never calls out when signed out", async () => {
    fetchMock.mockResolvedValue(answer(403, { success: false, error: "You need the Reports permission to export. Ask the store owner." }));
    await expect(fetchExportCatalogue(TENANT)).rejects.toThrow("You need the Reports permission to export. Ask the store owner.");
    fetchMock.mockResolvedValue(answer(429, {}));
    await expect(fetchExportCatalogue(TENANT)).rejects.toThrow(/Give it a minute/);
    fetchMock.mockRejectedValue(new Error("Network request failed"));
    await expect(fetchExportCatalogue(TENANT)).rejects.toThrow(/Could not reach the server/);
    fetchMock.mockClear();
    mockToken.mockResolvedValue(null);
    await expect(fetchExportCatalogue(TENANT)).rejects.toThrow("Please sign in again.");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("the Export screen and its door", () => {
  const read = (...parts: string[]) => readFileSync(join(__dirname, "..", "..", ...parts), "utf8");
  const owner = { role: "admin", isOwner: true, permissions: null };
  const cashier = { role: "admin", isOwner: false, permissions: ["pos", "orders"] };
  const analyst = { role: "admin", isOwner: false, permissions: ["reports"] };

  it("opens for a real account with Reports on a main-database store, and nobody else", () => {
    expect(canOpenExport({ caller: owner, isDemo: false, orderBackend: "platform" })).toBe(true);
    expect(canOpenExport({ caller: analyst, isDemo: false, orderBackend: "platform" })).toBe(true);
    expect(canOpenExport({ caller: cashier, isDemo: false, orderBackend: "platform" })).toBe(false);
    expect(canOpenExport({ caller: owner, isDemo: true, orderBackend: "platform" })).toBe(false);
    expect(canOpenExport({ caller: owner, isDemo: false, orderBackend: "convex" })).toBe(false);
    expect(canOpenExport({ caller: owner, isDemo: false, orderBackend: null })).toBe(false);
  });

  it("is a utility screen reached from Reports, gated by the same rule on both sides", () => {
    expect(EXPORT_ROUTE).toBe("/(main)/export");
    expect(read("app", "(main)", "_layout.tsx")).toMatch(/name="export" options=\{\{ href: null/);
    const reports = read("app", "(main)", "reports.tsx");
    expect(reports).toMatch(/canOpenExport\(\{ caller: ctx\.caller, isDemo, orderBackend \}\)/);
    expect(reports).toMatch(/router\.push\(exportHref\(\)/);
    const screen = read("app", "(main)", "export.tsx");
    expect(screen).toMatch(/canOpenExport\(\{ caller: ctx\.caller, isDemo, orderBackend \}\)/);
    // The file is the server's: the screen builds no CSV of its own and reads no order.
    expect(screen).toMatch(/downloadServerExport\(exportDownloadPath\(/);
    expect(screen).not.toMatch(/supabase|buildCsv|convex/i);
  });
});

describe("a report screen's Export button", () => {
  const read = (...parts: string[]) => readFileSync(join(__dirname, "..", "..", ...parts), "utf8");
  /** The link's query as the screen receives it. */
  const paramsOf = (href: string) => Object.fromEntries(new URLSearchParams(href.split("?")[1]));

  it("writes every parameter every time, so the last door's dates never linger on a mounted screen", () => {
    expect(exportHref()).toBe("/(main)/export?sheets=&period=&from=&to=&days=");
    expect(exportHref(["orders", "order_lines"], { from: "2026-11-01", to: "2026-11-07" })).toBe("/(main)/export?sheets=orders,order_lines&period=&from=2026-11-01&to=2026-11-07&days=");
    expect(exportHref(["profit"], { preset: "last_month" })).toBe("/(main)/export?sheets=profit&period=last_month&from=&to=&days=");
    expect(exportHref(["items"], { days: 30 })).toBe("/(main)/export?sheets=items&period=&from=&to=&days=30");
  });

  it("opens with that report's sheets and dates", () => {
    expect(exportStartChoice(paramsOf(exportHref(["orders", "items"], { from: "2026-11-01", to: "2026-11-07" })), catalogue)).toEqual({
      preset: "custom",
      from: "2026-11-01",
      to: "2026-11-07",
      // The catalogue's order, not the link's.
      picked: ["items", "orders"],
    });
    expect(exportStartChoice(paramsOf(exportHref(["items"], { preset: "last_month" })), catalogue)).toMatchObject({ preset: "last_month", picked: ["items"] });
    // "Last 30 days" counts today: Oct 16 to Nov 14.
    expect(exportStartChoice(paramsOf(exportHref(["items"], { days: 30 })), catalogue)).toMatchObject({ preset: "custom", from: "2026-10-16", to: "2026-11-14" });
    expect(exportStartChoice(paramsOf(exportHref(["items"], { days: 1 })), catalogue)).toMatchObject({ preset: "today" });
    // A week still running ends after today: the file stops at today.
    expect(exportStartChoice(paramsOf(exportHref(["items"], { from: "2026-11-09", to: "2026-11-15" })), catalogue)).toMatchObject({ preset: "custom", from: "2026-11-09", to: "2026-11-14" });
  });

  it("falls back to the screen's own start for anything it cannot use", () => {
    const plain = { preset: "today", from: "2026-11-14", to: "2026-11-14", picked: ["summary", "orders"] };
    expect(exportStartChoice({}, catalogue)).toEqual(plain);
    expect(exportStartChoice(paramsOf(exportHref()), catalogue)).toEqual(plain);
    // Locked and unknown sheets are never ticked; with none left, the defaults are.
    expect(exportStartChoice({ sheets: "expenses,made_up" }, catalogue)).toEqual(plain);
    expect(exportStartChoice({ sheets: ["items,expenses"], period: "custom", from: "2026-11-20", to: "2026-11-25", days: "0" }, catalogue)).toEqual({ ...plain, picked: ["items"] });
    expect(exportStartChoice({ period: "last_12_months", from: "nope", to: "2026-11-14", days: "9999" }, catalogue)).toEqual(plain);
  });

  it("carries the Orders tab's picked days", () => {
    expect(orderExportStart(null)).toBeUndefined();
    expect(orderExportStart({ kind: "day", dayKey: "2026-11-04" })).toEqual({ from: "2026-11-04", to: "2026-11-04" });
    expect(orderExportStart({ kind: "range", fromKey: "2026-10-29", toKey: "2026-11-04" })).toEqual({ from: "2026-10-29", to: "2026-11-04" });
    expect(orderExportStart({ kind: "preset", days: 7 })).toEqual({ days: 7 });
  });

  it("only names sheets the server's catalogue holds", () => {
    const serverCatalogue = readFileSync(join(__dirname, "..", "..", "..", "src", "lib", "exports", "catalogue.ts"), "utf8");
    for (const id of Object.values(SCREEN_EXPORT_SHEETS).flat()) expect(serverCatalogue).toMatch(new RegExp(`\\b${id}\\b`));
  });

  it("replaces the file built on the phone wherever the account has the Export screen", () => {
    // Orders and Sales: the old sheet opens only when there is no server export for this account.
    for (const screen of ["orders.tsx", "product-analytics.tsx"]) {
      const source = read("app", "(main)", screen);
      expect(source).toMatch(/const hasServerExport = useCanOpenExport\(\);/);
      expect(source).toMatch(/if \(hasServerExport\) \{\s+router\.push\(exportHref\(SCREEN_EXPORT_SHEETS\.(orders|sales)[^\n]+\n\s+return;\s+\}\s+setExportError\(null\);\s+setExportOpen\(true\);/);
    }
    // Profit, Stock and Remittances gained the button; it draws nothing without the Export screen.
    for (const [screen, key] of [["profit.tsx", "profit"], ["inventory.tsx", "stock"], ["remittances.tsx", "cash"]] as const) {
      expect(read("app", "(main)", screen)).toMatch(new RegExp(`<ExportDoorButton\\s+sheets=\\{SCREEN_EXPORT_SHEETS\\.${key}\\}`));
    }
    expect(read("components", "export", "ExportDoorButton.tsx")).toMatch(/if \(!canOpen\) return null;/);
  });
});
