import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

import { BLIND_AMOUNT, BLIND_HANDOVER, MyShiftCard } from "./MyShiftCard";
import { CashMoveSheet } from "./CashMoveSheet";
import { PICKUP_COPY } from "../../lib/cash/shift-pickup";
import type { DrawerExpectationRead } from "../../lib/drawer-expectation";
import type { ShiftRecord } from "../../lib/shift-service";

const SHIFT: ShiftRecord = {
  id: "s1", outletId: null, staffUserId: "u1", staffName: "Ana", status: "open", openingFloat: 2000,
  openedAt: "2026-10-24T10:02:00Z", closedAt: null, closingCount: null, expectedCash: null, note: null,
  drawerId: "d1", drawerName: "Cashier 1", isZeroBalance: false, closedByName: null,
};

const READY: DrawerExpectationRead = {
  state: "ready",
  value: {
    summary: { saleCount: 31, grossTotal: 9215, cashTotal: 9215, nonCashTotal: 5830, changeGiven: 0, refundsPaid: 0 },
    moves: { payIn: 200, payOut: 450, collected: 2500 },
    reconciliation: { expectedInDrawer: 8465, floatToKeep: 2000, expectedTurnover: 6465 },
  },
} as unknown as DrawerExpectationRead;

function card(overrides: Partial<React.ComponentProps<typeof MyShiftCard>> = {}) {
  return (
    <MyShiftCard
      shift={SHIFT}
      expectation={READY}
      moves={[]}
      activityLine={null}
      nowMs={Date.parse("2026-10-24T14:14:00Z")}
      onCashMove={jest.fn()}
      onEndShift={jest.fn()}
      {...overrides}
    />
  );
}

describe("MyShiftCard (wave 2)", () => {
  it("has one primary action, End shift & remit, and a door to Shift sales", () => {
    const onEndShift = jest.fn();
    render(card({ onEndShift }));
    fireEvent.press(screen.getByTestId("my-shift-end"));
    expect(onEndShift).toHaveBeenCalled();
    expect(screen.getByTestId("my-shift-sales")).toBeTruthy();
  });

  it("in blind count hides the expected figure and cash sales, keeps the cashier's own moves", () => {
    render(card({ isBlind: true }));
    expect(screen.getByText(BLIND_AMOUNT)).toBeTruthy();
    expect(screen.getByText(BLIND_HANDOVER)).toBeTruthy();
    expect(screen.queryByText("My cash sales")).toBeNull();
    expect(screen.queryByLabelText(/Should be in your drawer:/)).toBeNull();
    expect(screen.getByText("Paid in")).toBeTruthy();
  });

  it("says which business day the shift counts toward", () => {
    render(card({ businessDayNote: "This shift counts toward Today · business day ends 4:00 AM" }));
    expect(screen.getByText("This shift counts toward Today · business day ends 4:00 AM")).toBeTruthy();
  });
});

describe("CashMoveSheet pickup Taken by", () => {
  const target = { shiftId: "s1", title: "Cash in / out", subtitle: "Cashier 1", kinds: ["collect" as const], expectedInDrawer: 8465, floatToKeep: 2000 };

  it("asks who took the cash before recording a pickup, then sends the taker", () => {
    const onSubmit = jest.fn();
    render(
      <CashMoveSheet target={target} isBusy={false} onSubmit={onSubmit} onClose={jest.fn()} pickupReceivers={[{ userId: "u-maria", name: "Maria" }]} />,
    );
    fireEvent.changeText(screen.getByLabelText("Cash pickup amount in pesos"), "2500");
    fireEvent.press(screen.getByLabelText("Record cash pickup"));
    expect(screen.getByText(PICKUP_COPY.required)).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId("taken-by-u-maria"));
    fireEvent.press(screen.getByLabelText("Record cash pickup"));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ kind: "collect", amount: 2500, takenBy: { kind: "person", userId: "u-maria", name: "Maria" } }));
  });

  it("offers the store safe, and asks nothing on a store that cannot record a taker", () => {
    const onSubmit = jest.fn();
    const { rerender } = render(<CashMoveSheet target={target} isBusy={false} onSubmit={onSubmit} onClose={jest.fn()} pickupReceivers={[]} />);
    expect(screen.getByTestId("taken-by-safe")).toBeTruthy();
    rerender(<CashMoveSheet target={target} isBusy={false} onSubmit={onSubmit} onClose={jest.fn()} />);
    expect(screen.queryByTestId("taken-by-safe")).toBeNull();
    fireEvent.changeText(screen.getByLabelText("Cash pickup amount in pesos"), "100");
    fireEvent.press(screen.getByLabelText("Record cash pickup"));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ takenBy: null }));
  });
});

import { ClockInCard } from "./ClockInCard";

describe("ClockInCard (Start shift upgrades)", () => {
  const board = [{ drawer: { id: "d1", outletId: null, name: "Cashier 1", startingCash: 2000, isZeroBalance: false, sortOrder: 0 }, state: "free" as const }];
  const periods = [
    { id: "day", name: "Day shift", startsMinutes: 720, endsMinutes: 1200 },
    { id: "night", name: "Night shift", startsMinutes: 1200, endsMinutes: 120 },
  ];

  it("confirms the usual float, says a difference, and starts on the preselected named shift", () => {
    const onClockIn = jest.fn();
    render(
      <ClockInCard board={board} isBusy={false} canManage={false} notice={null} onClockIn={onClockIn} onSetUpDrawers={jest.fn()} periods={periods} defaultPeriodId="day" />,
    );
    expect(screen.getByText("Usual float ₱2,000")).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText("Opening float in pesos"), "1950");
    expect(screen.getByText("₱50 less than the usual ₱2,000. We'll note it for the owner.")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Start shift"));
    expect(onClockIn).toHaveBeenCalledWith("d1", "1950", { servicePeriodId: "day", denominations: null });
  });

  it("lets the cashier pick another named shift", () => {
    const onClockIn = jest.fn();
    render(
      <ClockInCard board={board} isBusy={false} canManage={false} notice={null} onClockIn={onClockIn} onSetUpDrawers={jest.fn()} periods={periods} defaultPeriodId="day" />,
    );
    fireEvent.press(screen.getByTestId("period-night"));
    fireEvent.press(screen.getByLabelText("Start shift"));
    expect(onClockIn).toHaveBeenCalledWith("d1", "2000", expect.objectContaining({ servicePeriodId: "night" }));
  });
});
