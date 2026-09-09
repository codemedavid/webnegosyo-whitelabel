import React from "react";
import { render, fireEvent, screen } from "@testing-library/react-native";
import { ProductLifetimeRow, revenueBarPercent } from "./ProductLifetimeRow";

const LATTE = {
  menuItemId: "latte",
  menuItemName: "Latte",
  totalUnitsSold: 12,
  totalRevenue: 1200,
  bcgClassification: "star",
};

describe("revenueBarPercent", () => {
  it("scales against the leader and never hides a product that sold", () => {
    expect(revenueBarPercent(1200, 1200)).toBe(100);
    expect(revenueBarPercent(600, 1200)).toBe(50);
    expect(revenueBarPercent(1, 1200)).toBe(4);
    expect(revenueBarPercent(0, 1200)).toBe(0);
  });

  it("treats a leader with no revenue as a scale of one", () => {
    expect(revenueBarPercent(0, 0)).toBe(0);
  });
});

describe("ProductLifetimeRow", () => {
  it("shows rank, name, class, revenue and the cost prompt", () => {
    render(<ProductLifetimeRow item={LATTE} rank={3} maxRevenue={2400} onPress={jest.fn()} />);
    expect(screen.getByText("#3")).toBeTruthy();
    expect(screen.getByText("Latte")).toBeTruthy();
    expect(screen.getByText("Star")).toBeTruthy();
    expect(screen.getByText(/12 sold/)).toBeTruthy();
    expect(screen.getByText(/tap to add cost/)).toBeTruthy();
  });

  it("shows the margin once a cost is known", () => {
    render(
      <ProductLifetimeRow
        item={{ ...LATTE, marginPercent: 42.4 }}
        rank={1}
        maxRevenue={1200}
        onPress={jest.fn()}
      />
    );
    expect(screen.getByText(/42% margin/)).toBeTruthy();
  });

  it("hands the tapped item back", () => {
    const onPress = jest.fn();
    render(<ProductLifetimeRow item={LATTE} rank={1} maxRevenue={1200} onPress={onPress} />);
    fireEvent.press(screen.getByRole("button"));
    expect(onPress).toHaveBeenCalledWith(LATTE);
  });
});
