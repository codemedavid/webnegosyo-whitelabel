import {
  applyRepeat,
  asksStockQuestion,
  canTapSave,
  categoriesForScope,
  checkForm,
  dateChoices,
  emptyForm,
  nextEntryForm,
  saveLabel,
  savedMessage,
  selectCategory,
  toBookDraft,
  toDrawerDraft,
  type AddExpenseForm,
  type FormContext,
} from "./add-expense-form";
import { keypadCents, pressKeys, type KeypadKey } from "./keypad";
import type { ExpenseCategory } from "./types";

function category(overrides: Partial<ExpenseCategory> = {}): ExpenseCategory {
  return {
    id: "c-lpg",
    tenantId: "t1",
    systemKey: "lpg",
    name: "Gas / LPG",
    icon: "LP",
    group: "utilities",
    needsNote: false,
    sortOrder: 110,
    archivedAt: null,
    ...overrides,
  };
}

const TODAY = "2026-10-21";
const lpg = category();
const ice = category({ id: "c-ice", systemKey: "ice", name: "Ice (Yelo)", icon: "IC", group: "ingredients" });
const other = category({ id: "c-other", systemKey: "other", name: "Other", group: "other", needsNote: true });
const ownerDraw = category({ id: "c-owner", systemKey: "owner_draw", name: "Owner took cash", group: "not_expense" });

function typed(amount: readonly KeypadKey[], form: AddExpenseForm = emptyForm(TODAY)): AddExpenseForm {
  return { ...form, keypad: pressKeys(form.keypad, amount) };
}

const book: FormContext = { mode: { kind: "book" }, category: lpg, tracksStock: false, today: TODAY };

