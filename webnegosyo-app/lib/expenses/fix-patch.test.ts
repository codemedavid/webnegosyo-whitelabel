import { buildFixPatch } from "./fix-patch";

const book = { categoryId: "c-lpg", note: "LPG refill", amountCents: 125_000, paidFrom: "cash" as const };
const drawer = { ...book, paidFrom: "drawer" as const };

describe("buildFixPatch", () => {
  it("sends only what changed", () => {
    expect(buildFixPatch(book, { categoryId: "c-lpg", note: "LPG refill ", amountText: "1,250.00", paidFrom: "cash" })).toEqual({
      patch: null,
      error: null,
    });
    expect(buildFixPatch(book, { categoryId: "c-ice", note: "", amountText: "₱1,200", paidFrom: "gcash" })).toEqual({
      patch: { category_id: "c-ice", note: null, amount_cents: 120_000, paid_from: "gcash" },
      error: null,
    });
  });

  it("never sends a drawer row's amount or source, whatever was typed", () => {
    expect(buildFixPatch(drawer, { categoryId: "c-ice", note: "LPG refill", amountText: "9", paidFrom: "bank" })).toEqual({
      patch: { category_id: "c-ice" },
      error: null,
    });
  });

  it("refuses an amount that is not pesos", () => {
    expect(buildFixPatch(book, { categoryId: "c-lpg", note: "", amountText: "abc", paidFrom: "cash" }).error).toMatch(/pesos/);
    expect(buildFixPatch(book, { categoryId: "c-lpg", note: "", amountText: "0", paidFrom: "cash" }).error).toMatch(/pesos/);
  });
});
