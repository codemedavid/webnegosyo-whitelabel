/**
 * The choice side of the recipe editor: every flavour / size / add-on on a dish
 * is reachable and says whether it deducts anything, and the unit picker only
 * offers units that can ever convert to the ingredient's stock unit.
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { DishChoicesSection } from "./DishChoicesSection";
import { UnitPickerSheet } from "./UnitPickerSheet";
import { optionTarget, type OptionRecipeGroup } from "../../lib/recipe-target";

const GROUPS: OptionRecipeGroup[] = [
  {
    id: "g1",
    name: "Pick your flavours",
    choices: [
      { optionId: "o1", name: "Beef BBQ", target: optionTarget("m", "modifier_option", "o1") },
      { optionId: "o2", name: "Beef Teriyaki", target: optionTarget("m", "modifier_option", "o2") },
    ],
  },
];

describe("DishChoicesSection", () => {
  it("lists every choice with its ingredient count and opens the one tapped", () => {
    // Arrange
    const onOpen = jest.fn();
    render(<DishChoicesSection groups={GROUPS} coverage={{ "modifier_option:o1": 2 }} onOpen={onOpen} />);

    // Act
    fireEvent.press(screen.getByRole("button", { name: /Beef Teriyaki, No ingredients/ }));

    // Assert
    expect(screen.getByText("2 ingredients")).toBeTruthy();
    expect(screen.getByText(/on top of the dish's own recipe/)).toBeTruthy();
    expect(onOpen).toHaveBeenCalledWith(GROUPS[0].choices[1]);
  });

  it("does not claim 'no ingredients' when the counts could not be read", () => {
    render(<DishChoicesSection groups={GROUPS} coverage={null} onOpen={jest.fn()} />);
    expect(screen.queryByText("No ingredients")).toBeNull();
  });

  it("renders nothing for a dish without choices", () => {
    const { toJSON } = render(<DishChoicesSection groups={[]} coverage={{}} onOpen={jest.fn()} />);
    expect(toJSON()).toBeNull();
  });
});

describe("UnitPickerSheet", () => {
  const units = [
    { id: "pc", abbreviation: "pc", dimension: "count" as const },
    { id: "g", abbreviation: "g", dimension: "weight" as const },
    { id: "ml", abbreviation: "ml", dimension: "volume" as const },
  ];

  function renderPicker(stockUnitId: string | null) {
    render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <UnitPickerSheet
          ingredientName="Egg"
          units={units}
          selectedUnitId={stockUnitId}
          stockUnitId={stockUnitId}
          onPick={jest.fn()}
          onClose={jest.fn()}
        />
      </SafeAreaProvider>,
    );
  }

  it("offers only the count unit for an ingredient stocked by the piece", () => {
    renderPicker("pc");
    expect(screen.getByRole("button", { name: "pc, stock unit" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "g" })).toBeNull();
  });

  it("offers grams for an ingredient stocked in millilitres", () => {
    renderPicker("ml");
    expect(screen.getByRole("button", { name: "g" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "pc" })).toBeNull();
  });
});
