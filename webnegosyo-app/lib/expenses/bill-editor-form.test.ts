import { BILL_PRESETS } from "./bill-schedule";
import {
  applyPreset,
  billCategories,
  checkBillForm,
  emptyBillForm,
  formFromBill,
  frequencyLabel,
  formFromPrefill,
  offeredPresets,
  pickCategory,
  previewDates,
  remindLabel,
  ruleOf,
  shortMonthHint,
  startChoices,
  startMonthChoices,
  toggleTwiceDay,
  type BillEditorForm,
} from "./bill-editor-form";
import { BILL_CATEGORIES, BILL_TODAY, billOf, paymentOf } from "./bills-fixtures";
import { keypadFromCents } from "./keypad";

const today = BILL_TODAY; // Thu 22 Oct 2026
const preset = (key: string) => BILL_PRESETS.find((candidate) => candidate.key === key)!;
const blank = emptyBillForm(today, null);

function filled(overrides: Partial<BillEditorForm> = {}): BillEditorForm {
  return { ...applyPreset(blank, preset("rent"), BILL_CATEGORIES), keypad: keypadFromCents(1_500_000), ...overrides };
}

describe("categories", () => {
  it("never offers an Ingredients category, but keeps Cash moved ones like a loan payment", () => {
    const ids = billCategories(BILL_CATEGORIES).map((category) => category.id);
    expect(ids).not.toContain("ice");
    expect(ids).not.toContain("palengke");
    expect(ids).toContain("loan_payment");
  });

  it("offers a preset chip only when the store has its category", () => {
    expect(offeredPresets(BILL_CATEGORIES).map((candidate) => candidate.name)).toEqual([
      "Rent",
      "Kuryente",
      "Tubig",
      "Internet",
      "LPG",
      "Sahod",
      "SSS · PhilHealth · Pag-IBIG",
    ]);
    expect(offeredPresets(BILL_CATEGORIES.filter((category) => category.id !== "lpg")).map((candidate) => candidate.key)).not.toContain("lpg");
  });
});

describe("presets", () => {
  it("fills rent: monthly, same every time, reminded 3 days ahead", () => {
    const form = applyPreset(blank, preset("rent"), BILL_CATEGORIES);
    expect(form).toMatchObject({ name: "Rent", categoryId: "rent", amountMode: "fixed", remindDaysBefore: 3, frequency: "monthly", day: 1 });
  });

  it("fills sahod twice a month on the 15th and the last day", () => {
    const form = applyPreset(blank, preset("sahod"), BILL_CATEGORIES);
    expect(ruleOf(form)).toEqual({ kind: "twice_monthly", days: [15, "last"] });
  });

  it("fills LPG as about every 10 days, changing every time", () => {
    const form = applyPreset(blank, preset("lpg"), BILL_CATEGORIES);
    expect(form).toMatchObject({ amountMode: "varies", frequency: "after_days", afterDays: 10 });
    expect(previewDates(form, today)).toEqual(["2026-11-01", "2026-11-11", "2026-11-21"]);
  });

  it("names the bill after a category picked under Other, unless one was typed", () => {
    const loan = BILL_CATEGORIES.find((category) => category.id === "loan_payment")!;
    expect(pickCategory(blank, loan)).toMatchObject({ categoryId: "loan_payment", name: "Loan payment", presetKey: null });
    expect(pickCategory({ ...blank, name: "Bank loan" }, loan).name).toBe("Bank loan");
  });
});

describe("formFromPrefill", () => {
  it("takes a link's category, amount and day", () => {
    const form = formFromPrefill(today, null, { categoryId: "water", amountCents: 84_000, day: 12, name: null }, BILL_CATEGORIES);
    expect(form).toMatchObject({ name: "Tubig", categoryId: "water", amountMode: "fixed", frequency: "monthly", day: 12 });
    expect(checkBillForm(form, today)).toMatchObject({ ok: true, input: { amountCents: 84_000, rule: { kind: "monthly", day: 12 } } });
  });

  it("never takes an Ingredients category from a link", () => {
    const form = formFromPrefill(today, null, { categoryId: "ice", amountCents: 12_000, day: 3, name: null }, BILL_CATEGORIES);
    expect(form.categoryId).toBeNull();
    expect(checkBillForm(form, today)).toMatchObject({ ok: false, field: "name" });
  });

  it("keeps a linked name", () => {
    const form = formFromPrefill(today, null, { categoryId: "other", amountCents: null, day: null, name: "Pest control" }, BILL_CATEGORIES);
    expect(form).toMatchObject({ name: "Pest control", categoryId: "other" });
  });
});

describe("formFromBill", () => {
  it("opens an existing bill as it was set up", () => {
    const form = formFromBill(billOf({ amountCents: null, rule: { kind: "weekly", every: 2, weekday: 2 }, paidFrom: "gcash" }));
    expect(form).toMatchObject({ amountMode: "varies", frequency: "every_2_weeks", weekday: 2, paidFrom: "gcash", paidToName: "Aling Nena", isStartAuto: false });
    expect(ruleOf(form)).toEqual({ kind: "weekly", every: 2, weekday: 2 });
  });

  it("keeps an every-6-months bill at 6 when edited (never rewrites it to 3)", () => {
    const form = formFromBill(billOf({ rule: { kind: "months", every: 6, day: 10 } }));
    expect(ruleOf(form)).toEqual({ kind: "months", every: 6, day: 10 });
    expect(frequencyLabel({ value: "months_3", label: "Every 3 months" }, form)).toBe("Every 6 months");
  });
});

