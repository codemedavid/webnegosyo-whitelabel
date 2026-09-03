/**
 * The day timeline is the agenda under the calendar: a time rail with the
 * orders due at each time. What it must guarantee: the day's heading and
 * totals are read out, overdue and due-soon times say so, each order opens,
 * and an empty day names the next day that has something on it.
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { DayTimeline } from "./DayTimeline";
import { groupByTime, type ScheduledOrder } from "../../lib/scheduled-orders";
import type { OrderCardOrder } from "../OrderCard";

// Thu Sep 3 2026, 10:00 local.
const NOW = new Date(2026, 8, 3, 10).getTime();
const atLocal = (d: number, h: number, min = 0) => new Date(2026, 8, d, h, min).getTime();

type TimelineOrder = ScheduledOrder<OrderCardOrder>;

function order(id: string, scheduledAtMs: number, extra: Partial<OrderCardOrder> = {}): TimelineOrder {
  return {
    _id: id,
    _creationTime: NOW - 60_000,
    customerName: `Customer ${id}`,
    total: 250,
    itemCount: 1,
    status: "confirmed",
    scheduledFor: new Date(scheduledAtMs).toISOString(),
    scheduledAtMs,
    ...extra,
  };
}

describe("DayTimeline", () => {
  it("heads the day with its label and totals, and opens each order", () => {
    const onOpenOrder = jest.fn();
    const orders = [
      order("a", atLocal(3, 9)), // overdue
      order("b", atLocal(3, 10, 30), { customerData: { presell_date: "2026-09-03" }, total: 1000 }),
      order("c", atLocal(3, 17)),
    ];
    render(
      <DayTimeline
        dayKey="2026-09-03"
        nowMs={NOW}
        groups={groupByTime(orders)}
        onOpenOrder={onOpenOrder}
      />,
    );

    expect(screen.getByText("Today")).toBeTruthy();
    expect(screen.getByText("3 orders · 1 pre-order · ₱1,500.00")).toBeTruthy();
    expect(screen.getByText("9:00 AM · Overdue")).toBeTruthy();
    expect(screen.getByText("10:30 AM · Due soon")).toBeTruthy();
    expect(screen.getByText("5:00 PM")).toBeTruthy();

    fireEvent.press(screen.getByText("Customer b"));
    expect(onOpenOrder).toHaveBeenCalledWith("b");
  });

  it("says an empty day is empty and points at the next day with orders", () => {
    const onJumpNext = jest.fn();
    render(
      <DayTimeline
        dayKey="2026-09-04"
        nowMs={NOW}
        groups={[]}
        onOpenOrder={() => {}}
        nextKey="2026-09-05"
        onJumpNext={onJumpNext}
      />,
    );

    expect(screen.getByText("Nothing tomorrow")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Next: Sat, Sep 5" }));
    expect(onJumpNext).toHaveBeenCalledWith("2026-09-05");
  });

  it("does not offer a jump when nothing lies ahead", () => {
    render(<DayTimeline dayKey="2026-09-04" nowMs={NOW} groups={[]} onOpenOrder={() => {}} />);

    expect(screen.queryByRole("button", { name: /^Next:/ })).toBeNull();
    expect(screen.getByText("Nothing tomorrow")).toBeTruthy();
  });
});
