/**
 * The detail screen's receipt writes never fail silently: a photo that could
 * not be kept says so, and a PDF link that throws frees the receipt tiles.
 */
import { Alert, Linking } from "react-native";
import { act, renderHook } from "@testing-library/react-native";

import { fetchReceiptLink, flushExpenses, queueReceipt } from "../../../lib/expenses/live-expense-queue";
import { captureReceipt } from "../../../lib/expenses/receipt-files";
import type { Expense } from "../../../lib/expenses/types";
import { useExpenseDetailWrites } from "./use-expense-detail-writes";

jest.mock("expo-router", () => ({ router: { setParams: jest.fn() } }));
jest.mock("../../../stores/auth-store", () => ({ useAuthStore: { getState: () => ({ isDemo: false }) } }));
jest.mock("../../../lib/expenses/actor-name", () => ({ readActorName: jest.fn(async () => "Ana") }));
jest.mock("../../../lib/expenses/expense-client", () => ({ liveExpenseDb: {} }));
jest.mock("../../../lib/expenses/expense-service", () => ({ replaceExpense: jest.fn(), voidExpense: jest.fn() }));
jest.mock("../../../lib/expenses/receipt-files", () => ({ captureReceipt: jest.fn(), describeCaptureOutcome: jest.fn(() => null) }));
jest.mock("../../../lib/expenses/live-expense-queue", () => ({
  fetchReceiptLink: jest.fn(),
  flushExpenses: jest.fn(async () => ({})),
  queueReceipt: jest.fn(async () => {}),
}));

const expense = { id: "e1", clientRequestId: "req-1" } as Expense;
const captured = { status: "captured", receipt: { fileUri: "file://r.jpg", mime: "image/jpeg" } };

function renderWrites(reload = jest.fn(async () => {})) {
  return renderHook(() => useExpenseDetailWrites({ tenantId: "t1", expense, reload, onWritten: jest.fn() }));
}

/** Picks "Take a photo" from the Add-a-receipt prompt and waits for it to finish. */
async function takePhoto(result: ReturnType<typeof renderWrites>["result"]) {
  const alert = jest.spyOn(Alert, "alert");
  act(() => result.current.addReceipt());
  const buttons = alert.mock.calls[0]?.[2] ?? [];
  await act(async () => {
    buttons.find((button) => button.text === "Take a photo")?.onPress?.();
  });
  return alert;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  jest.mocked(queueReceipt).mockResolvedValue(undefined as never);
  jest.mocked(flushExpenses).mockResolvedValue({} as never);
});

describe("taking a receipt", () => {
  it("says the photo could not be kept when the phone could not queue it", async () => {
    // Arrange
    jest.mocked(captureReceipt).mockResolvedValue(captured as never);
    jest.mocked(queueReceipt).mockRejectedValue(new Error("disk full"));
    const { result } = renderWrites();

    // Act
    const alert = await takePhoto(result);

    // Assert
    expect(alert).toHaveBeenLastCalledWith("Receipt", "The photo could not be saved. Try again.");
  });

  it("tells the owner a kept photo will upload later when sending fails", async () => {
    jest.mocked(captureReceipt).mockResolvedValue(captured as never);
    jest.mocked(flushExpenses).mockRejectedValue(new Error("offline"));
    const { result } = renderWrites();

    const alert = await takePhoto(result);

    expect(alert).toHaveBeenLastCalledWith("Receipt", "Saved on this phone. It uploads when the connection is back.");
  });
});

describe("opening a PDF", () => {
  it("frees the receipt tiles and says so when the link throws", async () => {
    // Arrange
    jest.mocked(fetchReceiptLink).mockRejectedValue(new Error("boom"));
    const alert = jest.spyOn(Alert, "alert");
    const { result } = renderWrites();

    // Act
    await act(async () => {
      await result.current.openPdf("r1");
    });

    // Assert
    expect(result.current.openingPdfId).toBeNull();
    expect(alert).toHaveBeenCalledWith("Receipt", "The receipt could not be opened. Try again.");
  });

  it("opens the signed link", async () => {
    jest.mocked(fetchReceiptLink).mockResolvedValue({ status: "ok", url: "https://x/r.pdf" } as never);
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    const { result } = renderWrites();

    await act(async () => {
      await result.current.openPdf("r1");
    });

    expect(open).toHaveBeenCalledWith("https://x/r.pdf");
    expect(result.current.openingPdfId).toBeNull();
  });
});
