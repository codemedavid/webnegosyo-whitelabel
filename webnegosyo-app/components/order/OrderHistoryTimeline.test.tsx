import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { activityEvent } from "../../lib/activity/test-fixtures";
import { OrderHistoryTimeline } from "./OrderHistoryTimeline";

function minute(index: number): string {
  return `2026-10-12T04:${String(index).padStart(2, "0")}:00.000Z`;
}

describe("OrderHistoryTimeline", () => {
  it("names every node in words, oldest first, with the reason quoted", () => {
    render(
      <OrderHistoryTimeline
        events={[
          activityEvent("order.cancelled", { occurredAt: minute(30), orderNumber: "#22", reason: "Customer left" }),
          activityEvent("payment.marked_paid", { occurredAt: minute(11), orderNumber: "#22" }),
        ]}
      />,
    );
    const words = screen.getAllByText(/^(Paid|Cancelled)$/).map((node) => node.props.children);
    expect(words).toEqual(["Paid", "Cancelled"]);
    expect(screen.getByText("“Customer left”")).toBeTruthy();
  });

  it("shows the latest four until asked for all", () => {
    const events = Array.from({ length: 6 }, (_, index) =>
      activityEvent("order.status_changed", { occurredAt: minute(index), after: { status: "ready" }, orderNumber: `#${index}` }),
    );
    render(<OrderHistoryTimeline events={events} />);
    expect(screen.queryByText("Ana marked #0 ready")).toBeNull();
    fireEvent.press(screen.getByRole("button", { name: "Show all 6 events" }));
    expect(screen.getByText("Ana marked #0 ready")).toBeTruthy();
  });

  it("opens by itself while a request on the order is waiting", () => {
    const events = [
      ...Array.from({ length: 5 }, (_, index) =>
        activityEvent("order.status_changed", { occurredAt: minute(index), after: { status: "ready" }, orderNumber: `#${index}` }),
      ),
      activityEvent("approval.requested", { occurredAt: minute(20) }),
    ];
    render(<OrderHistoryTimeline events={events} />);
    expect(screen.getByText("Ana marked #0 ready")).toBeTruthy();
  });
});
