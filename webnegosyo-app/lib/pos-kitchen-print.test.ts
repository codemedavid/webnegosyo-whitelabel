/**
 * The register prints the kitchen chit itself the instant a counter sale is
 * written, instead of waiting for the auto-print watcher to hear about the
 * order from the server. It claims the chit in the shared ledger first, so
 * the watcher — seeing the same order seconds later — stays quiet.
 */

const mockClaimPrinted = jest.fn();
jest.mock("./printed-ledger", () => ({
  claimPrinted: (...args: unknown[]) => mockClaimPrinted(...args),
}));

const mockPrintForRole = jest.fn();
jest.mock("./printer", () => ({
  printForRole: (...args: unknown[]) => mockPrintForRole(...args),
}));

jest.mock("../stores/printer-store", () => ({
  usePrinterStore: {
    getState: () => ({
      kitchenAutoPrint: true,
      printers: [{ id: "k", type: "bluetooth", name: "Kitchen", address: "AA", roles: ["kitchen"] }],
    }),
  },
}));

import {
  printPosKitchenChit,
  readPosKitchenPrintDeps,
  shouldPrintPosKitchenChit,
} from "./pos-kitchen-print";
import type { PosOrderArgs } from "./pos-order";

const ARGS = {
  customerName: "Walk-in",
  customerContact: "",
  orderType: "dine_in",
  total: 150,
  source: "pos",
  clientOrderId: "c1",
  customerData: { pos: {} },
  items: [
    {
      menuItemId: "m1",
      menuItemName: "Burger",
      quantity: 2,
      price: 75,
      subtotal: 150,
      specialInstructions: "no onions",
      variationSelections: [{ typeName: "Size", optionName: "Large", priceAdjustment: 0 }],
    },
  ],
} as unknown as PosOrderArgs;

const ON = { kitchenAutoPrint: true, hasKitchenPrinter: true, isDemo: false };

beforeEach(() => {
  jest.clearAllMocks();
  mockClaimPrinted.mockImplementation(async (_kind: string, ids: string[]) => ids);
  mockPrintForRole.mockResolvedValue({ anySuccess: true, results: [] });
});

describe("shouldPrintPosKitchenChit", () => {
  it("applies the watcher's gate: toggle on, a kitchen printer, not demo", () => {
    expect(shouldPrintPosKitchenChit(ON)).toBe(true);
    expect(shouldPrintPosKitchenChit({ ...ON, kitchenAutoPrint: false })).toBe(false);
    expect(shouldPrintPosKitchenChit({ ...ON, hasKitchenPrinter: false })).toBe(false);
    expect(shouldPrintPosKitchenChit({ ...ON, isDemo: true })).toBe(false);
  });

  it("reads the gate off the printer store", () => {
    expect(readPosKitchenPrintDeps(false)).toEqual(ON);
    expect(readPosKitchenPrintDeps(true).isDemo).toBe(true);
  });
});

describe("printPosKitchenChit", () => {
  it("claims the order in the kitchen ledger, then prints the chit on kitchen printers", async () => {
    const printed = await printPosKitchenChit("order-1", ARGS, 1_700_000_000_000, ON);
    expect(printed).toBe(true);
    expect(mockClaimPrinted).toHaveBeenCalledWith("kitchen", ["order-1"]);
    expect(mockPrintForRole).toHaveBeenCalledTimes(1);
    const [role, segments] = mockPrintForRole.mock.calls[0] as [string, { type: string; text: string }[]];
    expect(role).toBe("kitchen");
    expect(segments[0]!.text).toContain("2x Burger");
    expect(segments[0]!.text).toContain("no onions");
    expect(segments[0]!.text).toContain("Walk-in");
  });

  it("stays quiet when the watcher (or a previous session) already printed it", async () => {
    mockClaimPrinted.mockResolvedValue([]);
    expect(await printPosKitchenChit("order-1", ARGS, 0, ON)).toBe(false);
    expect(mockPrintForRole).not.toHaveBeenCalled();
  });

  it("does nothing when the gate is closed — and never claims, so the watcher may still print", async () => {
    expect(await printPosKitchenChit("order-1", ARGS, 0, { ...ON, kitchenAutoPrint: false })).toBe(false);
    expect(mockClaimPrinted).not.toHaveBeenCalled();
  });

  it("never throws — a dead kitchen printer only logs", async () => {
    mockPrintForRole.mockRejectedValue(new Error("boom"));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    expect(await printPosKitchenChit("order-1", ARGS, 0, ON)).toBe(false);
    warn.mockRestore();
  });
});
