import { decidedLine, homeCardCopy, recentSummary } from "./inbox-model";
import { approvalRequest, FIXTURE_NOW } from "./test-fixtures";

describe("Recently decided", () => {
  test("counts what happened, approvals including those still finishing", () => {
    const requests = [
      approvalRequest({ id: "a", status: "executed" }),
      approvalRequest({ id: "b", status: "executing" }),
      approvalRequest({ id: "c", status: "declined" }),
      approvalRequest({ id: "d", status: "expired" }),
      approvalRequest({ id: "e", status: "withdrawn" }),
      approvalRequest({ id: "f", status: "failed" }),
    ];
    expect(recentSummary(requests)).toBe("Approved 2 · Declined 1 · Expired 1");
    expect(recentSummary([])).toBe("Approved 0 · Declined 0 · Expired 0");
  });

  test("each row says who decided and when", () => {
    expect(
      decidedLine(approvalRequest({ status: "executed", decidedByName: "Marco Santos", decidedAt: "2026-10-12T04:34:00.000Z", refundLabel: "R-0042" })),
    ).toBe("Approved by Marco · 12:34 PM · R-0042");
    expect(decidedLine(approvalRequest({ status: "declined", decidedByName: "Lorna", decidedAt: "2026-10-12T04:34:00.000Z" }))).toBe(
      "Declined by Lorna · 12:34 PM",
    );
    expect(decidedLine(approvalRequest({ status: "expired" }))).toBe("Expired · nobody answered");
    expect(decidedLine(approvalRequest({ status: "withdrawn" }))).toBe("Withdrawn by Ana");
    expect(decidedLine(approvalRequest({ status: "failed", decidedByName: "Marco" }))).toBe("Approved by Marco · couldn't finish");
  });
});

describe("Home card (design-spec §3.11)", () => {
  test("one request names the person and what they asked", () => {
    expect(homeCardCopy([approvalRequest()], FIXTURE_NOW)).toEqual({
      title: "Ana is waiting",
      subtitle: "Refund ₱185 on #14 · 2 min ago",
    });
  });

  test("several say how many and who has waited longest", () => {
    const older = approvalRequest({ id: "old", requestedByName: "Jomar Diaz", createdAt: "2026-10-12T04:24:00.000Z" });
    expect(homeCardCopy([older, approvalRequest()], FIXTURE_NOW)).toEqual({
      title: "2 requests waiting",
      subtitle: "Oldest: Jomar, 6 min ago",
    });
  });
});
