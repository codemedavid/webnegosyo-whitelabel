/**
 * Tapping a greyed "Sold out" tile: says why, never adds the dish, and lets a
 * menu holder sell it anyway until end of day (through the stock-aware
 * dish switch — re-sent with sellAnyway when the count says it can't be made).
 */

import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockSetDishAvailability = jest.fn();
jest.mock("../../lib/dish-availability", () => ({
  setDishAvailability: (...args: unknown[]) => mockSetDishAvailability(...args),
}));
jest.mock("../../lib/query/use-pos-catalog", () => ({
  DISH_SOLD_OUT_REASON: "Marked sold out. Turn it back on in Products when you have it again.",
}));

import { SELL_UNTIL_END_OF_DAY, SOLD_OUT_SUMMARY, SoldOutSheet } from "./SoldOutSheet";
import { useSoldOutOverride, type SoldOutTarget } from "../../lib/use-sold-out-override";

const DISH_REASON = "Marked sold out. Turn it back on in Products when you have it again.";
const latte: SoldOutTarget = { menuItemId: "m-latte", name: "Iced Latte", reason: DISH_REASON };

let openSheet: (target: SoldOutTarget) => void = () => {};

function Harness({ canChangeMenu, onTurnedOn }: { canChangeMenu: boolean; onTurnedOn: (id: string) => void }) {
  const override = useSoldOutOverride({ canChangeMenu, onTurnedOn });
  openSheet = override.open;
  return <SoldOutSheet override={override} />;
}

beforeEach(() => mockSetDishAvailability.mockReset());

describe("SoldOutSheet", () => {
  it("says the dish is sold out and why, with only OK for a cashier", () => {
    render(<Harness canChangeMenu={false} onTurnedOn={jest.fn()} />);
    act(() => openSheet(latte));

    expect(screen.getByText("Iced Latte is sold out")).toBeTruthy();
    expect(screen.getByText(SOLD_OUT_SUMMARY)).toBeTruthy();
    expect(screen.queryByText(SELL_UNTIL_END_OF_DAY)).toBeNull();
    fireEvent.press(screen.getByText("OK"));
    expect(screen.queryByText("Iced Latte is sold out")).toBeNull();
  });

  it("does not offer the override when a required choice is what's sold out", () => {
    render(<Harness canChangeMenu onTurnedOn={jest.fn()} />);
    act(() => openSheet({ ...latte, reason: "Every Milk choice is sold out, so this can't be made right now." }));
    expect(screen.queryByText(SELL_UNTIL_END_OF_DAY)).toBeNull();
  });

  it("turns a switched-off dish back on for a menu holder", async () => {
    const onTurnedOn = jest.fn();
    mockSetDishAvailability.mockResolvedValue({ status: "saved", isAvailable: true, snoozedUntil: null });
    render(<Harness canChangeMenu onTurnedOn={onTurnedOn} />);
    act(() => openSheet(latte));

    fireEvent.press(screen.getByText(SELL_UNTIL_END_OF_DAY));
    await waitFor(() => expect(onTurnedOn).toHaveBeenCalledWith("m-latte"));
    expect(mockSetDishAvailability).toHaveBeenCalledTimes(1);
    expect(mockSetDishAvailability).toHaveBeenCalledWith({ menuItemId: "m-latte", isAvailable: true });
    expect(screen.queryByText("Iced Latte is sold out")).toBeNull();
  });

  it("sells anyway until end of day when the count says it can't be made", async () => {
    const onTurnedOn = jest.fn();
    mockSetDishAvailability
      .mockResolvedValueOnce({ status: "needs_confirmation", blockers: [{ name: "Milk", onHand: 0, unit: "ml" }], sellAnywayUntil: "2026-11-04T16:00:00Z" })
      .mockResolvedValueOnce({ status: "saved", isAvailable: true, snoozedUntil: "2026-11-04T16:00:00Z" });
    render(<Harness canChangeMenu onTurnedOn={onTurnedOn} />);
    act(() => openSheet(latte));

    fireEvent.press(screen.getByText(SELL_UNTIL_END_OF_DAY));
    await waitFor(() => expect(onTurnedOn).toHaveBeenCalled());
    expect(mockSetDishAvailability).toHaveBeenLastCalledWith({ menuItemId: "m-latte", isAvailable: true, sellAnyway: true });
  });

  it("shows the route's error and keeps the sheet open", async () => {
    const onTurnedOn = jest.fn();
    mockSetDishAvailability.mockRejectedValue(new Error("Your account can't change the menu for this store."));
    render(<Harness canChangeMenu onTurnedOn={onTurnedOn} />);
    act(() => openSheet(latte));

    fireEvent.press(screen.getByText(SELL_UNTIL_END_OF_DAY));
    expect(await screen.findByText("Your account can't change the menu for this store.")).toBeTruthy();
    expect(onTurnedOn).not.toHaveBeenCalled();
    expect(screen.getByText("Iced Latte is sold out")).toBeTruthy();
  });
});
