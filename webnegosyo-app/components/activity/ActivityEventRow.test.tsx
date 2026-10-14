import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { activityEvent } from "../../lib/activity/test-fixtures";
import { ActivityEventRow } from "./ActivityEventRow";

const REFUND = activityEvent("refund.issued", {
  occurredAt: "2026-10-12T04:33:00.000Z",
  amount: -185,
  orderNumber: "#14",
  reason: "Wrong item",
  approvedByName: "Marco Cruz",
});

describe("ActivityEventRow", () => {
  it("reads as one sentence on two lines with the signed amount and the time", () => {
    render(<ActivityEventRow event={REFUND} showBranch={false} canReview={false} onPress={jest.fn()} />);

    expect(screen.getByText("Ana refunded #14")).toBeTruthy();
    expect(screen.getByText("Wrong item · approved by Marco")).toBeTruthy();
    expect(screen.getByText("−₱185")).toBeTruthy();
    expect(screen.getByText("12:33 PM")).toBeTruthy();
  });

  it("is one accessible button whose label is the whole sentence", () => {
    render(<ActivityEventRow event={REFUND} showBranch={false} canReview={false} onPress={jest.fn()} />);
    expect(
      screen.getByRole("button", {
        name: "Money. Ana refunded order 14, minus 185 pesos. Wrong item, approved by Marco. 12:33 PM.",
      }),
    ).toBeTruthy();
  });

  it("shows an open flag as the word Check, and a reviewed one as Reviewed", () => {
    const flagged = { ...REFUND, flags: ["cash_refund_noncash_order" as const] };
    const { rerender } = render(<ActivityEventRow event={flagged} showBranch={false} canReview onPress={jest.fn()} />);
    expect(screen.getByText("Check")).toBeTruthy();

    rerender(
      <ActivityEventRow event={{ ...flagged, reviewedAt: "2026-10-12T05:00:00.000Z" }} showBranch={false} canReview onPress={jest.fn()} />,
    );
    expect(screen.queryByText("Check")).toBeNull();
    expect(screen.getByText("Reviewed")).toBeTruthy();
  });

  it("opens the event on tap", () => {
    const onPress = jest.fn();
    render(<ActivityEventRow event={REFUND} showBranch={false} canReview={false} onPress={onPress} />);
    fireEvent.press(screen.getByRole("button"));
    expect(onPress).toHaveBeenCalledWith(REFUND);
  });

  it("marks the system's own events instead of inventing a person", () => {
    render(
      <ActivityEventRow
        event={activityEvent("stock.duplicate_blocked", { actorName: null, actorUserId: null })}
        showBranch={false}
        canReview={false}
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByText("SYS")).toBeTruthy();
  });
});
