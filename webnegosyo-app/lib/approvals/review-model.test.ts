import {
  amountSubline,
  approveA11yLabel,
  approveSlideLabel,
  canChangeAmount,
  pushIntentStep,
  expiryLine,
  requesterSubline,
  reviewDock,
  reviewItemLines,
  reviewSignals,
  reviewSubtitle,
  reviewTitle,
  stockLine,
} from "./review-model";
import { approvalRequest, FIXTURE_NOW } from "./test-fixtures";

const ctx = { isOffline: false, viewerUserId: "u-marco", now: FIXTURE_NOW };

describe("review screen content", () => {
  test("header names the kind, the order and how long ago it was placed", () => {
    expect(reviewTitle("refund")).toBe("Refund request");
    expect(reviewTitle("cancel_paid")).toBe("Cancel paid order");
    expect(reviewSubtitle(approvalRequest(), FIXTURE_NOW)).toBe("Order #14 · Dine in · placed 28 min ago");
  });

  test("the amount line says what was paid, how, and whose drawer pays it back", () => {
    expect(amountSubline(approvalRequest())).toBe("of ₱480 paid in cash · comes out of Ana's drawer");
    const gcash = approvalRequest({
      payload: { scope: "amount", amount: 100, allocation: [{ methodName: "GCash", amount: 100, isCash: false }] },
      orderSnapshot: { ...approvalRequest().orderSnapshot, ledger: { net: 480, charged: 480, refunded: 0, tenders: [{ methodName: "GCash", net: 480 }] } },
    });
    expect(amountSubline(gcash)).toBe("of ₱480 paid by GCash");
    expect(amountSubline(approvalRequest({ orderSnapshot: null, payload: {} }))).toBe("");
  });

  test("item lines come from the request and the snapshot, never invented", () => {
    expect(reviewItemLines(approvalRequest())).toEqual([{ label: "1 × Chicken Sisig", amount: "₱185" }]);
    const whole = approvalRequest({ payload: { scope: "whole", restock: true } });
    expect(reviewItemLines(whole)).toEqual([
      { label: "2 × Chicken Sisig", amount: "₱370" },
      { label: "2 × Garlic Rice", amount: "₱110" },
    ]);
    expect(reviewItemLines(approvalRequest({ payload: { scope: "amount", amount: 50 } }))).toEqual([]);
  });

  test("the stock consequence follows the switch, and says nothing for an amount", () => {
    expect(stockLine(approvalRequest())).toBe("Not put back in stock · logged as waste");
    expect(stockLine(approvalRequest({ payload: { scope: "whole", restock: true } }))).toBe("Put back in stock");
    expect(stockLine(approvalRequest({ payload: { scope: "amount", amount: 50 } }))).toBeNull();
  });

  test("requester and expiry lines", () => {
    expect(requesterSubline(approvalRequest(), FIXTURE_NOW)).toBe("Asked 2 min ago");
    expect(expiryLine(approvalRequest(), FIXTURE_NOW)).toBe("Expires in 28 min if nobody answers");
    expect(expiryLine(approvalRequest({ status: "declined" }), FIXTURE_NOW)).toBeNull();
  });

  test("the slide names the amount; the screen reader hears pesos", () => {
    expect(approveSlideLabel(approvalRequest())).toBe("Slide to approve ₱185");
    expect(approveA11yLabel(approvalRequest())).toBe("Approve 185 pesos");
  });

  test("only an amount refund can be approved for less", () => {
    expect(canChangeAmount(approvalRequest())).toBe(false);
    expect(canChangeAmount(approvalRequest({ payload: { scope: "amount", amount: 185 } }))).toBe(true);
    expect(canChangeAmount(approvalRequest({ payload: { scope: "amount", amount: 185 }, canDecide: false }))).toBe(false);
  });
});

describe("worth knowing", () => {
  test("a clean same-day request within the limit says so", () => {
    expect(reviewSignals(approvalRequest(), FIXTURE_NOW)).toEqual([{ tone: "ok", text: "Within your ₱1,000 limit" }]);
  });

  test("shows at most three, most worth checking first", () => {
    const busy = approvalRequest({
      payload: { scope: "whole" },
      orderSnapshot: {
        ...approvalRequest().orderSnapshot,
        revisionNumber: 2,
        createdAt: "2026-10-11T03:00:00.000Z",
        ledger: { net: 420, charged: 480, refunded: 60, tenders: [] },
      },
    });
    expect(reviewSignals(busy, FIXTURE_NOW)).toEqual([
      { tone: "check", text: "₱60 was already refunded on this order" },
      { tone: "check", text: "This order was edited 2 times before" },
      { tone: "check", text: "This order is from an earlier day" },
    ]);
  });

  test("an owner (no limit) gets no limit line", () => {
    expect(reviewSignals(approvalRequest({ viewerCap: null }), FIXTURE_NOW)).toEqual([]);
  });
});

