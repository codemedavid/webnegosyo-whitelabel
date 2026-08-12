/**
 * When a receipt prints.
 *
 * Printing used to happen at exactly one moment — status becoming `confirmed`
 * — and only on the order-detail screen, while the tender screen printed
 * unconditionally and the orders list printed nothing at all. This module is
 * the single answer to "should paper come out now?", so those four call sites
 * can stop each having their own opinion.
 */

import {
  migrateAutoPrint,
  shouldPrintAt,
  PRINT_TRIGGERS,
  type PrintTrigger,
} from "./print-trigger";

describe("shouldPrintAt", () => {
  it("prints the kitchen ticket on confirmation when that is the setting", () => {
    expect(shouldPrintAt("confirmation", "confirmation")).toBe(true);
  });

  it("does not print at bill-out when the merchant only wants confirmation tickets", () => {
    expect(shouldPrintAt("billout", "confirmation")).toBe(false);
  });

  it("prints at bill-out when that is the setting", () => {
    expect(shouldPrintAt("billout", "billout")).toBe(true);
  });

  it("does not print on confirmation when the merchant only wants bills", () => {
    expect(shouldPrintAt("confirmation", "billout")).toBe(false);
  });

  it("prints at both moments when the merchant wants both", () => {
    expect(shouldPrintAt("confirmation", "both")).toBe(true);
    expect(shouldPrintAt("billout", "both")).toBe(true);
  });

  it("never prints automatically when printing is off", () => {
    expect(shouldPrintAt("confirmation", "off")).toBe(false);
    expect(shouldPrintAt("billout", "off")).toBe(false);
  });

  it("answers for every declared trigger without throwing", () => {
    // Arrange — a new trigger added without a rule must not fail silently open.
    for (const trigger of PRINT_TRIGGERS) {
      // Act + Assert
      expect(typeof shouldPrintAt("confirmation", trigger)).toBe("boolean");
      expect(typeof shouldPrintAt("billout", trigger)).toBe("boolean");
    }
  });
});

describe("migrateAutoPrint", () => {
  it("keeps an upgrading merchant on the behaviour they already had", () => {
    // Arrange — the old boolean meant "print when confirmed".
    expect(migrateAutoPrint(true)).toBe<PrintTrigger>("confirmation");
  });

  it("keeps auto-print off for a merchant who had switched it off", () => {
    expect(migrateAutoPrint(false)).toBe<PrintTrigger>("off");
  });

  it("defaults a fresh install to printing on confirmation", () => {
    // The old store defaulted `autoPrint` to true, so a device with nothing
    // saved must land on the same behaviour rather than silently going quiet.
    expect(migrateAutoPrint(null)).toBe<PrintTrigger>("confirmation");
    expect(migrateAutoPrint(undefined)).toBe<PrintTrigger>("confirmation");
  });
});
