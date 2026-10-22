import {
  CHANGE_REASONS,
  CURRENT_CATEGORY_NAME,
  VOID_REASONS,
  changeCategoryChoices,
  checkChange,
  checkVoidReason,
  isAlreadySortedError,
  payoutSuggestion,
  shortName,
} from "./expense-detail-sheets";
import type { Expense, ExpenseCategory } from "./types";

const base: Expense = {
  id: "e1", tenantId: "t1", outletId: null, categoryId: "lpg", supplierId: null, paidToName: null, staffUserId: null,
  note: "LPG 11kg", amountCents: 118_000, spentOn: "2026-10-22", paidFrom: "cash", shiftCashMovementId: null,
  isStockPurchase: false, status: "recorded", voidReason: null, voidedBy: null, voidedAt: null,
  replacesExpenseId: null, clientRequestId: "req-1", createdBy: null, createdByName: "Ben",
  createdAt: "2026-10-22T02:12:00Z", receiptCount: 0, docType: null, invoiceNo: null, supplierTin: null,
  vatCents: null, ewtCents: null, ewtRate: null, form2307Given: false,
};

function category(id: string, name: string, needsNote = false): ExpenseCategory {
  return { id, tenantId: "t1", systemKey: id, name, icon: null, group: "utilities", needsNote, sortOrder: 0, archivedAt: null };
}
const lpg = category("lpg", "Gas / LPG");
const other = category("other", "Other", true);
const ice = category("ice", "Ice (Yelo)");

const edit = { categoryId: "lpg", note: "LPG 11kg", amountText: "1180", paidFrom: "cash" as const };

describe("reason chips", () => {
  it("offers short, blame-free reasons", () => {
    expect(VOID_REASONS).toEqual(["Recorded twice", "Wrong amount", "Not ours", "Wrong category"]);
    expect(CHANGE_REASONS.length).toBeGreaterThanOrEqual(3);
  });
});

describe("checkVoidReason", () => {
  it("needs a reason, trimmed", () => {
    expect(checkVoidReason("  ")).toEqual({ reason: null, error: "Say why — a short reason is enough." });
    expect(checkVoidReason(" Recorded twice ")).toEqual({ reason: "Recorded twice", error: null });
  });
});

describe("checkChange", () => {
  it("refuses a change that changes nothing", () => {
    expect(checkChange(base, edit, "Typo", lpg)).toEqual({ patch: null, reason: null, error: "Nothing changed yet." });
  });

  it("refuses a bad amount before anything else", () => {
    expect(checkChange(base, { ...edit, amountText: "abc" }, "Typo", lpg).error).toBe("Enter the amount as pesos, like 1,250 or 80.50.");
  });

  it("needs the note a category asks for", () => {
    expect(checkChange(base, { ...edit, categoryId: "other", note: "" }, "Wrong category", other).error).toBe("Add a note for this category.");
  });

  it("needs a reason", () => {
    expect(checkChange(base, { ...edit, amountText: "1200" }, " ", lpg).error).toBe("Say why you are changing it.");
  });

  it("sends only what changed, with the trimmed reason", () => {
    expect(checkChange(base, { ...edit, amountText: "1,200", paidFrom: "gcash" }, " Wrong amount ", lpg)).toEqual({
      patch: { amount_cents: 120_000, paid_from: "gcash" },
      reason: "Wrong amount",
      error: null,
    });
  });

  it("never sends a drawer row's amount or source", () => {
    const drawerRow: Expense = { ...base, paidFrom: "drawer" };
    expect(checkChange(drawerRow, { ...edit, categoryId: "ice", amountText: "1", paidFrom: null }, "Wrong category", ice)).toEqual({
      patch: { category_id: "ice" },
      reason: "Wrong category",
      error: null,
    });
  });
});

describe("payoutSuggestion", () => {
  it("names the guessed category unless it is already chosen", () => {
    expect(payoutSuggestion("yelo", [lpg, ice], null)?.id).toBe("ice");
    expect(payoutSuggestion("yelo", [lpg, ice], "ice")).toBeNull();
    expect(payoutSuggestion("", [lpg, ice], null)).toBeNull();
  });

  it("shortens a seed name for a chip", () => {
    expect(shortName("Ice (Yelo)")).toBe("Ice");
    expect(shortName("Gas / LPG")).toBe("Gas / LPG");
  });
});

describe("changeCategoryChoices", () => {
  it("offers the store's categories unchanged when the current one is among them", () => {
    const offered = [lpg, ice];

    expect(changeCategoryChoices(offered, "lpg")).toBe(offered);
  });

  it("keeps an archived current category on offer, so the sheet shows what the expense is filed under", () => {
    // Arrange: the category list only carries live categories.
    const offered = [lpg, ice];

    // Act
    const choices = changeCategoryChoices(offered, "old-cat");

    // Assert
    expect(choices.map((choice) => choice.id)).toEqual(["lpg", "ice", "old-cat"]);
    expect(choices[2]).toMatchObject({ name: CURRENT_CATEGORY_NAME, archivedAt: null });
  });
});

describe("isAlreadySortedError", () => {
  it("recognises the unique refusal a second save of the same pay-out gets", () => {
    expect(isAlreadySortedError({ code: "23505", message: "duplicate key" })).toBe(true);
    expect(isAlreadySortedError(Object.assign(new Error("dup"), { code: "23505" }))).toBe(true);
    expect(isAlreadySortedError(new Error("This pay-out already has a category."))).toBe(false);
    expect(isAlreadySortedError(new Error("network"))).toBe(false);
    expect(isAlreadySortedError(null)).toBe(false);
  });
});