describe("add-expense form", () => {
  it("enables Save only once there is an amount and a category", () => {
    const empty = emptyForm(TODAY);
    expect(canTapSave(empty)).toBe(false);
    expect(canTapSave(typed(["1", "2", "5", "0"]))).toBe(false);
    expect(canTapSave(selectCategory(typed(["1", "2", "5", "0"]), "c-lpg"))).toBe(true);
  });

  it("always shows the amount on the button", () => {
    expect(saveLabel(0)).toBe("Save");
    expect(saveLabel(125_000)).toBe("Save ₱1,250");
    expect(saveLabel(8_050, "Pay")).toBe("Pay ₱80.50");
  });

  it("fills category and amount from one repeat tap", () => {
    const form = applyRepeat(emptyForm(TODAY), {
      categoryId: "c-ice",
      categoryName: "Ice (Yelo)",
      icon: "IC",
      amountCents: 12_000,
      timesUsed: 4,
      lastUsedAt: "2026-10-20T00:00:00Z",
    });
    expect(form.categoryId).toBe("c-ice");
    expect(keypadCents(form.keypad)).toBe(12_000);
  });

  it("asks for the amount, then the category, then a required note", () => {
    expect(checkForm(emptyForm(TODAY), book)).toMatchObject({ ok: false, field: "amount" });
    expect(checkForm(typed(["5", "00"]), { ...book, category: null })).toMatchObject({ ok: false, field: "category" });
    const otherForm = selectCategory(typed(["5", "00"]), "c-other");
    expect(checkForm(otherForm, { ...book, category: other })).toMatchObject({ ok: false, field: "note" });
    expect(checkForm({ ...otherForm, note: "Gift for the landlord" }, { ...book, category: other })).toEqual({ ok: true });
  });

  it("asks the stock question only for ingredients in a store that counts stock", () => {
    expect(asksStockQuestion(ice, true)).toBe(true);
    expect(asksStockQuestion(ice, false)).toBe(false);
    expect(asksStockQuestion(lpg, true)).toBe(false);

    const form = selectCategory(typed(["1", "2", "0"]), "c-ice");
    const ctx = { ...book, category: ice, tracksStock: true };
    expect(checkForm(form, ctx)).toMatchObject({ ok: false, field: "stock" });
    expect(checkForm({ ...form, isStockPurchase: false }, ctx)).toEqual({ ok: true });
  });

  it("forgets the stock answer when the category changes", () => {
    const answered = { ...selectCategory(emptyForm(TODAY), "c-ice"), isStockPurchase: true };
    expect(selectCategory(answered, "c-lpg").isStockPurchase).toBeNull();
    expect(selectCategory(answered, "c-ice")).toBe(answered);
  });

  it("refuses to pay more out of a drawer than it should hold, in the drawer's own words", () => {
    const form = selectCategory(typed(["2", "0", "0", "0"]), "c-lpg");
    const drawer: FormContext = {
      ...book,
      mode: { kind: "drawer", shiftId: "s1", drawerName: "Cashier 1", availableCents: 150_000 },
    };
    expect(checkForm(form, drawer)).toEqual({
      ok: false,
      field: "amount",
      reason: "That is more than this drawer should be holding. Count it first.",
    });
    expect(checkForm(form, { ...drawer, mode: { ...drawer.mode, availableCents: null } as FormContext["mode"] })).toEqual({ ok: true });
  });

  it("refuses a future date", () => {
    const form = { ...selectCategory(typed(["5", "0"]), "c-lpg"), spentOn: "2026-10-22" };
    expect(checkForm(form, book)).toMatchObject({ ok: false, field: "date" });
  });

  it("builds a book draft with trimmed text and the stock answer only where it was asked", () => {
    const form = {
      ...selectCategory(typed(["2", "1", "3", "0"]), "c-ice"),
      note: "  pork, veggies ",
      paidToName: " ",
      paidFrom: "gcash" as const,
      isStockPurchase: true,
    };
    expect(toBookDraft(form, { clientRequestId: "r1", outletId: "o1", tracksStock: true, category: ice })).toEqual({
      amountCents: 213_000,
      categoryId: "c-ice",
      spentOn: TODAY,
      paidFrom: "gcash",
      outletId: "o1",
      note: "pork, veggies",
      paidToName: null,
      isStockPurchase: true,
      clientRequestId: "r1",
    });
    expect(toBookDraft(form, { clientRequestId: "r1", outletId: null, tracksStock: false, category: ice }).isStockPurchase).toBe(false);
  });

  it("builds a drawer draft for the shift", () => {
    const form = selectCategory(typed(["1", "2", "5", "0"]), "c-lpg");
    expect(toDrawerDraft(form, { clientRequestId: "r2", shiftId: "s1", category: lpg })).toEqual({
      shiftId: "s1",
      amountCents: 125_000,
      categoryId: "c-lpg",
      note: null,
      paidToName: null,
      clientRequestId: "r2",
    });
  });

  it("keeps the source and the day for the next entry of a batch, and nothing else", () => {
    const filled = { ...selectCategory(typed(["5", "0"]), "c-lpg"), paidFrom: "maya" as const, spentOn: "2026-10-20", note: "x" };
    expect(nextEntryForm(filled)).toEqual({ ...emptyForm("2026-10-20", "maya") });
  });

  it("offers the last week of days, today first", () => {
    expect(dateChoices(TODAY, 3)).toEqual(["2026-10-21", "2026-10-20", "2026-10-19"]);
  });

  it("says what was saved, short", () => {
    expect(savedMessage("Gas / LPG", 125_000, false)).toBe("Saved · Gas / LPG ₱1,250");
    expect(savedMessage("Ice (Yelo)", 12_000, true)).toBe("Saved on this phone · Ice ₱120");
  });

  it("splits spendable categories from cash taken out", () => {
    const all = [lpg, ice, other, ownerDraw];
    expect(categoriesForScope(all, "spend").map((c) => c.id)).toEqual(["c-lpg", "c-ice", "c-other"]);
    expect(categoriesForScope(all, "take_out").map((c) => c.id)).toEqual(["c-owner"]);
  });
});
