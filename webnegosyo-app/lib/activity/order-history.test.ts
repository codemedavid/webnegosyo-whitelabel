import { collapseTimeline, hasOpenRequest, toTimelineNodes } from "./order-history";
import { activityEvent } from "./test-fixtures";

describe("toTimelineNodes", () => {
  it("reads oldest first, like a story", () => {
    const nodes = toTimelineNodes([
      activityEvent("order.cancelled", { id: "c", occurredAt: "2026-10-12T04:30:00.000Z", orderNumber: "#22" }),
      activityEvent("order.placed", { id: "p", occurredAt: "2026-10-12T04:00:00.000Z", orderNumber: "#22" }),
    ]);
    expect(nodes.map((node) => node.id)).toEqual(["p", "c"]);
  });

  it("gives every node a word and a shape, never colour alone", () => {
    const [paid, edited, cancelled, refunded, other] = toTimelineNodes([
      activityEvent("payment.marked_paid", { occurredAt: "2026-10-12T04:00:00.000Z" }),
      activityEvent("order.edited", { occurredAt: "2026-10-12T04:01:00.000Z" }),
      activityEvent("order.cancelled", { occurredAt: "2026-10-12T04:02:00.000Z" }),
      activityEvent("refund.issued", { occurredAt: "2026-10-12T04:03:00.000Z" }),
      activityEvent("order.status_changed", { occurredAt: "2026-10-12T04:04:00.000Z" }),
    ]);
    expect([paid.word, paid.shape, paid.tone]).toEqual(["Paid", "dot", "success"]);
    expect([edited.word, edited.shape, edited.tone]).toEqual(["Edited", "diamond", "warning"]);
    expect([cancelled.word, cancelled.shape, cancelled.tone]).toEqual(["Cancelled", "cross", "danger"]);
    expect([refunded.word, refunded.shape, refunded.tone]).toEqual(["Refunded", "cross", "danger"]);
    expect([other.shape, other.tone]).toEqual(["ring", "neutral"]);
  });

  it("puts the time and first name on the meta line, and keeps the reason", () => {
    const [node] = toTimelineNodes([
      activityEvent("order.cancelled", { occurredAt: "2026-10-12T04:11:00.000Z", reason: "Customer left" }),
    ]);
    expect(node.meta).toBe("12:11 PM · Ana");
    expect(node.reason).toBe("Customer left");
  });

  it("names nobody when the system did it", () => {
    const [node] = toTimelineNodes([
      activityEvent("order.placed", { occurredAt: "2026-10-12T04:11:00.000Z", actorName: null, actorUserId: null }),
    ]);
    expect(node.meta).toBe("12:11 PM");
  });
});

describe("collapseTimeline", () => {
  const nodes = toTimelineNodes(
    Array.from({ length: 9 }, (_, index) =>
      activityEvent("order.status_changed", { occurredAt: `2026-10-12T04:0${index}:00.000Z` }),
    ),
  );

  it("shows the last four, newest at the bottom, and says how many are hidden", () => {
    const view = collapseTimeline(nodes, { collapsedCount: 4, isExpanded: false });
    expect(view.visible).toEqual(nodes.slice(5));
    expect(view.hiddenCount).toBe(5);
  });

  it("shows everything once expanded", () => {
    const view = collapseTimeline(nodes, { collapsedCount: 4, isExpanded: true });
    expect(view.visible).toHaveLength(9);
    expect(view.hiddenCount).toBe(0);
  });
});

describe("hasOpenRequest", () => {
  it("is true while the last request has no answer yet", () => {
    expect(hasOpenRequest([activityEvent("approval.requested", { occurredAt: "2026-10-12T04:00:00.000Z" })])).toBe(true);
    expect(
      hasOpenRequest([
        activityEvent("approval.requested", { occurredAt: "2026-10-12T04:00:00.000Z" }),
        activityEvent("approval.approved", { occurredAt: "2026-10-12T04:01:00.000Z" }),
      ]),
    ).toBe(false);
  });
});
