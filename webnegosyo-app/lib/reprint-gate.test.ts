import type { RegisteredPrinter } from "./printer-registry";
import {
  NO_RECEIPT_PRINTER_REASON,
  kitchenChitGate,
  needsPrinterPicker,
  reprintGate,
  reprintTargets,
} from "./reprint-gate";

function printer(id: string, roles: RegisteredPrinter["roles"]): RegisteredPrinter {
  return { id, type: "bluetooth", name: `Printer ${id}`, address: `AA:${id}`, roles };
}

const CASHIER = printer("c1", ["cashier"]);
const CASHIER_2 = printer("c2", ["cashier"]);
const KITCHEN = printer("k1", ["kitchen"]);
const BOTH = printer("b1", ["cashier", "kitchen"]);

describe("reprintGate", () => {
  it("shows an enabled Reprint on a delivered order — every finished sale", () => {
    expect(reprintGate({ status: "delivered" }, [CASHIER])).toEqual({ show: true, enabled: true, reason: null });
  });

  it.each(["confirmed", "preparing", "ready"])("shows it on a %s order", (status) => {
    expect(reprintGate({ status }, [CASHIER]).show).toBe(true);
  });

  it("hides it on a pending order — nothing was sold yet", () => {
    expect(reprintGate({ status: "pending" }, [CASHIER]).show).toBe(false);
  });

  it("hides it on a cancelled order", () => {
    expect(reprintGate({ status: "cancelled" }, [CASHIER]).show).toBe(false);
  });

  it("hides it while the order has not loaded", () => {
    expect(reprintGate(null, [CASHIER]).show).toBe(false);
  });

  it("shows a device-queued offline sale too", () => {
    expect(reprintGate({ status: "confirmed", offlineSync: "queued" }, [CASHIER])).toEqual({
      show: true,
      enabled: true,
      reason: null,
    });
  });

  it("says why when this device has no receipt printer, instead of hiding the button", () => {
    expect(reprintGate({ status: "delivered" }, [])).toEqual({
      show: true,
      enabled: false,
      reason: NO_RECEIPT_PRINTER_REASON,
    });
  });

  it("treats a kitchen-only device as having no receipt printer", () => {
    const gate = reprintGate({ status: "delivered" }, [KITCHEN]);
    expect(gate.enabled).toBe(false);
    expect(gate.reason).toBe(NO_RECEIPT_PRINTER_REASON);
  });

  it("counts a printer holding both roles as a receipt printer", () => {
    expect(reprintGate({ status: "ready" }, [BOTH]).enabled).toBe(true);
  });
});

describe("kitchenChitGate", () => {
  it("shows on any non-cancelled order when a kitchen printer exists", () => {
    for (const status of ["pending", "confirmed", "preparing", "ready", "delivered"]) {
      expect(kitchenChitGate({ status }, [KITCHEN])).toBe(true);
    }
  });

  it("never on a cancelled order", () => {
    expect(kitchenChitGate({ status: "cancelled" }, [KITCHEN])).toBe(false);
  });

  it("never without a kitchen printer", () => {
    expect(kitchenChitGate({ status: "ready" }, [CASHIER])).toBe(false);
    expect(kitchenChitGate(null, [KITCHEN])).toBe(false);
  });
});

describe("reprintTargets / needsPrinterPicker", () => {
  it("lists only the receipt printers, in saved order", () => {
    expect(reprintTargets([KITCHEN, CASHIER, BOTH]).map((p) => p.id)).toEqual(["c1", "b1"]);
  });

  it("prints straight away with one receipt printer", () => {
    expect(needsPrinterPicker([CASHIER, KITCHEN])).toBe(false);
  });

  it("asks which printer with two or more", () => {
    expect(needsPrinterPicker([CASHIER, CASHIER_2])).toBe(true);
  });
});
