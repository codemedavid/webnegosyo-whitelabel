// Guardrail: the register screen wires the stock question, the store policy,
// fresh counts and the sold-out sheet. Jest's logic suite cannot render the
// whole register, so this reads its source (like the other *-mount tests).
import { readFileSync } from "fs";
import { join } from "path";

const source = readFileSync(join(__dirname, "..", "app", "(main)", "pos.tsx"), "utf8");

describe("register stock wiring (pos.tsx)", () => {
  it("asks through the stock sheet, not a plain alert", () => {
    expect(source).toMatch(/<StockShortSheet \{\.\.\.stockGuard\.sheet\} \/>/);
    expect(source).not.toMatch(/Alert\.alert\("Low stock"/);
  });

  it("checks the whole sale at Charge before tender", () => {
    expect(source).toMatch(/const handleCharge = \(\) => \{\s*stockGuard\.guardCharge\(/);
    expect(source).toMatch(/onCharge=\{handleCharge\}/);
  });

  it("checks each add through the guard", () => {
    expect(source).toMatch(/stockGuard\.guardAdd\(/);
  });

  it("reads the store's policy from the stock read and never blocks offline", () => {
    expect(source).toMatch(/parsePosStockPolicy\(stockCeilings\.stockPolicy\)/);
    expect(source).toMatch(/isOnline: connectivity !== "offline"/);
    expect(source).toMatch(/canSellPastStock\(/);
  });

  it("keeps the counts fresh while focused and after each sale", () => {
    expect(source).toMatch(/isFocused: isRegisterFocused/);
    expect(source).toMatch(/saleStamp: lastSaleStamp/);
    expect(source).toMatch(/return \(\) => setIsRegisterFocused\(false\)/);
  });

  it("explains sold-out tiles and keeps them in category and search", () => {
    expect(source).toMatch(/<SoldOutSheet override=\{soldOut\} \/>/);
    expect(source).toMatch(/soldOut\.open\(/);
    expect(source).toMatch(/filterRegisterItems\(items, activeCategory, search\)/);
  });
});
