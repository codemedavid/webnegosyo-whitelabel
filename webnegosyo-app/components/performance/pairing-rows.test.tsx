/**
 * The Pairs view's rows: a strong item pair is flagged as a combo idea, a
 * category pair reads both directions, and each best seller lists its partners.
 */
import React from "react";
import { render, screen } from "@testing-library/react-native";

import type { PairRow } from "../../lib/pairings";
import { ItemPartnersCard, PairingSummary, PairRowView } from "./pairing-rows";

function pair(overrides: Partial<PairRow>): PairRow {
  return {
    anchor: { id: "burger", name: "Burger" },
    partner: { id: "fries", name: "Fries" },
    together: 12,
    share: 0.75,
    reverseShare: 0.4,
    lift: 2.1,
    strength: "always",
    suggestion: "combo",
    ...overrides,
  };
}

describe("PairRowView", () => {
  it("says how often the partner rides along and flags a combo idea", () => {
    render(<PairRowView pair={pair({})} kind="item" />);

    expect(screen.getByText("Fries is in 75% of Burger orders")).toBeTruthy();
    expect(screen.getByText("Combo idea")).toBeTruthy();
    expect(screen.getByText(/12 orders together/)).toBeTruthy();
  });

  it("marks a weaker pair as a pairing idea, and a faint one not at all", () => {
    const { rerender } = render(
      <PairRowView pair={pair({ share: 0.35, strength: "often", suggestion: "pairing" })} kind="item" />
    );
    expect(screen.getByText("Pairing idea")).toBeTruthy();

    rerender(<PairRowView pair={pair({ share: 0.1, strength: "sometimes", suggestion: null })} kind="item" />);
    expect(screen.queryByText(/idea/)).toBeNull();
  });

  it("reads a category pair in both directions without an offer badge", () => {
    render(
      <PairRowView
        pair={pair({ anchor: { id: "d", name: "Drinks" }, partner: { id: "m", name: "Mains" }, together: 1 })}
        kind="category"
      />
    );

    expect(screen.getByText("75% of Drinks orders also had Mains")).toBeTruthy();
    expect(screen.getByText(/1 order together · 40% the other way/)).toBeTruthy();
    expect(screen.queryByText("Combo idea")).toBeNull();
  });
});

describe("ItemPartnersCard", () => {
  it("lists each partner with its share of the item's orders", () => {
    render(
      <ItemPartnersCard
        entry={{
          item: { id: "burger", name: "Burger" },
          categoryName: "Mains",
          orders: 40,
          partners: [
            { id: "fries", name: "Fries", together: 30, share: 0.75 },
            { id: "coke", name: "Coke", together: 10, share: 0.25 },
          ],
        }}
      />
    );

    expect(screen.getByText("Mains · in 40 orders")).toBeTruthy();
    expect(screen.getByText("Fries")).toBeTruthy();
    expect(screen.getByText("75%")).toBeTruthy();
    expect(screen.getByText("25%")).toBeTruthy();
  });
});

describe("PairingSummary", () => {
  it("leads with the share of multi-item orders, or the partial-read note", () => {
    const props = {
      eyebrow: "Baskets · 30 days",
      multiItemShare: 0.42,
      orderCount: 100,
      multiItemOrders: 42,
      avgItemsPerOrder: 1.7,
    };
    const { rerender } = render(<PairingSummary {...props} partialNote={null} />);
    expect(screen.getByText("42%")).toBeTruthy();
    expect(screen.getByText("of orders had two or more different items")).toBeTruthy();
    expect(screen.getByText("1.7")).toBeTruthy();

    rerender(<PairingSummary {...props} partialNote="Too many orders to read at once." />);
    expect(screen.getByText("Too many orders to read at once.")).toBeTruthy();
  });
});
