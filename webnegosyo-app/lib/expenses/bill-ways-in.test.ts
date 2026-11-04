import {
  SUGGESTION_SNOOZE_DAYS,
  activeDismissals,
  billNameFor,
  forgetBills,
  knownBills,
  lastFullMonths,
  monthsPaid,
  pickBillSuggestion,
  rememberBills,
  repeatOffer,
  withDismissal,
  type PickSuggestionInput,
  type RepeatOfferInput,
} from "./bill-ways-in";
import { HOME_NOW, homeCategory, homeExpense } from "./expenses-home-fixtures";
import { monthLabel } from "./expense-format";

const rentCategory = { id: "cat-rent", name: "Rent (Upa)", systemKey: "rent", group: "occupancy" as const };

function input(overrides: Partial<RepeatOfferInput> = {}): RepeatOfferInput {
  return {
    isBook: true,
    category: rentCategory,
    billId: null,
    bills: [],
    amountCents: 1_500_000,
    spentOn: "2026-10-05",
    savedMessage: "Saved · Rent ₱15,000",
    ...overrides,
  };
}

describe("repeatOffer", () => {
  test("rent saved with no bill on it: offer to repeat it every month, pre-filled", () => {
    expect(repeatOffer(input())).toEqual({
      label: "Repeat",
      message: "Saved · Rent ₱15,000 · Pay this every month?",
      href: "/(main)/expense-bills?new=1&category=cat-rent&amount=1500000&day=5&name=Rent",
    });
  });

  test("utilities, staff and admin categories qualify too", () => {
    const power = { id: "cat-power", name: "Electricity (Kuryente)", systemKey: "electricity", group: "utilities" as const };
    const wages = { id: "cat-wages", name: "Salaries & wages (Sahod)", systemKey: "wages", group: "staff" as const };
    const permits = { id: "cat-permits", name: "Permits & taxes", systemKey: "permits", group: "admin" as const };

    expect(repeatOffer(input({ category: power, spentOn: "2026-10-24" }))?.href).toContain("day=24&name=Kuryente");
    expect(repeatOffer(input({ category: wages }))?.href).toContain("name=Sahod");
    expect(repeatOffer(input({ category: permits }))?.href).toContain("name=Permits");
  });

  test("never for ingredients, cash moved, running costs or big purchases", () => {
    for (const group of ["ingredients", "not_expense", "operating", "capex", "other"] as const) {
      expect(repeatOffer(input({ category: { ...rentCategory, group } }))).toBeNull();
    }
  });

  test("never for a drawer pay-out", () => {
    expect(repeatOffer(input({ isBook: false }))).toBeNull();
  });

  test("never when the expense already pays a bill", () => {
    expect(repeatOffer(input({ billId: "bill-rent" }))).toBeNull();
  });

  test("never when a bill already covers the category; a stopped bill does not count", () => {
    expect(repeatOffer(input({ bills: [{ categoryId: "cat-rent", status: "active" }] }))).toBeNull();
    expect(repeatOffer(input({ bills: [{ categoryId: "cat-rent", status: "paused" }] }))).toBeNull();
    expect(repeatOffer(input({ bills: [{ categoryId: "cat-rent", status: "ended" }] }))).not.toBeNull();
    expect(repeatOffer(input({ bills: [{ categoryId: "cat-other", status: "active" }] }))).not.toBeNull();
  });

  test("offers nothing while this phone does not know the bills", () => {
    expect(repeatOffer(input({ bills: null }))).toBeNull();
  });
});

describe("billNameFor", () => {
  test("the preset's word for seeded categories, else the short name", () => {
    expect(billNameFor({ name: "Rent (Upa)", systemKey: "rent" })).toBe("Rent");
    expect(billNameFor({ name: "Water (Tubig)", systemKey: "water" })).toBe("Tubig");
    expect(billNameFor({ name: "SSS / PhilHealth / Pag-IBIG", systemKey: "gov_contributions" })).toBe("SSS · PhilHealth · Pag-IBIG");
    expect(billNameFor({ name: "Accountant & software", systemKey: "accounting" })).toBe("Accountant");
    expect(billNameFor({ name: "Security guard", systemKey: null })).toBe("Security guard");
  });
});

