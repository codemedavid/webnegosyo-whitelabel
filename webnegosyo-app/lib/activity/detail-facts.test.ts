import { canReviewEvent, detailFacts, openTarget, reviewedLine, whenWithSeconds } from "./detail-facts";
import { activityEvent } from "./test-fixtures";

const NOW = "2026-10-12T04:50:00.000Z";

describe("whenWithSeconds", () => {
  it("is the only place seconds appear", () => {
    expect(whenWithSeconds("2026-10-12T04:41:07.000Z", NOW)).toBe("Today, 12:41:07 PM");
    expect(whenWithSeconds("2026-10-06T00:05:09.000Z", NOW)).toBe("Tue 6 Oct, 8:05:09 AM");
  });
});

describe("detailFacts", () => {
  it("lists who, approver, when, where, reason, note and the change, skipping what is missing", () => {
    const event = activityEvent("menu.price_changed", {
      occurredAt: "2026-10-12T04:41:07.000Z",
      outletName: "Makati",
      approvedByName: "Lorna Santos",
      reason: "Supplier price went up",
      note: "From Monday",
      before: { price: 185 },
      after: { price: 195 },
    });
    expect(detailFacts(event, NOW)).toEqual([
      { label: "Who", value: "Ana Reyes" },
      { label: "Approved by", value: "Lorna Santos" },
      { label: "When", value: "Today, 12:41:07 PM" },
      { label: "Where", value: "Makati" },
      { label: "Reason", value: "Supplier price went up" },
      { label: "Note", value: "“From Monday”" },
      { label: "Before → after", value: "₱185 → ₱195" },
    ]);
  });

  it("names the system or the customer when nobody on the team did it", () => {
    const facts = detailFacts(activityEvent("stock.duplicate_blocked", { actorName: null, actorUserId: null }), NOW);
    expect(facts[0]).toEqual({ label: "Who", value: "System" });
    const guest = detailFacts(activityEvent("order.placed", { actorName: null, actorUserId: null }), NOW);
    expect(guest[0]).toEqual({ label: "Who", value: "Customer" });
  });

  it("shows status and quantity changes in words", () => {
    const status = detailFacts(activityEvent("order.status_changed", { before: { status: "pending" }, after: { status: "delivered" } }), NOW);
    expect(status.find((fact) => fact.label === "Before → after")?.value).toBe("Pending → Completed");
    const stock = detailFacts(activityEvent("stock.adjusted", { unit: "kg", before: { quantity: 4 }, after: { quantity: 2.5 } }), NOW);
    expect(stock.find((fact) => fact.label === "Before → after")?.value).toBe("4 kg → 2.5 kg");
  });
});

describe("reviewedLine", () => {
  it("says who reviewed and when", () => {
    const event = activityEvent("stock.counted", { reviewedAt: "2026-10-12T05:05:00.000Z", reviewedByName: "Lorna Santos" });
    expect(reviewedLine(event)).toBe("Reviewed by Lorna · 1:05 PM");
    expect(reviewedLine(activityEvent("stock.counted"))).toBeNull();
  });
});

describe("canReviewEvent", () => {
  const flagged = activityEvent("order.cancelled", { flags: ["paid_then_cancelled"], actorUserId: "u-ana" });

  it("lets a full viewer review someone else's open flag", () => {
    expect(canReviewEvent(flagged, { userId: "u-marco", isOwner: false, isFullViewer: true })).toBe(true);
  });

  it("never lets a non-owner review their own row", () => {
    expect(canReviewEvent(flagged, { userId: "u-ana", isOwner: false, isFullViewer: true })).toBe(false);
    expect(canReviewEvent(flagged, { userId: "u-ana", isOwner: true, isFullViewer: true })).toBe(true);
  });

  it("has nothing to review on a clean or already reviewed row", () => {
    expect(canReviewEvent(activityEvent("refund.issued"), { userId: "u-marco", isOwner: true, isFullViewer: true })).toBe(false);
    expect(canReviewEvent({ ...flagged, reviewedAt: NOW }, { userId: "u-marco", isOwner: true, isFullViewer: true })).toBe(false);
  });
});

describe("openTarget", () => {
  it("opens the order, the ingredient or the dish a row is about", () => {
    expect(openTarget(activityEvent("order.cancelled", { subjectType: "order", subjectRef: "o1", orderNumber: "#22" }))).toEqual({
      label: "Open order #22",
      href: "/(main)/order/o1",
    });
    expect(openTarget(activityEvent("stock.wasted", { subjectType: "ingredient", subjectRef: "i1" }))).toEqual({
      label: "Open item",
      href: "/(main)/ingredient/i1",
    });
    expect(openTarget(activityEvent("menu.price_changed", { subjectType: "menu_item", subjectRef: "m1" }))).toEqual({
      label: "Open item",
      href: "/(main)/product/m1",
    });
    expect(openTarget(activityEvent("shift.closed", { subjectType: "shift", subjectRef: "s1" }))).toBeNull();
  });
});
