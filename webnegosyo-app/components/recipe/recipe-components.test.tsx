/**
 * The recipe editor's pieces: a line that only saves a real change and says
 * inline why an amount was refused, and an "Add" sheet that shows ingredients
 * already on the recipe instead of silently hiding them.
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { RecipeLineRow } from "./RecipeLineRow";
import { AddIngredientSheet } from "./AddIngredientSheet";
import type { IngredientOption, RecipeComponentView } from "../../lib/recipe-service";

const LINE: RecipeComponentView = {
  id: "comp-1",
  inventoryItemId: "ing-milk",
  ingredientName: "Fresh milk",
  quantity: 0.25,
  unitId: "unit-l",
  unitLabel: "L",
};

function renderRow(overrides: Partial<React.ComponentProps<typeof RecipeLineRow>> = {}) {
  const props = {
    line: LINE,
    onCommitQuantity: jest.fn(),
    onOpenUnits: jest.fn(),
    onRemove: jest.fn(),
    ...overrides,
  };
  render(<RecipeLineRow {...props} />);
  return props;
}

describe("RecipeLineRow", () => {
  it("shows the stored amount without numeric padding and its unit", () => {
    renderRow();

    expect(screen.getByLabelText("Amount of Fresh milk per sale")).toHaveProp("value", "0.25");
    expect(screen.getByRole("button", { name: "Unit for Fresh milk: L" })).toBeTruthy();
  });

  it("saves a changed amount, reading a decimal comma", () => {
    const props = renderRow();
    const input = screen.getByLabelText("Amount of Fresh milk per sale");

    fireEvent.changeText(input, "0,3");
    fireEvent(input, "endEditing");

    expect(props.onCommitQuantity).toHaveBeenCalledWith(0.3);
  });

  it("does not save when the amount did not change", () => {
    const props = renderRow();
    const input = screen.getByLabelText("Amount of Fresh milk per sale");

    fireEvent.changeText(input, "0.250");
    fireEvent(input, "endEditing");

    expect(props.onCommitQuantity).not.toHaveBeenCalled();
  });

  it("refuses zero inline instead of saving it", () => {
    const props = renderRow();
    const input = screen.getByLabelText("Amount of Fresh milk per sale");

    fireEvent.changeText(input, "0");
    fireEvent(input, "endEditing");

    expect(props.onCommitQuantity).not.toHaveBeenCalled();
    expect(screen.getByText(/more than 0/i)).toBeTruthy();
  });

  it("opens the unit picker and asks before removing", () => {
    const props = renderRow();

    fireEvent.press(screen.getByRole("button", { name: "Unit for Fresh milk: L" }));
    fireEvent.press(screen.getByRole("button", { name: "Remove Fresh milk" }));

    expect(props.onOpenUnits).toHaveBeenCalledTimes(1);
    expect(props.onRemove).toHaveBeenCalledTimes(1);
  });
});

const INGREDIENTS: IngredientOption[] = [
  { id: "ing-milk", name: "Fresh milk", stockUnitId: "unit-l", unitLabel: "L" },
  { id: "ing-beans", name: "Coffee beans", stockUnitId: "unit-g", unitLabel: "g" },
];

function renderSheet(onPick = jest.fn()) {
  render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <AddIngredientSheet
        visible
        ingredients={INGREDIENTS}
        components={[LINE]}
        onPick={onPick}
        onClose={jest.fn()}
      />
    </SafeAreaProvider>,
  );
  return onPick;
}

describe("AddIngredientSheet", () => {
  it("adds an ingredient that is not on the recipe yet", () => {
    const onPick = renderSheet();

    fireEvent.press(screen.getByRole("button", { name: "Add Coffee beans" }));

    expect(onPick).toHaveBeenCalledWith(INGREDIENTS[1]);
  });

  it("shows an ingredient already on the recipe as added, and does not add it twice", () => {
    const onPick = renderSheet();

    const added = screen.getByRole("button", { name: "Fresh milk, already added" });
    fireEvent.press(added);

    expect(onPick).not.toHaveBeenCalled();
  });

  it("explains an empty search", () => {
    renderSheet();

    fireEvent.changeText(screen.getByPlaceholderText("Search ingredients"), "flour");

    expect(screen.getByText(/no ingredient called/i)).toBeTruthy();
  });
});