describe("the dock", () => {
  test("decide while pending and allowed; offline disables it with the reason", () => {
    expect(reviewDock(approvalRequest(), ctx)).toEqual({ kind: "decide" });
    expect(reviewDock(approvalRequest(), { ...ctx, isOffline: true })).toEqual({
      kind: "offline",
      text: "You're offline. Connect to approve.",
    });
  });

  test("over the viewer's limit is read-only and says the owner has it", () => {
    expect(reviewDock(approvalRequest({ canDecide: false, isOverViewerLimit: true, amount: 1450 }), ctx)).toEqual({
      kind: "waiting",
      title: "Waiting for the owner",
      text: "Over your ₱1,000 limit. The owner has been asked.",
    });
  });

  test("someone else's answer, expiry and withdrawal close the dock", () => {
    const approved = approvalRequest({
      status: "executed",
      decidedBy: "u-lorna",
      decidedByName: "Lorna Cruz",
      decidedAt: "2026-10-12T04:34:00.000Z",
      refundLabel: "R-0042",
      canDecide: false,
    });
    expect(reviewDock(approved, ctx)).toEqual({
      kind: "done",
      tone: "neutral",
      text: "Lorna already approved this at 12:34 PM",
      detail: "R-0042",
    });
    expect(reviewDock(approvalRequest({ status: "expired", canDecide: false }), ctx)).toMatchObject({ text: "This request expired" });
    expect(reviewDock(approvalRequest({ status: "withdrawn", canDecide: false }), ctx)).toMatchObject({ text: "Ana withdrew this request" });
  });

  test("my own approval reads as a result", () => {
    const mine = approvalRequest({ status: "executed", decidedBy: "u-marco", decidedByName: "Marco", refundLabel: "R-0042", canDecide: false });
    expect(reviewDock(mine, ctx)).toEqual({ kind: "done", tone: "success", text: "Approved. Ana can give back ₱185 now.", detail: "R-0042" });
    const declined = approvalRequest({ status: "declined", decidedBy: "u-marco", decidedByName: "Marco", canDecide: false });
    expect(reviewDock(declined, ctx)).toMatchObject({ text: "Declined. Ana has been told." });
  });

  test("executing and failed", () => {
    expect(reviewDock(approvalRequest({ status: "executing", decidedByName: "Marco", canDecide: false }), ctx)).toEqual({
      kind: "busy",
      text: "Approved by Marco · finishing…",
    });
    expect(reviewDock(approvalRequest({ status: "failed", error: "order_changed", canDecide: false }), ctx)).toEqual({
      kind: "done",
      tone: "danger",
      text: "Couldn't finish: the order changed since Ana asked. Nothing was refunded.",
      detail: null,
    });
  });

  test("my own pending request waits", () => {
    expect(reviewDock(approvalRequest({ requestedBy: "u-marco", canDecide: false, canWithdraw: true }), ctx)).toEqual({
      kind: "waiting",
      title: "Waiting for an answer",
      text: "You can't approve your own request.",
    });
  });
});

describe("pushIntentStep (Approve / Decline tapped on a push)", () => {
  test("waits for a fresh read: the request is re-checked before anything is sent", () => {
    expect(pushIntentStep(undefined, { isFresh: false, isOffline: false })).toBe("wait");
    expect(pushIntentStep(approvalRequest(), { isFresh: false, isOffline: false })).toBe("wait");
  });

  test("goes only while it is still pending and this person may decide", () => {
    expect(pushIntentStep(approvalRequest(), { isFresh: true, isOffline: false })).toBe("go");
    expect(pushIntentStep(approvalRequest({ status: "executed", canDecide: false }), { isFresh: true, isOffline: false })).toBe("drop");
    expect(pushIntentStep(approvalRequest({ canDecide: false, isOverViewerLimit: true }), { isFresh: true, isOffline: false })).toBe("drop");
    expect(pushIntentStep(approvalRequest(), { isFresh: true, isOffline: true })).toBe("drop");
  });
});
