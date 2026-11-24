/**
 * Uncle Drei's, 2026-11-13: "4000" typed on a kilogram shelf (meant grams),
 * saved without a question, then fixed with a count the report read as
 * ₱1.45M lost. The sheet now asks ONCE about a figure that looks like a unit
 * slip; its fix fills the box, and a second tap on the same figure saves it.
 */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockSubmitStockMovement = jest.fn();
jest.mock("../lib/inventory-movement-service", () => ({
  submitStockMovement: (...args: unknown[]) => mockSubmitStockMovement(...args),
}));
jest.mock("../lib/use-has-permission", () => ({ useHasPermission: () => true }));
jest.mock("../lib/offline/local-id", () => ({ newLocalOrderId: () => "req-1" }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

import { StockMovementSheet } from "./StockMovementSheet";

const POWDER = {
  id: "i1",
  name: "Salted Caramel Powder",
  quantity: 1.717,
  reorderLevel: 0,
  stockUnitId: "kg",
  unitAbbreviation: "kg",
  level: "ok" as const,
};

function renderSheet() {
  const onRecorded = jest.fn();
  render(<StockMovementSheet tenantId="t1" item={POWDER} onClose={jest.fn()} onRecorded={onRecorded} />);
  return { onRecorded };
}

beforeEach(() => {
  mockSubmitStockMovement.mockReset();
  mockSubmitStockMovement.mockResolvedValue(undefined);
});

describe("StockMovementSheet: did you mean…?", () => {
  it("asks before adding 4000 kg; the fix fills 4 and saves 4", async () => {
    renderSheet();
    fireEvent.changeText(screen.getByPlaceholderText("0"), "4000");
    fireEvent.press(screen.getByText("Add to stock"));

    expect(screen.getByText("4,000 kg? That is 4 tonnes.")).toBeTruthy();
    expect(mockSubmitStockMovement).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText("Use 4 kg"));
    fireEvent.press(screen.getByText("Add to stock"));
    await waitFor(() => expect(mockSubmitStockMovement).toHaveBeenCalled());
    expect(mockSubmitStockMovement.mock.calls[0][1]).toMatchObject({ reason: "receive", quantity: 4 });
  });

  it("saves 4000 kg on the second, named tap", async () => {
    renderSheet();
    fireEvent.changeText(screen.getByPlaceholderText("0"), "4000");
    fireEvent.press(screen.getByText("Add to stock"));
    fireEvent.press(screen.getByText("Yes, add 4,000 kg"));
    await waitFor(() => expect(mockSubmitStockMovement).toHaveBeenCalled());
    expect(mockSubmitStockMovement.mock.calls[0][1]).toMatchObject({ quantity: 4000 });
  });

  it("an ordinary delivery with an ordinary kg price saves at once", async () => {
    renderSheet();
    fireEvent.changeText(screen.getByPlaceholderText("0"), "2");
    fireEvent.changeText(screen.getByPlaceholderText("Keeps the current cost if blank"), "256");
    fireEvent.press(screen.getByText("Add to stock"));
    await waitFor(() => expect(mockSubmitStockMovement).toHaveBeenCalled());
  });
});
