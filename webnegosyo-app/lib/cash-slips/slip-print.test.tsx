/**
 * Print + share for the remittance slip and the day close: printed on the
 * cashier-role printer at ITS paper width (an 80 mm head gets 48 columns),
 * refused with the set-up message when no receipt printer exists, a failed
 * print reports the printer's own error, and sharing never throws.
 */
import { Share } from "react-native";

import type { RegisteredPrinter } from "../printer-registry";
import type { RemittanceSlipInput } from "./remittance-slip";
import { printRemittanceSlip, shareRemittanceSlip } from "./slip-print";

const mockPrintForRole = jest.fn();
let mockPrinters: Partial<RegisteredPrinter>[] = [];

jest.mock("../printer", () => ({ printForRole: (...args: unknown[]) => mockPrintForRole(...args) }));
jest.mock("../../stores/printer-store", () => ({ usePrinterStore: { getState: () => ({ printers: mockPrinters }) } }));

const SLIP: RemittanceSlipInput = {
  businessDay: "2026-10-24",
  drawerName: "Cashier 1",
  cashierName: "Ana",
  shiftOpenedAt: "2026-10-24T10:02:00.000Z",
  shiftClosedAt: "2026-10-24T18:48:00.000Z",
  startingCashCents: 200000,
  cashSalesCents: 100000,
  payInCents: 0,
  payOutCents: 0,
  pickups: [],
  expectedCents: 300000,
  countedCents: 300000,
  floatKeptCents: 200000,
  handedOverCents: 100000,
  nonCash: [],
  denominations: null,
  receiver: { name: "Maria", status: "pending" },
};

const CASHIER_80 = { id: "p1", name: "Counter", type: "bluetooth", address: "AA", roles: ["cashier"], paperWidth: 80 } as unknown as RegisteredPrinter;

function printedText(): string {
  const segments = mockPrintForRole.mock.calls[0][1] as { type: string; text: string }[];
  return segments[0].text;
}

beforeEach(() => {
  mockPrintForRole.mockReset();
  mockPrinters = [];
});

describe("slip printing", () => {
  it("refuses with the set-up message when there is no receipt printer", async () => {
    const outcome = await printRemittanceSlip(SLIP, { storeName: "Loly's" });
    expect(outcome).toEqual({ ok: false, message: expect.stringContaining("No receipt printer") });
    expect(mockPrintForRole).not.toHaveBeenCalled();
  });

  it("prints on the cashier role at the printer's own width", async () => {
    mockPrinters = [CASHIER_80];
    mockPrintForRole.mockResolvedValue({ anySuccess: true, results: [] });
    const outcome = await printRemittanceSlip(SLIP, { storeName: "Loly's", branchName: "Main" });
    expect(outcome).toEqual({ ok: true });
    expect(mockPrintForRole.mock.calls[0][0]).toBe("cashier");
    expect(printedText()).toContain("REMITTANCE SLIP");
    expect(printedText().split("\n").some((line) => line.length === 48)).toBe(true);
  });

  it("a failed print reports the printer's error", async () => {
    mockPrinters = [CASHIER_80];
    mockPrintForRole.mockResolvedValue({ anySuccess: false, results: [{ result: { success: false, error: "Printer is off." } }] });
    expect(await printRemittanceSlip(SLIP, { storeName: "Loly's" })).toEqual({ ok: false, message: "Printer is off." });
  });

  it("sharing sends the plain text and never throws", async () => {
    const share = jest.spyOn(Share, "share").mockRejectedValueOnce(new Error("dismissed"));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    await expect(shareRemittanceSlip(SLIP, { storeName: "Loly's" })).resolves.toBeUndefined();
    const message = (share.mock.calls[0][0] as { message: string }).message;
    expect(message).toContain("REMITTANCE SLIP");
    expect(message).not.toMatch(/<\/?B>/);
    share.mockRestore();
    warn.mockRestore();
  });
});
