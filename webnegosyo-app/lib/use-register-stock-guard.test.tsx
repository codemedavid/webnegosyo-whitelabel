/**
 * Journey: the stock count covers 5 Iced Lattes and the cashier adds 7.
 * Bound to the real cart store, decision function and sheet — only the stock
 * read is replaced by fixed ceilings.
 *
 *   warn  → sheet → "Sell 5" leaves 5; "Sell anyway" leaves 7.
 *   block → a cashier cannot "Sell anyway" (a manager must sign in);
 *           "Sell 5" still works; a manager account sells 7.
 *   offline → never blocked.
 */

import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { StockShortSheet } from "../components/pos/StockShortSheet";
import { usePosCartStore } from "../stores/pos-cart-store";
import { useRegisterStockGuard } from "./use-register-stock-guard";
import { saleStockDemand, type PosStockCeilings } from "./pos-stock-warning";
import type { StockDecisionContext } from "./pos-stock-decision";

const LATTE = { menuItemId: "m-latte", name: "Iced Latte", listBasePrice: 150, basePrice: 150 };

const ceilingsOf = (latte: number): PosStockCeilings => ({
  dishes: new Map([["m-latte", latte]]),
  options: new Map(),
});

let pressCharge: () => void = () => {};

function Register({ ceilings, context }: { ceilings: PosStockCeilings; context: StockDecisionContext }) {
  const lines = usePosCartStore((s) => s.lines);
  const guard = useRegisterStockGuard({
    lines,
    demand: saleStockDemand(lines, null),
    ceilings,
    context,
    canClamp: true,
  });
  const addSeven = () =>
    guard.guardAdd({ menuItemId: LATTE.menuItemId, name: LATTE.name, quantity: 7, options: [] }, (units) =>
      usePosCartStore.getState().add({ ...LATTE, quantity: units, selections: [] }),
    );
  pressCharge = () =>
    guard.guardCharge(onTender, (changes) =>
      changes.forEach(({ key, quantity }) => usePosCartStore.getState().setQty(key, quantity)),
    );
  return (
    <>
      <AddButton onPress={addSeven} />
      <StockShortSheet {...guard.sheet} />
    </>
  );
}

function AddButton({ onPress }: { onPress: () => void }) {
  const { Text } = jest.requireActual("react-native");
  return <Text onPress={onPress}>Add 7 lattes</Text>;
}

const onTender = jest.fn();
const latteUnits = () =>
  usePosCartStore.getState().lines.reduce((sum, line) => sum + (line.menuItemId === "m-latte" ? line.quantity : 0), 0);

const WARN: StockDecisionContext = { policy: "warn", isOnline: true, canSellShort: false };
const BLOCK_CASHIER: StockDecisionContext = { policy: "block", isOnline: true, canSellShort: false };
const BLOCK_MANAGER: StockDecisionContext = { policy: "block", isOnline: true, canSellShort: true };
const BLOCK_OFFLINE: StockDecisionContext = { policy: "block", isOnline: false, canSellShort: false };

beforeEach(() => {
  onTender.mockReset();
  act(() => usePosCartStore.getState().reset());
});

function addSevenAgainstFive(context: StockDecisionContext) {
  render(<Register ceilings={ceilingsOf(5)} context={context} />);
  fireEvent.press(screen.getByText("Add 7 lattes"));
  expect(screen.getByText("Only 5 left")).toBeTruthy();
  expect(screen.getByText("You're adding 7 × Iced Latte. Stock covers 5.")).toBeTruthy();
}

describe("register stock journey: 5 in stock, cashier adds 7", () => {
  it("adds straight away when the count covers it", () => {
    render(<Register ceilings={ceilingsOf(20)} context={WARN} />);
    fireEvent.press(screen.getByText("Add 7 lattes"));
    expect(screen.queryByText(/left$/)).toBeNull();
    expect(latteUnits()).toBe(7);
  });

  it("adds straight away with no stock read (no opinion)", () => {
    render(<Register ceilings={{ dishes: new Map(), options: new Map() }} context={BLOCK_CASHIER} />);
    fireEvent.press(screen.getByText("Add 7 lattes"));
    expect(latteUnits()).toBe(7);
  });

  it("warn: Sell 5 leaves 5 in the sale", () => {
    addSevenAgainstFive(WARN);
    fireEvent.press(screen.getByText("Sell 5"));
    expect(latteUnits()).toBe(5);
    expect(screen.queryByText("Only 5 left")).toBeNull();
  });

  it("warn: Sell anyway leaves 7, and Charge asks once more", () => {
    addSevenAgainstFive(WARN);
    fireEvent.press(screen.getByText("Sell anyway"));
    expect(latteUnits()).toBe(7);

    act(() => pressCharge());
    expect(screen.getByText("This sale has 7 × Iced Latte. Stock covers 5.")).toBeTruthy();
    fireEvent.press(screen.getByText("Sell anyway"));
    expect(onTender).toHaveBeenCalledTimes(1);
    expect(latteUnits()).toBe(7);
  });

  it("warn: Sell 5 at Charge cuts the cart to 5 and goes on to tender", () => {
    addSevenAgainstFive(WARN);
    fireEvent.press(screen.getByText("Sell anyway"));
    act(() => pressCharge());
    fireEvent.press(screen.getByText("Sell 5"));
    expect(latteUnits()).toBe(5);
    expect(onTender).toHaveBeenCalledTimes(1);
  });

  it("Cancel adds nothing", () => {
    addSevenAgainstFive(WARN);
    fireEvent.press(screen.getByText("Cancel"));
    expect(latteUnits()).toBe(0);
  });

  it("block: a cashier cannot sell anyway — a manager must sign in", () => {
    addSevenAgainstFive(BLOCK_CASHIER);
    expect(screen.getByText(/Ask a manager to sign in/)).toBeTruthy();
    fireEvent.press(screen.getByText("Sell anyway"));
    expect(latteUnits()).toBe(0);
    expect(screen.getByText("Only 5 left")).toBeTruthy();

    fireEvent.press(screen.getByText("Sell 5"));
    expect(latteUnits()).toBe(5);
    act(() => pressCharge());
    expect(onTender).toHaveBeenCalledTimes(1);
  });

  it("block: Charge refuses to tender a short sale for a cashier", () => {
    act(() => usePosCartStore.getState().add({ ...LATTE, quantity: 7, selections: [] }));
    render(<Register ceilings={ceilingsOf(5)} context={BLOCK_CASHIER} />);
    act(() => pressCharge());
    fireEvent.press(screen.getByText("Sell anyway"));
    expect(onTender).not.toHaveBeenCalled();
  });

  it("block: a signed-in manager sells 7", () => {
    addSevenAgainstFive(BLOCK_MANAGER);
    fireEvent.press(screen.getByText("Sell anyway"));
    expect(latteUnits()).toBe(7);
  });

  it("block offline: never blocked", () => {
    addSevenAgainstFive(BLOCK_OFFLINE);
    fireEvent.press(screen.getByText("Sell anyway"));
    expect(latteUnits()).toBe(7);
  });
});
