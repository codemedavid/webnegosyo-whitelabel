/**
 * The "Only 5 left" sheet draws exactly what `pos-stock-decision.ts` decided:
 * the words, which buttons, and — on a block store — a disabled "Sell anyway"
 * with the reason under it.
 */

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { StockShortSheet } from "./StockShortSheet";
import { decideAddStock, decideChargeStock, MANAGER_NOTE, type StockQuestion } from "../../lib/pos-stock-decision";
import type { StockShortfall } from "../../lib/pos-stock-warning";

const shortfall: StockShortfall = {
  menuItemId: "m-latte",
  dishName: "Iced Latte",
  optionName: null,
  optionId: null,
  producible: 5,
  wanted: 7,
};

function questionOf(decision: ReturnType<typeof decideAddStock>): StockQuestion {
  if (decision.kind !== "ask") throw new Error("expected a question");
  return decision.question;
}

const handlers = () => ({ onSellWithin: jest.fn(), onSellAnyway: jest.fn(), onCancel: jest.fn() });

describe("StockShortSheet", () => {
  it("renders nothing without a question", () => {
    render(<StockShortSheet question={null} {...handlers()} />);
    expect(screen.queryByText("Cancel")).toBeNull();
  });

  it("asks Only 5 left with Sell 5, Sell anyway and Cancel", () => {
    const h = handlers();
    const question = questionOf(
      decideAddStock({ shortfall, addedQuantity: 7 }, { policy: "warn", isOnline: true, canSellShort: false }),
    );
    render(<StockShortSheet question={question} {...h} />);

    expect(screen.getByText("Only 5 left")).toBeTruthy();
    expect(screen.getByText("You're adding 7 × Iced Latte. Stock covers 5.")).toBeTruthy();

    fireEvent.press(screen.getByText("Sell 5"));
    expect(h.onSellWithin).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByText("Sell anyway"));
    expect(h.onSellAnyway).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByText("Cancel"));
    expect(h.onCancel).toHaveBeenCalledTimes(1);
  });

  it("has no Sell N when nothing is left", () => {
    const question = questionOf(
      decideAddStock(
        { shortfall: { ...shortfall, producible: 0, wanted: 1 }, addedQuantity: 1 },
        { policy: "warn", isOnline: true, canSellShort: false },
      ),
    );
    render(<StockShortSheet question={question} {...handlers()} />);

    expect(screen.getByText("None left")).toBeTruthy();
    expect(screen.queryByText(/^Sell \d/)).toBeNull();
    expect(screen.getByText("Sell anyway")).toBeTruthy();
  });

  it("lists every short dish at Charge", () => {
    const question = questionOf(
      decideChargeStock(
        { shortfalls: [shortfall, { ...shortfall, menuItemId: "m-cake", dishName: "Cake", producible: 1, wanted: 3 }], canClamp: true },
        { policy: "warn", isOnline: true, canSellShort: false },
      ),
    );
    render(<StockShortSheet question={question} {...handlers()} />);

    expect(screen.getByText("Not enough stock for 2 items")).toBeTruthy();
    expect(screen.getByText("Iced Latte: 7 in this sale, stock covers 5")).toBeTruthy();
    expect(screen.getByText("Cake: 3 in this sale, stock covers 1")).toBeTruthy();
    expect(screen.getByText("Sell what's in stock")).toBeTruthy();
  });

  it("block store: a cashier's Sell anyway is disabled and says a manager is needed", () => {
    const h = handlers();
    const question = questionOf(
      decideAddStock({ shortfall, addedQuantity: 7 }, { policy: "block", isOnline: true, canSellShort: false }),
    );
    render(<StockShortSheet question={question} {...h} />);

    expect(screen.getByText(MANAGER_NOTE)).toBeTruthy();
    fireEvent.press(screen.getByText("Sell anyway"));
    expect(h.onSellAnyway).not.toHaveBeenCalled();
    // Selling what is in stock is still one tap.
    fireEvent.press(screen.getByText("Sell 5"));
    expect(h.onSellWithin).toHaveBeenCalledTimes(1);
  });

  it("offline: says the count may be old", () => {
    const question = questionOf(
      decideAddStock({ shortfall, addedQuantity: 7 }, { policy: "block", isOnline: false, canSellShort: false }),
    );
    render(<StockShortSheet question={question} {...handlers()} />);
    expect(screen.getByText(/offline/)).toBeTruthy();
    expect(screen.queryByText(MANAGER_NOTE)).toBeNull();
  });
});
