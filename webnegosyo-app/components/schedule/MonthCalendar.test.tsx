/**
 * The month grid is the merchant's overview of what they have promised and
 * when. What a UI test can hold it to: every day is a button that says its
 * date and its load, the selected day is marked, the month can be paged, and
 * a day with nothing on it still says so rather than being silent.
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { MonthCalendar } from "./MonthCalendar";
import type { DayLoad } from "../../lib/schedule-calendar";

// Thu Sep 3 2026, 10:00 local.
const NOW = new Date(2026, 8, 3, 10).getTime();

const load = new Map<string, DayLoad>([
  ["2026-09-03", { total: 1, presell: 0, overdue: 1 }],
  ["2026-09-05", { total: 3, presell: 2, overdue: 0 }],
]);

function renderCalendar(overrides: Partial<React.ComponentProps<typeof MonthCalendar>> = {}) {
  const props = {
    cursor: { year: 2026, month: 8 },
    nowMs: NOW,
    load,
    selectedKey: "2026-09-03",
    onSelectDay: jest.fn(),
    onShiftMonth: jest.fn(),
    onJumpToday: jest.fn(),
    ...overrides,
  };
  render(<MonthCalendar {...props} />);
  return props;
}

describe("MonthCalendar", () => {
  it("titles the month and pages it with named buttons", () => {
    const props = renderCalendar();

    expect(screen.getByText("September 2026")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Next month" }));
    fireEvent.press(screen.getByRole("button", { name: "Previous month" }));

    expect(props.onShiftMonth).toHaveBeenNthCalledWith(1, 1);
    expect(props.onShiftMonth).toHaveBeenNthCalledWith(2, -1);
  });

  it("names every day by its date and load, and selects it on tap", () => {
    const props = renderCalendar();

    fireEvent.press(
      screen.getByRole("button", { name: "Sat, Sep 5, 3 orders, 2 pre-orders" }),
    );

    expect(props.onSelectDay).toHaveBeenCalledWith("2026-09-05");
    expect(screen.getByRole("button", { name: "Tomorrow, nothing scheduled" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Today, 1 order, 1 overdue" })).toBeTruthy();
  });

  it("marks the selected day for assistive tech", () => {
    renderCalendar({ selectedKey: "2026-09-05" });

    expect(
      screen.getByRole("button", { name: "Sat, Sep 5, 3 orders, 2 pre-orders", selected: true }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Today, 1 order, 1 overdue", selected: false })).toBeTruthy();
  });

  it("offers a way back to today only when the view has left it", () => {
    const props = renderCalendar({ cursor: { year: 2026, month: 10 } });

    expect(screen.getByText("November 2026")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Back to today" }));

    expect(props.onJumpToday).toHaveBeenCalledTimes(1);
  });

  it("hides the today shortcut while today is on screen and selected", () => {
    renderCalendar();

    expect(screen.queryByRole("button", { name: "Back to today" })).toBeNull();
  });
});
