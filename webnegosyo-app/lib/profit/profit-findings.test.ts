import { findingCard, findingCards } from "./profit-findings";
import type { ProfitFinding } from "./profit-model";

const PHRASE = "this month yet";

describe("findings as action rows", () => {
  it("turns a missing bill into a title, a reason and a button", () => {
    const finding: ProfitFinding = {
      kind: "missing_recurring",
      severity: "warning",
      categoryId: "rent",
      categoryName: "Rent (Upa)",
      systemKey: "rent",
      previousCents: 1_500_000,
    };
    expect(findingCard(finding, PHRASE)).toEqual({
      key: "missing:rent",
      tone: "warning",
      icon: "receipt",
      title: "No Rent (Upa) recorded this month yet",
      detail: "You paid ₱15,000 last time. Until it’s in, profit looks higher than it is.",
      action: { kind: "record", label: "Record", categoryId: "rent" },
    });
  });

  it("asks to give drawer pay-outs a category, in the app's words", () => {
    const card = findingCard({ kind: "unsorted_payouts", severity: "warning", count: 2, cents: 45_000 }, PHRASE);
    expect(card.title).toBe("Give these a category");
    expect(card.detail).toBe("2 drawer pay-outs (₱450) aren’t in Expenses yet.");
    expect(card.action).toEqual({ kind: "sort", label: "Open" });
  });

  it("keeps notes without a button", () => {
    const card = findingCard({ kind: "ingredient_estimate", severity: "info" }, PHRASE);
    expect(card.tone).toBe("info");
    expect(card.action).toBeNull();
    expect(card.title).toBe("Ingredients are an estimate");
  });

  it("has a title for every kind of finding", () => {
    const all: ProfitFinding[] = [
      { kind: "no_expenses", severity: "warning" },
      { kind: "uncosted_dishes", severity: "warning", uncostedDishes: 3, uncostedShare: 0.25 },
      { kind: "uncosted_movements", severity: "info", count: 1 },
      { kind: "dish_costs_hidden", severity: "info" },
      { kind: "store_wide_excluded", severity: "info", cents: 100_000 },
    ];
    const cards = findingCards(all, PHRASE);
    for (const card of cards) {
      expect(card.title.length).toBeGreaterThan(0);
      expect(card.detail.length).toBeGreaterThan(0);
    }
    expect(cards[0]).toMatchObject({ title: "No expenses recorded this month yet", action: { kind: "add", label: "Add expense" } });
    expect(cards[1]).toMatchObject({ detail: "3 dishes (25% of what sold) have no cost, so ingredients are estimated.", action: { kind: "recipes" } });
  });
});
