/**
 * The product performance pieces a merchant reads: the favourite variation is
 * marked, add-ons are described the way people say it, an estimated figure is
 * marked as one, and a product row opens its page.
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { AddonList, VariationMixCard } from "./breakdowns";
import { DeltaPill, InsightList } from "./parts";
import { ProductRankRow } from "./rows";

describe("VariationMixCard", () => {
  const group = {
    groupName: "Size",
    unchosenUnits: 5,
    options: [
      { name: "Large", units: 60, sales: 9000, orders: 50, share: 0.6 },
      { name: "Regular", units: 35, sales: 4500, orders: 30, share: 0.35 },
    ],
  };

  it("names the favourite and shows every option's share", () => {
    // Act
    render(<VariationMixCard group={group} productUnits={100} />);

    // Assert
    expect(screen.getByText("Favourite")).toBeTruthy();
    expect(screen.getByText("60%")).toBeTruthy();
    expect(screen.getByText("35%")).toBeTruthy();
  });

  it("shows the units sold with nothing chosen instead of hiding them", () => {
    render(<VariationMixCard group={group} productUnits={100} />);

    expect(screen.getByText("No size chosen")).toBeTruthy();
    expect(screen.getByText("5%")).toBeTruthy();
  });
});

describe("AddonList", () => {
  it("says how often an add-on rides along and marks an estimated price", () => {
    // Act
    render(
      <AddonList
        addons={[
          { name: "Extra Shot", groupName: "Add-ons", units: 30, attachedUnits: 25, attachRate: 0.25, revenue: 900, revenueIsEstimate: true },
          { name: "Mystery", groupName: "Add-ons", units: 2, attachedUnits: 2, attachRate: 0.02, revenue: null, revenueIsEstimate: false },
        ]}
      />
    );

    // Assert
    expect(screen.getByText(/1 in 4 add it/)).toBeTruthy();
    expect(screen.getByText("≈ ₱900")).toBeTruthy();
    expect(screen.getByText("No price")).toBeTruthy();
    expect(screen.getByText(/today's menu price/)).toBeTruthy();
  });

  it("adds no footnote when every price was recorded", () => {
    render(
      <AddonList
        addons={[
          { name: "Bacon", groupName: "Add-ons", units: 4, attachedUnits: 4, attachRate: 0.6, revenue: 80, revenueIsEstimate: false },
        ]}
      />
    );

    expect(screen.getByText("₱80")).toBeTruthy();
    expect(screen.queryByText(/today's menu price/)).toBeNull();
  });
});

describe("DeltaPill", () => {
  it("reads as a direction and a percentage", () => {
    render(<DeltaPill change={0.123} />);

    expect(screen.getByText("▲ 12%")).toBeTruthy();
    expect(screen.getByLabelText("Up 12 percent")).toBeTruthy();
  });

  it("shows a dash when there is nothing to compare against", () => {
    render(<DeltaPill change={null} />);

    expect(screen.getByText("—")).toBeTruthy();
  });
});

describe("InsightList", () => {
  it("renders each sentence", () => {
    render(<InsightList insights={[{ tone: "tip", text: "1 in 4 add Extra Shot." }]} />);

    expect(screen.getByText("1 in 4 add Extra Shot.")).toBeTruthy();
  });
});

describe("ProductRankRow", () => {
  it("is a button that opens the product", () => {
    // Arrange
    const onPress = jest.fn();
    render(
      <ProductRankRow
        rank={1}
        leaderSales={9000}
        showChange
        onPress={onPress}
        product={{
          menuItemId: "latte",
          name: "Latte",
          imageUrl: null,
          units: 60,
          sales: 9000,
          orders: 50,
          share: 0.5,
          salesChange: 0.1,
          daily: [],
          topVariation: { groupName: "Size", name: "Large", share: 0.6 },
          addonRevenue: 0,
        }}
      />
    );

    // Act
    fireEvent.press(screen.getByRole("button", { name: /Latte/ }));

    // Assert
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Mostly Large · 60%/)).toBeTruthy();
  });
});
