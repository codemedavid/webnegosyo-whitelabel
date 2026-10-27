import {
  MAX_DAYS_BACK,
  applyRepeat,
  asksStockQuestion,
  canTapSave,
  categoriesForScope,
  checkForm,
  dateChoices,
  dateToDay,
  dayToDate,
  drawerAfterCents,
  drawerChipLabel,
  emptyForm,
  formForOpening,
  nextEntryForm,
  oldestSpendDate,
  primaryLabel,
  saveLabel,
  savedMessage,
  savesToPhoneOnly,
  selectCategory,
  sheetTitle,
  toBookDraft,
  toDrawerDraft,
  withNote,
  type AddExpenseForm,
  type AddExpenseMode,
  type FormContext,
} from "./add-expense-form";
import type { QueuedExpense } from "./expense-queue";
import { addDays } from "./manila-date";
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
    expect(toDrawerDraft(form, { clientRequestId: "r2", shiftId: "s1", category: lpg, tracksStock: true })).toEqual({
      shiftId: "s1",
      amountCents: 125_000,
      categoryId: "c-lpg",
      note: null,
      paidToName: null,
      clientRequestId: "r2",
    });
  });

  it("keeps 'went into stock' on a drawer ingredient buy, and sends nothing for a no", () => {
    const yes = { ...selectCategory(typed(["4", "5", "0"]), "c-ice"), isStockPurchase: true };
    expect(toDrawerDraft(yes, { clientRequestId: "r3", shiftId: "s1", category: ice, tracksStock: true }).isStockPurchase).toBe(true);
    expect(toDrawerDraft({ ...yes, isStockPurchase: false }, { clientRequestId: "r3", shiftId: "s1", category: ice, tracksStock: true })).not.toHaveProperty("isStockPurchase");
    // A store that doesn't count stock was never asked.
    expect(toDrawerDraft(yes, { clientRequestId: "r3", shiftId: "s1", category: ice, tracksStock: false })).not.toHaveProperty("isStockPurchase");
  });

  it("keeps the source and the day for the next entry of a batch, and nothing else", () => {
    const filled = { ...selectCategory(typed(["5", "0"]), "c-lpg"), paidFrom: "maya" as const, spentOn: "2026-10-20", note: "x" };
    expect(nextEntryForm(filled)).toEqual({ ...emptyForm("2026-10-20", "maya") });
  });

  it("offers days today first, and never one the validator would refuse", () => {
    expect(dateChoices(TODAY, 3)).toEqual(["2026-10-21", "2026-10-20", "2026-10-19"]);
    const every = dateChoices(TODAY, 1_000);
    expect(every).toHaveLength(MAX_DAYS_BACK + 1);
    expect(every[every.length - 1]).toBe(oldestSpendDate(TODAY));
    const base = selectCategory(typed(["5", "0"]), "c-lpg");
    for (const spentOn of [every[0], every[every.length - 1]]) {
      expect(checkForm({ ...base, spentOn }, book)).toEqual({ ok: true });
    }
  });

  it("refuses a day older than the oldest the calendar offers", () => {
    const base = selectCategory(typed(["5", "0"]), "c-lpg");
    const tooOld = addDays(TODAY, -(MAX_DAYS_BACK + 1));
    expect(tooOld < oldestSpendDate(TODAY)).toBe(true);
    expect(checkForm({ ...base, spentOn: tooOld }, book)).toMatchObject({ ok: false, field: "date" });
  });

  it("turns a calendar day into the stored date and back, whatever the hour", () => {
    expect(dateToDay(dayToDate("2026-03-09"))).toBe("2026-03-09");
    expect(dateToDay(new Date(2026, 0, 31, 23, 59))).toBe("2026-01-31");
    expect(dayToDate("2026-12-01").getMonth()).toBe(11);
  });

  it("says what was saved, short", () => {
    expect(savedMessage("Gas / LPG", 125_000, false)).toBe("Saved · Gas / LPG ₱1,250");
    expect(savedMessage("Ice (Yelo)", 12_000, true)).toBe("Saved on this phone · Ice ₱120");
  });

  it("pre-picks a category from a note only while the person has not picked one", () => {
    const all = [lpg, ice, other];
    const suggested = withNote(emptyForm(TODAY), "yelo para sa cooler", all);
    expect(suggested.categoryId).toBe("c-ice");
    expect(suggested.note).toBe("yelo para sa cooler");

    // A changed note may move its own suggestion…
    expect(withNote(suggested, "gasul refill", all).categoryId).toBe("c-lpg");
    // …but never a category the person tapped.
    const picked = selectCategory(emptyForm(TODAY), "c-other");
    expect(withNote(picked, "yelo", all).categoryId).toBe("c-other");
    const repeated = applyRepeat(emptyForm(TODAY), {
      categoryId: "c-lpg",
      categoryName: "Gas / LPG",
      icon: null,
      amountCents: 105_000,
      timesUsed: 1,
      lastUsedAt: "2026-10-20T00:00:00Z",
    });
    expect(withNote(repeated, "yelo", all).categoryId).toBe("c-lpg");
  });

  it("does not pre-pick on a weak or two-way note, or a category the sheet does not offer", () => {
    expect(withNote(emptyForm(TODAY), "yelo at lpg", [lpg, ice]).categoryId).toBeNull();
    expect(withNote(emptyForm(TODAY), "yelo", [lpg]).categoryId).toBeNull();
  });

  it("opens with the caller's amount, note, category and stock answer", () => {
    const form = formForOpening({
      today: TODAY,
      paidFrom: "gcash",
      initialCategoryId: "c-ice",
      initialAmountCents: 213_050,
      initialNote: "Delivery from Aling Nena",
      initialIsStockPurchase: true,
    });
    expect(keypadCents(form.keypad)).toBe(213_050);
    expect(form).toMatchObject({
      categoryId: "c-ice",
      note: "Delivery from Aling Nena",
      isStockPurchase: true,
      paidFrom: "gcash",
      spentOn: TODAY,
    });
    expect(formForOpening({ today: TODAY, paidFrom: "cash" })).toEqual(emptyForm(TODAY));
    // A nonsense amount opens empty rather than as a negative or fractional centavo.
    expect(keypadCents(formForOpening({ today: TODAY, paidFrom: "cash", initialAmountCents: -5 }).keypad)).toBe(0);
  });

  it("titles and labels the sheet for each way it opens", () => {
    const drawer: AddExpenseMode = { kind: "drawer", shiftId: "s1", drawerName: "Front till", availableCents: 462_000 };
    expect(sheetTitle({ kind: "book" }, "spend")).toBe("New expense");
    expect(sheetTitle(drawer, "spend")).toBe("Pay from the drawer");
    expect(sheetTitle(drawer, "take_out")).toBe("Take out cash");
    expect(primaryLabel(105_000, { kind: "book" }, "spend")).toBe("Save ₱1,050");
    expect(primaryLabel(15_000, drawer, "spend")).toBe("Pay ₱150 from drawer");
    expect(primaryLabel(0, drawer, "spend")).toBe("Pay from drawer");
    expect(primaryLabel(50_000, drawer, "take_out")).toBe("Take out ₱500");
    expect(primaryLabel(2_222_200, { kind: "book" }, "spend", false)).toBe("Choose a category");
    expect(primaryLabel(0, { kind: "book" }, "spend", false)).toBe(primaryLabel(0, { kind: "book" }, "spend"));
  });

  it("names the drawer chip and says what the drawer should hold afterwards", () => {
    const drawer = { kind: "drawer" as const, shiftId: "s1", drawerName: "Front till", availableCents: 462_000 };
    expect(drawerChipLabel({ ...drawer, shiftLabel: "Ben's shift" })).toBe("Front till · Ben's shift");
    expect(drawerChipLabel({ ...drawer, drawerName: "Cashier 1" })).toBe("Cashier 1 drawer");
    expect(drawerChipLabel({ ...drawer, drawerName: "My" })).toBe("Your drawer");
    expect(drawerAfterCents(drawer, 15_000)).toBe(447_000);
    expect(drawerAfterCents(drawer, 0)).toBeNull();
    expect(drawerAfterCents(drawer, 500_000)).toBeNull();
    expect(drawerAfterCents({ ...drawer, availableCents: null }, 15_000)).toBeNull();
    expect(drawerAfterCents({ kind: "book" }, 15_000)).toBeNull();
  });

  it("says an entry is saved on this phone only when the queue shows it will wait", () => {
    const waiting = (overrides: Partial<QueuedExpense>): QueuedExpense => ({
      id: "old",
      tenantId: "t1",
      payload: { kind: "book", createdByName: "Ana", draft: toBookDraft(selectCategory(typed(["5"]), "c-lpg"), { clientRequestId: "old", outletId: null, tracksStock: false, category: lpg }) },
      categoryName: "Gas / LPG",
      attempts: 1,
      retryAt: null,
      createdAt: 0,
      refusedReason: null,
      ...overrides,
    });
    expect(savesToPhoneOnly([], { isOffline: false, exceptId: "new" })).toBe(false);
    expect(savesToPhoneOnly([], { isOffline: true, exceptId: "new" })).toBe(true);
    expect(savesToPhoneOnly([waiting({})], { isOffline: false, exceptId: "new" })).toBe(true);
    // Never tried yet (still in its own Undo window), refused, or the new entry itself: not evidence.
    expect(savesToPhoneOnly([waiting({ attempts: 0 })], { isOffline: false, exceptId: "new" })).toBe(false);
    expect(savesToPhoneOnly([waiting({ refusedReason: "Shift closed" })], { isOffline: false, exceptId: "new" })).toBe(false);
    expect(savesToPhoneOnly([waiting({ id: "new" })], { isOffline: false, exceptId: "new" })).toBe(false);
  });

  it("splits spendable categories from cash taken out", () => {
    const all = [lpg, ice, other, ownerDraw];
    expect(categoriesForScope(all, "spend").map((c) => c.id)).toEqual(["c-lpg", "c-ice", "c-other"]);
    expect(categoriesForScope(all, "take_out").map((c) => c.id)).toEqual(["c-owner"]);
  });
});
