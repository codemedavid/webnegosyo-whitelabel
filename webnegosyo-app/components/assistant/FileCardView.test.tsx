import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { FileCardView } from "./FileCardView";
import { downloadServerExport } from "../../lib/export/server-export";
import { saveExportFormat } from "../../lib/export/server-export-api";
import type { FileCard } from "../../lib/assistant/types";

jest.mock("../../lib/assistant/api", () => ({ assistantToken: jest.fn(async () => "tok") }));
jest.mock("../../lib/export/server-export", () => ({
  ...jest.requireActual("../../lib/export/server-export"),
  downloadServerExport: jest.fn(),
}));
jest.mock("../../lib/authorized-post", () => ({ getAccessTokenBounded: jest.fn(async () => "tok") }));
jest.mock("../../lib/export/server-export-api", () => ({
  ...jest.requireActual("../../lib/export/server-export-api"),
  saveExportFormat: jest.fn(),
}));
jest.mock("../../lib/web-app-url", () => ({ getWebAppUrl: () => "https://web.example" }));

const TENANT = "72a2d4c2-a1b7-4afe-a2a2-04ab74c094d2";
const spec = { title: "Average order per day", sheet: "sales_by_day", columns: [{ id: "day" }, { id: "aov" }] };
const card: FileCard = {
  type: "file",
  title: "Average order per day",
  subtitle: "2026-11-02 to 2026-11-08 · Whole store",
  sheets: [{ name: "Average order per day", rows: 6 }],
  notes: [],
  downloads: [{ label: "Download Excel", href: `/api/exports?tenantId=${TENANT}&sheets=sales_by_day&period=today&format=xlsx&source=owl` }],
};
const hidden = { includeHiddenElements: true } as const;

beforeEach(() => jest.clearAllMocks());

it("offers Save to My formats only on a card that carries a report to keep", () => {
  const view = render(<FileCardView card={card} />);
  expect(screen.queryByLabelText("Save to My formats", hidden)).toBeNull();
  view.rerender(<FileCardView card={{ ...card, save: { tenantId: TENANT, name: "Average order per day", spec } }} />);
  expect(screen.getByLabelText("Save to My formats", hidden)).toBeTruthy();
  // A card from stored history with a broken save part offers nothing.
  view.rerender(<FileCardView card={{ ...card, save: { tenantId: TENANT, name: "x", spec: null } }} />);
  expect(screen.queryByLabelText("Save to My formats", hidden)).toBeNull();
});

it("saves what the card carried, once, and says where it went", async () => {
  (saveExportFormat as jest.Mock).mockResolvedValue(undefined);
  render(<FileCardView card={{ ...card, save: { tenantId: TENANT, name: "Average order per day", spec } }} />);
  fireEvent.press(screen.getByLabelText("Save to My formats", hidden));
  expect(await screen.findByText("Saved as “Average order per day”. Find it under My formats in Export.", hidden)).toBeTruthy();
  expect(saveExportFormat).toHaveBeenCalledTimes(1);
  expect(saveExportFormat).toHaveBeenCalledWith({ tenantId: TENANT, name: "Average order per day", spec });
  expect(screen.queryByLabelText("Save to My formats", hidden)).toBeNull();
});

it("shows the server's sentence when the save is refused, and can be tried again", async () => {
  (saveExportFormat as jest.Mock).mockRejectedValue(new Error("You already have a format called “Average order per day”."));
  render(<FileCardView card={{ ...card, save: { tenantId: TENANT, name: "Average order per day", spec } }} />);
  fireEvent.press(screen.getByLabelText("Save to My formats", hidden));
  expect(await screen.findByText("You already have a format called “Average order per day”.", hidden)).toBeTruthy();
  await waitFor(() => expect(screen.getByLabelText("Save to My formats", hidden).props.accessibilityState.disabled).toBe(false));
});

describe("a layout Owl matched from the owner's own spreadsheet", () => {
  const FORMAT_ID = "bbbbbbbb-0000-4000-8000-000000000001";
  const layout = { tabs: [{ title: "Benta", sheet: "sales_by_day", columns: [{ header: "Petsa", id: "day" }, { header: "Upa", id: null }] }] };
  const matched: FileCard = {
    ...card,
    title: "Monthly para kay Ate",
    sheets: [{ name: "Benta", rows: 14 }],
    notes: ["Benta: one row is a day.", "  Petsa → Day", "  Upa → left blank (no figure for this)"],
    downloads: [],
    save: { tenantId: TENANT, name: "Monthly para kay Ate", kind: "format", spec: layout, sheets: ["sales_by_day"], period: { from: "2026-11-01", to: "2026-11-14" } },
  };

  it("shows the matching and a Save, and no file until it is saved", () => {
    render(<FileCardView card={matched} />);
    expect(screen.getByText("  Upa → left blank (no figure for this)", hidden)).toBeTruthy();
    expect(screen.getByLabelText("Save this format", hidden)).toBeTruthy();
    expect(screen.queryByLabelText("Download Excel", hidden)).toBeNull();
  });

  it("offers the file for the dates it was matched with once it is saved", async () => {
    (saveExportFormat as jest.Mock).mockResolvedValue(FORMAT_ID);
    (downloadServerExport as jest.Mock).mockResolvedValue("shop-monthly.xlsx");
    render(<FileCardView card={matched} />);
    fireEvent.press(screen.getByLabelText("Save this format", hidden));
    fireEvent.press(await screen.findByLabelText("Download Excel", hidden));
    await waitFor(() => expect(downloadServerExport).toHaveBeenCalledTimes(1));
    expect(saveExportFormat).toHaveBeenCalledWith(matched.save);
    expect((downloadServerExport as jest.Mock).mock.calls[0][0]).toBe(
      `/api/exports?tenantId=${TENANT}&sheets=sales_by_day&period=custom&from=2026-11-01&to=2026-11-14&format=xlsx&source=owl&template=${FORMAT_ID}`,
    );
  });

  it("offers no file when the saved card's dates or sheets are not what they should be", async () => {
    (saveExportFormat as jest.Mock).mockResolvedValue(FORMAT_ID);
    render(<FileCardView card={{ ...matched, save: { ...matched.save!, sheets: ["orders&x=1"], period: { from: "soon", to: "2026-11-14" } } }} />);
    fireEvent.press(screen.getByLabelText("Save this format", hidden));
    expect(await screen.findByText("Saved as “Monthly para kay Ate”. Find it under My formats in Export.", hidden)).toBeTruthy();
    expect(screen.queryByLabelText("Download Excel", hidden)).toBeNull();
  });

  it("shows nothing for a card with neither a file nor something to save", () => {
    render(<FileCardView card={{ ...matched, save: undefined }} />);
    expect(screen.queryByText("Monthly para kay Ate", hidden)).toBeNull();
  });
});
