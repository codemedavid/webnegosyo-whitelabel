import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { StaffCard } from "./StaffCard";
import { EMPTY_SHIFT_TOTALS } from "../../lib/staff-activity/shift-summary";
import { EMPTY_ACTIVITY } from "../../lib/staff-activity/activity";
import type { StaffDirectoryEntry } from "../../lib/staff-activity/staff-directory";

const NOW = Date.parse("2026-09-19T10:00:00Z");

function entry(overrides: Partial<StaffDirectoryEntry> = {}): StaffDirectoryEntry {
  return {
    userId: "ana",
    name: "Ana Cruz",
    email: "ana@x.com",
    isOwner: false,
    isFormer: false,
    outletId: null,
    permissions: ["pos"],
    defaultTab: null,
    joinedAt: "2026-01-05T00:00:00Z",
    activity: { ...EMPTY_ACTIVITY, posSales: 4, posSalesTotal: 1200, confirmed: 2, cancelled: 1 },
    shifts: { ...EMPTY_SHIFT_TOTALS, count: 2, workedMs: 8 * 3_600_000 },
    openShift: null,
    lastActiveAt: new Date(NOW - 3_600_000).toISOString(),
    ...overrides,
  };
}

const openShift = {
  id: "s1",
  outletId: null,
  staffUserId: "ana",
  staffName: "Ana Cruz",
  status: "open" as const,
  openingFloat: 500,
  expectedCash: null,
  closingCount: null,
  note: null,
  openedAt: new Date(NOW - 2 * 3_600_000).toISOString(),
  closedAt: null,
};

it("leads with what this person rang up and when they were last seen", () => {
  const screen = render(<StaffCard entry={entry()} isSelf={false} nowMs={NOW} onPress={jest.fn()} />);
  expect(screen.getByText("Ana Cruz")).toBeTruthy();
  expect(screen.getByText("₱1,200")).toBeTruthy();
  expect(screen.getByText("7")).toBeTruthy(); // every act in the window
  expect(screen.getByText("1h ago")).toBeTruthy();
});

it("says who is behind the counter right now instead of when they were last seen", () => {
  const screen = render(
    <StaffCard entry={entry({ openShift })} isSelf={false} nowMs={NOW} onPress={jest.fn()} />,
  );
  expect(screen.getByText("On shift")).toBeTruthy();
  expect(screen.getByText("On the counter now")).toBeTruthy();
});

it("opens the person's own screen when tapped", () => {
  const onPress = jest.fn();
  const screen = render(<StaffCard entry={entry()} isSelf={false} nowMs={NOW} onPress={onPress} />);
  fireEvent.press(screen.getByLabelText("Ana Cruz, open profile"));
  expect(onPress).toHaveBeenCalled();
});

it("marks the signed-in account so the owner knows which row is theirs", () => {
  const screen = render(<StaffCard entry={entry()} isSelf nowMs={NOW} onPress={jest.fn()} />);
  expect(screen.getByText("Ana Cruz (you)")).toBeTruthy();
});

it("names an account with no grants rather than printing an empty tag", () => {
  const screen = render(
    <StaffCard entry={entry({ permissions: [] })} isSelf={false} nowMs={NOW} onPress={jest.fn()} />,
  );
  expect(screen.getByText("No access yet")).toBeTruthy();
});

it("reads a person with no shifts as having no time on the floor, not zero hours", () => {
  const screen = render(<StaffCard entry={entry()} isSelf={false} nowMs={NOW} onPress={jest.fn()} />);
  expect(screen.getByText("8h 0m")).toBeTruthy();

  const quiet = render(
    <StaffCard entry={entry({ shifts: EMPTY_SHIFT_TOTALS })} isSelf={false} nowMs={NOW} onPress={jest.fn()} />,
  );
  expect(quiet.getByText("—")).toBeTruthy();
});
