import { billsDue, stillToPay, type Bill, type BillPayment } from "../expenses/bill-schedule";
import { BILL_TODAY, billMark, billPayment, makeBill } from "../expenses/bill-test-fixtures";
import { billFindingCards, billForecastLine, billsForBranch, keepsBills } from "./profit-bills";
import { findingCards } from "./profit-findings";
import { findingHref } from "./profit-links";
import type { ProfitFinding } from "./profit-model";

const OCTOBER = { fromKey: "2026-10-01", toKey: "2026-10-22" };

function occurrencesOf(bills: Bill[], payments: BillPayment[] = [], marks = [] as ReturnType<typeof billMark>[]) {
  return billsDue(bills, { today: BILL_TODAY, payments, marks });
}

const rentGuess: ProfitFinding = {
  kind: "missing_recurring",
  severity: "warning",
  categoryId: "cat-rent",
  categoryName: "Rent (Upa)",
  systemKey: "rent",
  previousCents: 1_500_000,
};

describe("billFindingCards", () => {
  test("an unpaid rent due this period becomes a warning that opens the bill", () => {
    // Arrange: rent due on the 5th, paid in August and September only.
    const rent = makeBill();
    const occurrences = occurrencesOf([rent], [billPayment("2026-08-05"), billPayment("2026-09-05")]);

    // Act
    const cards = billFindingCards([rent], occurrences, OCTOBER);

    // Assert
    expect(cards).toEqual([
      {
        key: "bill:bill-rent",
        tone: "warning",
        icon: "calendar",
        title: "Rent is due on the 5th and not marked paid",
        detail: "₱15,000. Until it’s in, profit looks higher than it is.",
        action: { kind: "bill", label: "Pay", billId: "bill-rent" },
      },
    ]);
    expect(findingHref(cards[0].action as NonNullable<(typeof cards)[0]["action"]>)).toBe("/(main)/expense-bills?bill=bill-rent");
  });

  test("counts only the late dates inside the period", () => {
    const rent = makeBill();
    const occurrences = occurrencesOf([rent], [billPayment("2026-08-05")]);

    expect(billFindingCards([rent], occurrences, OCTOBER)[0].detail).toBe("₱15,000. Until it’s in, profit looks higher than it is.");
    expect(billFindingCards([rent], occurrences, { fromKey: "2026-09-01", toKey: "2026-10-22" })[0].detail).toBe(
      "₱30,000. 2 payments still open. Until they’re in, profit looks higher than it is.",
    );
  });

  test("an estimate says 'About'; a bill not yet due, snoozed or skipped is no finding", () => {
    const power = makeBill({ id: "bill-power", name: "Kuryente", amountCents: null, rule: { kind: "monthly", day: 10 } });
    const paid = [billPayment("2026-08-10", 600_000, "bill-power"), billPayment("2026-09-10", 640_000, "bill-power")];
    const future = makeBill({ id: "bill-net", name: "Internet", rule: { kind: "monthly", day: 30 }, startsOn: "2026-10-01" });

    const cards = billFindingCards([power, future], occurrencesOf([power, future], paid), OCTOBER);
    expect(cards.map((card) => card.detail)).toEqual(["About ₱6,200. Until it’s in, profit looks higher than it is."]);

    const skipped = occurrencesOf([power], paid, [billMark("2026-10-10", "skipped", null, "bill-power")]);
    expect(billFindingCards([power], skipped, OCTOBER)).toEqual([]);
  });
});

describe("findingCards with bills", () => {
  test("a store with bills drops the category guess and leads with its bills", () => {
    const rent = makeBill();
    const bills = billFindingCards([rent], occurrencesOf([rent], [billPayment("2026-09-05")]), OCTOBER);

    const cards = findingCards([rentGuess, { kind: "ingredient_estimate", severity: "info" }], "this month yet", false, {
      hasBills: true,
      cards: bills,
    });

    expect(cards.map((card) => card.key)).toEqual(["bill:bill-rent", "ingredient_estimate"]);
  });

  test("a store with bills that are all paid shows no rent warning at all", () => {
    const cards = findingCards([rentGuess], "this month yet", false, { hasBills: true, cards: [] });
    expect(cards).toEqual([]);
  });

  test("a store without bills, or bills not read yet, keeps the category guess", () => {
    expect(findingCards([rentGuess], "this month yet", false, { hasBills: false, cards: [] }).map((card) => card.key)).toEqual([
      "missing:cat-rent",
    ]);
    expect(findingCards([rentGuess], "this month yet").map((card) => card.key)).toEqual(["missing:cat-rent"]);
  });
});

describe("billsForBranch / keepsBills", () => {
  const storeWide = makeBill({ id: "a", outletId: null });
  const branchOne = makeBill({ id: "b", outletId: "outlet-1" });

  test("follows the profit figure's branch", () => {
    expect(billsForBranch([storeWide, branchOne], { outletId: null, unassigned: false }).map((bill) => bill.id)).toEqual(["a", "b"]);
    expect(billsForBranch([storeWide, branchOne], { outletId: "outlet-1", unassigned: false }).map((bill) => bill.id)).toEqual(["b"]);
    expect(billsForBranch([storeWide, branchOne], { outletId: null, unassigned: true }).map((bill) => bill.id)).toEqual(["a"]);
  });

  test("a stopped bill does not make a store a bills store", () => {
    expect(keepsBills([makeBill({ status: "ended" })])).toBe(false);
    expect(keepsBills([makeBill({ status: "paused" })])).toBe(true);
    expect(keepsBills([])).toBe(false);
  });
});

describe("billForecastLine", () => {
  const still = { cents: 1_620_000, count: 2, hasEstimate: true };

  test("what is left once the bills still to pay are paid", () => {
    expect(billForecastLine({ profitCents: 3_700_000, isCurrentPartialMonth: true, still })).toBe(
      "If you pay the 2 bills left: about ₱20,800 kept",
    );
  });

  test("exact when every amount is known; one bill reads singular", () => {
    expect(billForecastLine({ profitCents: 3_700_000, isCurrentPartialMonth: true, still: { cents: 1_500_000, count: 1, hasEstimate: false } })).toBe(
      "If you pay the 1 bill left: ₱22,000 kept",
    );
  });

  test("says 'lost' in words, never a minus", () => {
    expect(billForecastLine({ profitCents: 500_000, isCurrentPartialMonth: true, still })).toBe("If you pay the 2 bills left: about ₱11,200 lost");
  });

  test("nothing to say for a finished period or with nothing left to pay", () => {
    expect(billForecastLine({ profitCents: 3_700_000, isCurrentPartialMonth: false, still })).toBeNull();
    expect(billForecastLine({ profitCents: 3_700_000, isCurrentPartialMonth: true, still: { cents: 0, count: 0, hasEstimate: false } })).toBeNull();
    expect(billForecastLine({ profitCents: 3_700_000, isCurrentPartialMonth: true, still: null })).toBeNull();
  });

  test("works straight from the engine's still-to-pay", () => {
    const rent = makeBill({ rule: { kind: "monthly", day: 30 }, startsOn: "2026-09-01" });
    const occurrences = occurrencesOf([rent], [billPayment("2026-09-30")]);

    expect(billForecastLine({ profitCents: 4_000_000, isCurrentPartialMonth: true, still: stillToPay(occurrences, "2026-10") })).toBe(
      "If you pay the 1 bill left: ₱25,000 kept",
    );
  });
});
