import { describeActivity } from "./describe";
import { activityAccess, activityRowLabel, spokenPesos } from "./row-a11y";
import { activityEvent } from "./test-fixtures";

describe("spokenPesos", () => {
  it("reads amounts as words a screen reader says cleanly", () => {
    expect(spokenPesos(185)).toBe("185 pesos");
    expect(spokenPesos(-185)).toBe("minus 185 pesos");
    expect(spokenPesos(1234.5)).toBe("1,234.50 pesos");
    expect(spokenPesos(1)).toBe("1 peso");
  });
});

describe("activityRowLabel", () => {
  it("reads one row as one sentence: what, who, how much, why, when, and the flag", () => {
    const event = activityEvent("refund.issued", {
      occurredAt: "2026-10-12T04:33:00.000Z",
      amount: -185,
      orderNumber: "#14",
      reason: "Wrong item",
      approvedByName: "Marco Cruz",
      flags: ["cash_refund_noncash_order"],
    });
    expect(activityRowLabel(event, describeActivity(event))).toBe(
      "Money. Ana refunded order 14, minus 185 pesos. Wrong item, approved by Marco. 12:33 PM. " +
        "Needs a look: Refunded in cash, but the customer paid by GCash, Maya or card.",
    );
  });

  it("says a reviewed flag was reviewed rather than repeating it", () => {
    const event = activityEvent("stock.counted", { flags: ["count_variance"], reviewedAt: "2026-10-12T05:00:00.000Z" });
    expect(activityRowLabel(event, describeActivity(event))).toMatch(/Reviewed\.$/);
  });

  it("leaves out the parts a row does not have", () => {
    const event = activityEvent("shift.opened", { occurredAt: "2026-10-12T00:02:00.000Z" });
    expect(activityRowLabel(event, describeActivity(event))).toBe("Cash. Ana opened a shift. 8:02 AM.");
  });
});

describe("activityAccess", () => {
  it("gives the owner everything", () => {
    expect(activityAccess({ role: "admin", isOwner: true, permissions: [] })).toEqual({
      isOwner: true,
      isFullViewer: true,
      isApprover: true,
    });
  });

  it("keeps opt-in grants opt-in: full access does not include the store's activity", () => {
    expect(activityAccess({ role: "admin", isOwner: false, permissions: null })).toEqual({
      isOwner: false,
      isFullViewer: false,
      isApprover: false,
    });
  });

  it("lets an approver see the store, and an activity viewer see it without approving", () => {
    expect(activityAccess({ role: "admin", isOwner: false, permissions: ["approve_requests"] })).toEqual({
      isOwner: false,
      isFullViewer: true,
      isApprover: true,
    });
    expect(activityAccess({ role: "admin", isOwner: false, permissions: ["activity_view"] })).toEqual({
      isOwner: false,
      isFullViewer: true,
      isApprover: false,
    });
  });
});
