import React from "react";
import { render } from "@testing-library/react-native";

import { DayHistoryList } from "./DayHistoryList";
import { groupActivityByDay } from "../../lib/staff-activity/staff-directory";
import type { OrderActivityEvent } from "../../lib/staff-activity/activity";
import type { ShiftRecord } from "../../lib/shift-service";

const NOW_ISO = "2026-09-19T10:00:00Z";
const NOW = Date.parse(NOW_ISO);

function event(overrides: Partial<OrderActivityEvent> = {}): OrderActivityEvent {
  return {
    id: "e1",
    externalOrderId: "abcdef123456",
    event: "status_changed",
    status: "confirmed",
    source: "online",
    orderTotal: 250,
    actorUserId: "ana",
    actorName: "Ana Cruz",
    occurredAt: "2026-09-19T03:00:00Z",
    ...overrides,
  };
}

const shift: ShiftRecord = {
  id: "s1",
  outletId: null,
  staffUserId: "ana",
  staffName: "Ana Cruz",
  status: "closed",
  openingFloat: 500,
  expectedCash: 1500,
  closingCount: 1500,
  note: null,
  openedAt: "2026-09-19T01:00:00Z",
  closedAt: "2026-09-19T09:00:00Z",
};

it("leads each day with its own totals and the drawer that was open", () => {
  const days = groupActivityByDay(
    [event(), event({ id: "p", event: "placed", status: "pending", source: "pos", orderTotal: 320 })],
    [shift],
  );
  const screen = render(<DayHistoryList days={days} nowIso={NOW_ISO} nowMs={NOW} />);
  expect(screen.getByText("Today")).toBeTruthy();
  expect(screen.getByText("1 rang up (₱320) · 1 confirmed")).toBeTruthy();
  expect(screen.getByText(/9:00 AM – 5:00 PM/)).toBeTruthy();
});

it("names each act and the order it was", () => {
  const screen = render(
    <DayHistoryList days={groupActivityByDay([event()], [])} nowIso={NOW_ISO} nowMs={NOW} />,
  );
  expect(screen.getByText("Confirmed")).toBeTruthy();
  expect(screen.getByText("#123456 · web order")).toBeTruthy();
});

it("says so when a day was spent on shift with no orders", () => {
  const screen = render(
    <DayHistoryList days={groupActivityByDay([], [shift])} nowIso={NOW_ISO} nowMs={NOW} />,
  );
  expect(screen.getByText("On shift, no orders handled")).toBeTruthy();
});

it("warns when the window was cut short", () => {
  const screen = render(
    <DayHistoryList days={groupActivityByDay([event()], [])} nowIso={NOW_ISO} nowMs={NOW} isTruncated />,
  );
  expect(screen.getByText(/more activity than one page holds/)).toBeTruthy();
});

it("explains an empty period instead of rendering nothing", () => {
  const screen = render(<DayHistoryList days={[]} nowIso={NOW_ISO} nowMs={NOW} />);
  expect(screen.getByText("Nothing recorded in this period")).toBeTruthy();
});
