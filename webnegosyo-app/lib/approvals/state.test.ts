import {
  requestTitle,
  requestHeadline,
  countdown,
  formatManilaClock,
  formatPesoShort,
  inboxCardLines,
  joinNames,
  requesterCard,
  shouldKeepPolling,
} from "./state";
import type { ApprovalRequestView } from "./types";

const NOW = new Date("2026-10-12T04:30:00Z"); // 12:30 PM Manila

function view(overrides: Partial<ApprovalRequestView> = {}): ApprovalRequestView {
  return {
    id: "r-1", tenantId: "t-1", outletId: null, kind: "refund", status: "pending", isDirect: false,
    externalOrderId: "o-1", orderNumber: "#14", payload: {}, amount: 185, approvedAmount: null, reasonCode: "wrong_item",
    note: null, orderSnapshot: null, requestedBy: "u-ana", requestedByName: "Ana Reyes", requesterShiftId: "s-1",
    decidedBy: null, decidedByName: null, decidedAt: null, decisionReasonCode: null, decisionNote: null,
    expiresAt: "2026-10-12T04:58:00Z", executedAt: null, result: null, error: null,
    createdAt: "2026-10-12T04:28:00Z", updatedAt: "2026-10-12T04:28:00Z", refundLabel: null,
    canDecide: false, canWithdraw: true, isOverViewerLimit: false, ...overrides,
  };
}

const ctx = { now: NOW, approverNames: ["Marco", "Lorna"], expiryMinutes: 30 };

describe("formatting", () => {
  test("pesos drop zero centavos and group thousands", () => {
    expect(formatPesoShort(185)).toBe("₱185");
    expect(formatPesoShort(18420.5)).toBe("₱18,420.50");
  });
  test("Manila clock without Intl time zones", () => {
    expect(formatManilaClock("2026-10-12T04:58:00Z")).toBe("12:58 PM");
    expect(formatManilaClock("2026-10-11T16:05:00Z")).toBe("12:05 AM");
  });
  test("names join with or / and", () => {
    expect(joinNames(["Marco"], "or")).toBe("Marco");
    expect(joinNames(["Marco", "Lorna"], "or")).toBe("Marco or Lorna");
    expect(joinNames(["Marco", "Bea", "Lorna"], "and")).toBe("Marco, Bea and Lorna");
  });
  test("countdown is urgent only in the last 10 minutes", () => {
    expect(countdown("2026-10-12T04:58:00Z", NOW)).toMatchObject({ minutesLeft: 28, isUrgent: false });
    expect(countdown("2026-10-12T04:38:00Z", NOW)).toMatchObject({ label: "8 min left", isUrgent: true });
    expect(countdown("2026-10-12T04:00:00Z", NOW)).toMatchObject({ isExpired: true, label: "Expired" });
  });
});

describe("requesterCard (design-spec §3.9)", () => {
  test("sending", () => {
    expect(requesterCard(null, { ...ctx, isSending: true })).toMatchObject({ title: "Sending to Marco and Lorna…", showSpinner: true, actions: [] });
  });
  test("pending", () => {
    expect(requesterCard(view(), ctx)).toMatchObject({
      tone: "waiting", title: "Waiting for Marco or Lorna", subtitle: "Asked 2 min ago · expires 12:58 PM", actions: ["withdraw"],
    });
  });
  test("pending past its deadline reads expired", () => {
    expect(requesterCard(view({ expiresAt: "2026-10-12T04:00:00Z" }), ctx)).toMatchObject({
      title: "No answer in 30 min. The request closed.", actions: ["ask_again"],
    });
  });
  test("approved, finishing", () => {
    expect(requesterCard(view({ status: "executing", decidedByName: "Marco Cruz" }), ctx).title).toBe("Approved by Marco · finishing…");
  });
  test("executed cash refund", () => {
    expect(requesterCard(view({ status: "executed", decidedByName: "Marco", refundLabel: "R-0042", result: { cashInvolved: true } }), ctx))
      .toMatchObject({
        tone: "success", title: "Approved by Marco. Give ₱185 back from your drawer.",
        subtitle: "R-0042 · refund slip printing", actions: ["print_again", "done"],
      });
  });
  test("executed without a slip printer says only the R-number", () => {
    expect(
      requesterCard(view({ status: "executed", decidedByName: "Marco", refundLabel: "R-0042", result: { cashInvolved: true } }), {
        ...ctx,
        canPrintSlip: false,
      }),
    ).toMatchObject({ subtitle: "R-0042", actions: ["done"] });
  });
  test("executed GCash refund does not mention the drawer", () => {
    expect(requesterCard(view({ status: "executed", decidedByName: "Marco", result: { cashInvolved: false } }), ctx).title)
      .toBe("Approved by Marco. ₱185 goes back the way they paid.");
  });
  test("declined shows the reason and the note, softened", () => {
    expect(requesterCard(view({ status: "declined", decidedByName: "Marco", decisionReasonCode: "offer_replacement", decisionNote: "Give her a fresh one" }), ctx))
      .toMatchObject({
        tone: "declined", title: "Marco said not this time", reasonChip: "Offer a replacement instead",
        quote: "Give her a fresh one", actions: ["ask_again_with_changes", "ok"],
      });
  });
  test("failed after approval", () => {
    expect(requesterCard(view({ status: "failed", decidedByName: "Marco", error: "The order changed." }), ctx).title)
      .toBe("Approved, but it couldn't finish: the order changed. Nothing was refunded.");
  });
  test("withdrawn", () => {
    expect(requesterCard(view({ status: "withdrawn" }), ctx)).toMatchObject({ title: "Request withdrawn", actions: ["ask_again"] });
  });
  test("direct refund within the cashier's own limit", () => {
    expect(requesterCard(view({ status: "executed", isDirect: true, refundLabel: "R-0043", result: { cashInvolved: true } }), ctx).title)
      .toBe("Refunded ₱185. Give it back from your drawer.");
  });
});

describe("inboxCardLines (design-spec §3.6)", () => {
  test("headline, who/why/when, chip only near the end", () => {
    expect(inboxCardLines(view(), NOW)).toEqual({
      headline: "Refund ₱185 · #14", detail: "Ana · Wrong item served · 2 min ago", timeLeftChip: null, overLimitNote: null,
    });
    expect(inboxCardLines(view({ expiresAt: "2026-10-12T04:38:00Z" }), NOW).timeLeftChip).toBe("8 min left");
  });
  test("over the viewer's limit is read-only and says who has it", () => {
    expect(inboxCardLines(view({ amount: 1450, isOverViewerLimit: true, viewerCap: 1000 }), NOW).overLimitNote)
      .toBe("Over your ₱1,000 limit · sent to the owner");
  });
});

describe("polling", () => {
  test("keeps polling only while the answer can still change", () => {
    expect(shouldKeepPolling(view())).toBe(true);
    expect(shouldKeepPolling(view({ status: "executed" }))).toBe(false);
    expect(shouldKeepPolling(null)).toBe(false);
  });
});

describe("overpayment refunds (scope 'balance')", () => {
  test("read as Refund overpayment wherever a request is named", () => {
    const balance = { kind: "refund" as const, amount: 185, approvedAmount: null, orderNumber: "#14", payload: { scope: "balance" } };
    expect(requestHeadline(balance)).toBe("Refund overpayment ₱185 · #14");
    expect(requestTitle(balance)).toBe("Refund overpayment");
    expect(requestTitle({ kind: "refund", payload: { scope: "items" } })).toBe("Refund");
  });
});