describe("previewDates", () => {
  it("shows the next three due dates", () => {
    expect(previewDates(filled({ day: 24 }), today)).toEqual(["2026-10-24", "2026-11-24", "2026-12-24"]);
    expect(previewDates(filled({ frequency: "weekly", weekday: 1 }), today)).toEqual(["2026-10-26", "2026-11-02", "2026-11-09"]);
  });

  it("falls back to the last day in shorter months, and says so", () => {
    const form = filled({ day: 31 });
    expect(previewDates(form, today)).toEqual(["2026-10-31", "2026-11-30", "2026-12-31"]);
    expect(shortMonthHint(form)).toBe("In shorter months we remind you on the last day.");
    expect(shortMonthHint(filled({ day: "last" }))).toBeNull();
    expect(shortMonthHint(filled({ day: 28 }))).toBeNull();
  });

  it("counts an edited LPG bill from its last payment", () => {
    const lpg = billOf({ id: "bill-lpg", amountCents: null, rule: { kind: "after_days", every: 10 }, startsOn: "2026-09-01" });
    const dates = previewDates(formFromBill(lpg), today, [paymentOf({ billId: "bill-lpg", dueOn: "2026-10-18" })], "bill-lpg");
    expect(dates[0]).toBe("2026-10-28");
  });
});

describe("checkBillForm", () => {
  it("asks for the amount on a bill that is the same every time", () => {
    expect(checkBillForm(filled({ keypad: keypadFromCents(0) }), today)).toEqual({
      ok: false,
      field: "keypad",
      message: "Type the usual amount, or pick Changes every time",
    });
  });

  it("saves a changing bill with no amount", () => {
    const result = checkBillForm(filled({ amountMode: "varies" }), today);
    expect(result).toMatchObject({ ok: true, input: { amountCents: null } });
  });

  it("uses the engine's words for what it checks", () => {
    expect(checkBillForm(filled({ name: "x".repeat(61) }), today)).toMatchObject({ ok: false, field: "name", message: "Keep the name to 60 letters or fewer" });
    expect(checkBillForm(filled({ frequency: "twice_monthly", days: [30, "last"] }), today)).toMatchObject({
      ok: false,
      field: "rule",
      message: "Pick two days that never fall on the same date",
    });
  });

  it("builds the bill the service saves", () => {
    const result = checkBillForm(filled({ paidFrom: "bank", paidToName: "  Aling Nena ", outletId: "o1" }), today);
    expect(result).toEqual({
      ok: true,
      input: {
        name: "Rent",
        categoryId: "rent",
        amountCents: 1_500_000,
        rule: { kind: "monthly", day: 1 },
        startsOn: today,
        endsOn: null,
        remindDaysBefore: 3,
        paidFrom: "bank",
        paidToName: "Aling Nena",
        outletId: "o1",
      },
    });
  });
});

describe("editing an old bill", () => {
  it("saves a bill that started more than 400 days ago, but never a new start that old", () => {
    const old = billOf({ startsOn: "2024-01-01" });
    const form = formFromBill(old);
    expect(checkBillForm(form, today, old.startsOn)).toMatchObject({ ok: true, input: { startsOn: "2024-01-01" } });
    expect(checkBillForm(form, today)).toMatchObject({ ok: false, field: "startsOn" });
    expect(checkBillForm({ ...form, startsOn: "2024-02-01" }, today, old.startsOn)).toMatchObject({ ok: false, field: "startsOn" });
  });

  it("still previews the next dates of an old bill", () => {
    expect(previewDates(formFromBill(billOf({ startsOn: "2024-01-01" })), today)).toEqual(["2026-10-24", "2026-11-24", "2026-12-24"]);
  });
});

describe("small choices", () => {
  it("keeps two days chosen twice a month, dropping the older pick", () => {
    expect(toggleTwiceDay([15, "last"], 5)).toEqual(["last", 5]);
    expect(toggleTwiceDay([15, "last"], 15)).toEqual([15, "last"]);
  });

  it("words the reminder lead", () => {
    expect([0, 1, 3, 7].map(remindLabel)).toEqual(["On the day", "1 day before", "3 days before", "7 days before"]);
  });

  it("offers today, this month's start and last month's as starts", () => {
    expect(startChoices(today).map((choice) => [choice.label, choice.startsOn])).toEqual([
      ["Today", today],
      ["1 Oct", "2026-10-01"],
      ["1 Sep", "2026-09-01"],
    ]);
  });

  it("offers the next twelve months for a yearly bill's first one", () => {
    const months = startMonthChoices(today);
    expect(months).toHaveLength(12);
    expect(months[0]).toEqual({ key: "2026-10", label: "Oct", startsOn: today });
    expect(months[3]).toEqual({ key: "2027-01", label: "Jan 2027", startsOn: "2027-01-01" });
  });
});
