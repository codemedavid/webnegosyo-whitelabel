import React from "react";
import { StyleSheet } from "react-native";
import { render, screen } from "@testing-library/react-native";

import { spacing } from "../../theme/colors";
import { DeliveryExpensePrompt } from "./DeliveryExpensePrompt";

let mockInsetBottom = 0;
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: mockInsetBottom, left: 0, right: 0 }),
}));
jest.mock("../../lib/expenses/use-expenses", () => ({
  useCanManageExpenses: () => true,
  useExpenseCategories: () => ({
    categories: [{ id: "ingredients", systemKey: "ingredients", name: "Ingredients" }],
  }),
}));
jest.mock("../expenses/AddExpenseSheet", () => ({ AddExpenseSheet: () => null }));

const delivery = { reason: "receive" as const, quantity: 2, unitCost: 525, itemName: "LPG tank" };

function promptStyle() {
  return StyleSheet.flatten(screen.getByTestId("delivery-expense-prompt").props.style);
}

describe("DeliveryExpensePrompt", () => {
  it("sits clear of the home indicator on phones that have one", () => {
    // Arrange
    mockInsetBottom = 34;

    // Act
    render(<DeliveryExpensePrompt movement={delivery} onDismiss={jest.fn()} />);

    // Assert
    expect(promptStyle().bottom).toBe(34 + spacing.sm);
  });

  it("keeps its usual gap on phones without one", () => {
    mockInsetBottom = 0;
    render(<DeliveryExpensePrompt movement={delivery} onDismiss={jest.fn()} />);
    expect(promptStyle().bottom).toBe(spacing.xl);
  });

  it("lets its buttons wrap under the words on a narrow phone", () => {
    mockInsetBottom = 0;
    render(<DeliveryExpensePrompt movement={delivery} onDismiss={jest.fn()} />);
    expect(promptStyle().flexWrap).toBe("wrap");
    expect(screen.getByText("Record it")).toBeTruthy();
    expect(screen.getByText("LPG tank delivery")).toBeTruthy();
  });
});
