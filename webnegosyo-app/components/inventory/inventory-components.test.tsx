/**
 * The Stock screen's building blocks, rendered.
 *
 * What is pinned is what a merchant (and a screen reader) can act on: the
 * hero's counts are the level filter, every shortcut is a named button, a row
 * reads as a sentence, and the picker hands back the ingredient AND the reason
 * it was opened for.
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { InventoryHero } from "./InventoryHero";
import { InventoryActionBar } from "./InventoryActionBar";
import { CategoryChips } from "./CategoryChips";
import { IngredientPickerSheet } from "./IngredientPickerSheet";
import { InventoryStockCard } from "../InventoryStockCard";
import type { StockItemView, StockSummary } from "../../lib/inventory-stock";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

function view(overrides: Partial<StockItemView> = {}): StockItemView {
  return {
    id: "i1",
    name: "Bread flour",
    quantity: 3,
    reorderLevel: 5,
    stockUnitId: "kg",
    unitAbbreviation: "kg",
    level: "low",
    category: "Dry goods",
    unitCost: 50,
    isPrep: false,
    ...overrides,
  };
}

const SUMMARY: StockSummary = {
  outCount: 1,
  lowCount: 2,
  okCount: 7,
  total: 10,
  needsAttention: 3,
  headline: "1 ingredient out of stock, 2 running low",
};

describe("InventoryHero", () => {
  it("shows the stock value, the stocked share and the headline", () => {
    render(
      <InventoryHero
        summary={SUMMARY}
        value={{ total: 48250, uncostedCount: 0 }}
        levelFilter="all"
        onToggleLevel={() => {}}
      />,
    );

    expect(screen.getByText("₱48,250")).toBeTruthy();
    expect(screen.getByText("70%")).toBeTruthy();
    expect(screen.getByText(SUMMARY.headline)).toBeTruthy();
  });

  it("filters by a level when its count is tapped, and says which one is active", () => {
    const onToggleLevel = jest.fn();
    const { rerender } = render(
      <InventoryHero summary={SUMMARY} value={{ total: 0, uncostedCount: 0 }} levelFilter="all" onToggleLevel={onToggleLevel} />,
    );

    fireEvent.press(screen.getByRole("button", { name: "2 Low" }));
    expect(onToggleLevel).toHaveBeenCalledWith("low");

    rerender(
      <InventoryHero summary={SUMMARY} value={{ total: 0, uncostedCount: 0 }} levelFilter="low" onToggleLevel={onToggleLevel} />,
    );
    expect(screen.getByRole("button", { name: "2 Low, filtering", selected: true })).toBeTruthy();
  });

  it("tells the merchant when some stock has no cost and the value is short", () => {
    render(
      <InventoryHero summary={SUMMARY} value={{ total: 100, uncostedCount: 3 }} levelFilter="all" onToggleLevel={() => {}} />,
    );
    expect(screen.getByText(/3 without a cost/)).toBeTruthy();
  });
});

describe("InventoryActionBar", () => {
  it("offers receive, count and waste, and transfer only with somewhere to send to", () => {
    const onAction = jest.fn();
    const { rerender } = render(<InventoryActionBar canTransfer={false} onAction={onAction} />);

    expect(screen.queryByRole("button", { name: "Transfer" })).toBeNull();
    fireEvent.press(screen.getByRole("button", { name: "Receive" }));
    expect(onAction).toHaveBeenCalledWith("receive");

    rerender(<InventoryActionBar canTransfer onAction={onAction} />);
    fireEvent.press(screen.getByRole("button", { name: "Transfer" }));
    expect(onAction).toHaveBeenCalledWith("transfer");
  });
});

describe("CategoryChips", () => {
  it("renders nothing without categories to choose between", () => {
    render(<CategoryChips chips={[]} selected={null} total={4} onSelect={() => {}} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("selects a category, and tapping it again goes back to all", () => {
    const onSelect = jest.fn();
    const chips = [
      { key: "Dairy", label: "Dairy", count: 2 },
      { key: "Produce", label: "Produce", count: 3 },
    ];
    const { rerender } = render(<CategoryChips chips={chips} selected={null} total={5} onSelect={onSelect} />);

    fireEvent.press(screen.getByText("Dairy"));
    expect(onSelect).toHaveBeenLastCalledWith("Dairy");

    rerender(<CategoryChips chips={chips} selected="Dairy" total={5} onSelect={onSelect} />);
    fireEvent.press(screen.getByText("Dairy"));
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });
});

describe("InventoryStockCard", () => {
  it("reads as a sentence and opens the ingredient", () => {
    const onPress = jest.fn();
    render(<InventoryStockCard item={view()} onPress={onPress} />);

    fireEvent.press(screen.getByRole("button", { name: /Bread flour is down to 3 kg/ }));
    expect(onPress).toHaveBeenCalledWith(expect.objectContaining({ id: "i1" }));
  });

  it("shows the category and what the stock is worth", () => {
    render(<InventoryStockCard item={view()} />);
    expect(screen.getByText("Dry goods  ·  ₱150")).toBeTruthy();
  });

  it("says out of stock rather than printing a zero or a negative", () => {
    render(<InventoryStockCard item={view({ quantity: -2, level: "out" })} />);
    expect(screen.getByText("Out")).toBeTruthy();
    expect(screen.queryByText("-2")).toBeNull();
  });
});

describe("IngredientPickerSheet", () => {
  const shelf = [view(), view({ id: "i2", name: "Whole milk", unitAbbreviation: "L" })];

  it("searches the shelf and hands back the ingredient with the reason it was opened for", () => {
    const onPick = jest.fn();
    render(<IngredientPickerSheet reason="waste" shelf={shelf} onPick={onPick} onClose={() => {}} />);

    expect(screen.getByText("Record waste")).toBeTruthy();
    fireEvent.changeText(screen.getByPlaceholderText("Search ingredients"), "milk");
    expect(screen.queryByText("Bread flour")).toBeNull();

    fireEvent.press(screen.getByRole("button", { name: "Whole milk" }));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: "i2" }), "waste");
  });
});
