import {
  billHref,
  hasBillsParams,
  makeBillHref,
  makeBillTarget,
  newBillHref,
  parseBillsParams,
  parseDayParam,
  repeatExpenseHref,
} from "./bills-route";

const BILL_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

describe("parseBillsParams", () => {
  it("opens one bill's sheet from bill=<id>", () => {
    expect(parseBillsParams({ bill: BILL_ID })).toEqual({ kind: "bill", billId: BILL_ID });
  });

  it("opens the add sheet pre-filled from new=1 and its values", () => {
    expect(parseBillsParams({ new: "1", category: "rent", amount: "1500000", day: "5", name: "Upa sa bodega" })).toEqual({
      kind: "new",
      prefill: { categoryId: "rent", amountCents: 1_500_000, day: 5, name: "Upa sa bodega" },
    });
  });

  it("opens an empty add sheet from new=1 alone", () => {
    expect(parseBillsParams({ new: "1" })).toEqual({
      kind: "new",
      prefill: { categoryId: null, amountCents: null, day: null, name: null },
    });
  });

  it("drops values it cannot trust instead of using them", () => {
    const intent = parseBillsParams({ new: "1", category: "rent; drop", amount: "-5", day: "32", name: "   " });
    expect(intent).toEqual({ kind: "new", prefill: { categoryId: null, amountCents: null, day: null, name: null } });
    expect(parseBillsParams({ new: "1", amount: "12.50" })).toMatchObject({ prefill: { amountCents: null } });
    expect(parseBillsParams({ new: "1", amount: "99999999999" })).toMatchObject({ prefill: { amountCents: null } });
  });

  it("keeps a long name to the bill's limit", () => {
    const intent = parseBillsParams({ new: "1", name: "x".repeat(90) });
    expect(intent?.kind === "new" && intent.prefill.name?.length).toBe(60);
  });

  it("asks for nothing without new=1 or bill", () => {
    expect(parseBillsParams({})).toBeNull();
    expect(parseBillsParams({ category: "rent" })).toBeNull();
    expect(parseBillsParams({ new: "0" })).toBeNull();
  });

  it("reads the first of repeated params", () => {
    expect(parseBillsParams({ bill: [BILL_ID, "other"] })).toEqual({ kind: "bill", billId: BILL_ID });
  });
});

describe("parseDayParam", () => {
  it("takes 1..31 and last", () => {
    expect(parseDayParam("1")).toBe(1);
    expect(parseDayParam("31")).toBe(31);
    expect(parseDayParam("last")).toBe("last");
    expect(parseDayParam("LAST")).toBe("last");
  });

  it("drops anything else", () => {
    expect(parseDayParam("0")).toBeNull();
    expect(parseDayParam("1.5")).toBeNull();
    expect(parseDayParam(undefined)).toBeNull();
  });
});

describe("hasBillsParams", () => {
  it("is true for any carried value and false for none", () => {
    expect(hasBillsParams({ new: "1" })).toBe(true);
    expect(hasBillsParams({ new: undefined, bill: "" })).toBe(false);
  });
});

describe("hrefs", () => {
  it("builds the add-bill link with only what is known", () => {
    expect(newBillHref()).toBe("/(main)/expense-bills?new=1");
    expect(newBillHref({ categoryId: "rent", amountCents: 1_500_000, day: "last", name: "Rent & lights" })).toBe(
      "/(main)/expense-bills?new=1&category=rent&amount=1500000&day=last&name=Rent%20%26%20lights",
    );
  });

  it("round-trips through the parser", () => {
    const href = newBillHref({ categoryId: "lpg", amountCents: 105_000, day: 12 });
    const query = Object.fromEntries(new URLSearchParams(href.split("?")[1]));
    expect(parseBillsParams(query)).toEqual({ kind: "new", prefill: { categoryId: "lpg", amountCents: 105_000, day: 12, name: null } });
  });

  it("builds the one-bill link", () => {
    expect(billHref(BILL_ID)).toBe(`/(main)/expense-bills?bill=${BILL_ID}`);
  });

  it("repeats an expense on the day it was spent", () => {
    expect(repeatExpenseHref({ categoryId: "internet", amountCents: 169_900, spentOn: "2026-10-07" })).toBe(
      "/(main)/expense-bills?new=1&category=internet&amount=169900&day=7",
    );
  });
});

describe("makeBillTarget", () => {
  it("reads a Make it a bill? action", () => {
    const target = makeBillTarget({ kind: "make_bill", categoryId: "water", typicalDay: 12, typicalCents: 84_000 });
    expect(target).toEqual({ categoryId: "water", typicalDay: 12, typicalCents: 84_000, name: null });
    expect(makeBillHref(target!)).toBe("/(main)/expense-bills?new=1&category=water&amount=84000&day=12");
  });

  it("ignores every other action", () => {
    expect(makeBillTarget({ kind: "sort" })).toBeNull();
    expect(makeBillTarget({ kind: "view", view: "check" })).toBeNull();
    expect(makeBillTarget(null)).toBeNull();
    expect(makeBillTarget({ kind: "make_bill" })).toBeNull();
  });

  it("falls back to safe values for a bad day or amount", () => {
    expect(makeBillTarget({ kind: "make_bill", categoryId: "water", typicalDay: 40, typicalCents: -3 })).toEqual({
      categoryId: "water",
      typicalDay: 1,
      typicalCents: 0,
      name: null,
    });
  });

  it("carries a suggested name into the link", () => {
    const target = makeBillTarget({ kind: "make_bill", categoryId: "water", typicalDay: 3, typicalCents: 84_000, name: "Tubig" });
    expect(makeBillHref(target!)).toBe("/(main)/expense-bills?new=1&category=water&amount=84000&day=3&name=Tubig");
  });
});