describe("knownBills", () => {
  afterEach(forgetBills);

  test("hands back the last board only for the same store", () => {
    rememberBills("t1", [{ categoryId: "cat-rent", status: "active" }]);
    expect(knownBills("t1")).toEqual([{ categoryId: "cat-rent", status: "active" }]);
    expect(knownBills("t2")).toBeNull();
  });

  test("knows nothing after it is forgotten", () => {
    rememberBills("t1", []);
    forgetBills();
    expect(knownBills("t1")).toBeNull();
  });
});

describe("Make it a bill? suggestions", () => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const power = homeCategory("cat-power", "Electricity (Kuryente)", "utilities");
  const ice = homeCategory("cat-ice", "Ice (Yelo)", "ingredients");
  const powerSeeded = { ...power, systemKey: "electricity" };

  const paidPower = [
    homeExpense({ id: "p8", categoryId: "cat-power", amountCents: 610_000, spentOn: "2026-08-24" }),
    homeExpense({ id: "p9", categoryId: "cat-power", amountCents: 630_000, spentOn: "2026-09-25" }),
  ];

  function pick(overrides: Partial<PickSuggestionInput> = {}) {
    return pickBillSuggestion({
      expenses: paidPower,
      categories: [powerSeeded, ice],
      bills: [],
      today: "2026-10-22",
      dismissed: {},
      nowMs: HOME_NOW,
      monthName: (month) => monthLabel(month, HOME_NOW),
      ...overrides,
    });
  }

  test("kuryente paid around the 24th in August and September becomes one suggestion", () => {
    expect(pick()).toEqual({
      categoryId: "cat-power",
      name: "Kuryente",
      typicalDay: 25,
      typicalCents: 620_000,
      monthNames: ["August", "September"],
    });
  });

  test("never ingredients, never a category that already has a bill", () => {
    const iceRows = [
      homeExpense({ id: "i8", categoryId: "cat-ice", spentOn: "2026-08-02" }),
      homeExpense({ id: "i9", categoryId: "cat-ice", spentOn: "2026-09-02" }),
    ];
    expect(pick({ expenses: iceRows })).toBeNull();
    expect(pick({ bills: [{ categoryId: "cat-power", status: "active" }] })).toBeNull();
  });

  test("Not now hides it for 30 days, then it may come back", () => {
    const dismissed = withDismissal({}, "cat-power", HOME_NOW);
    expect(pick({ dismissed })).toBeNull();
    expect(pick({ dismissed, nowMs: HOME_NOW + (SUGGESTION_SNOOZE_DAYS - 1) * DAY_MS })).toBeNull();
    expect(pick({ dismissed, nowMs: HOME_NOW + SUGGESTION_SNOOZE_DAYS * DAY_MS })?.categoryId).toBe("cat-power");
  });

  test("stored dismissals are read defensively", () => {
    expect(activeDismissals("nope", HOME_NOW)).toEqual({});
    expect(activeDismissals(["cat-power"], HOME_NOW)).toEqual({});
    expect(activeDismissals({ a: "x", b: HOME_NOW, c: HOME_NOW + DAY_MS }, HOME_NOW)).toEqual({ b: HOME_NOW });
  });

  test("months are the 3 full months before today's, oldest first", () => {
    expect(lastFullMonths("2026-10-22")).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(lastFullMonths("2026-01-05")).toEqual(["2025-10", "2025-11", "2025-12"]);
    expect(monthsPaid(paidPower, "cat-power", "2026-10-22")).toEqual(["2026-08", "2026-09"]);
  });
});
