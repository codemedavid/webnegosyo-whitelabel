import {
  APPROVALS_CHANNEL_ID,
  APPROVAL_PUSH_CATEGORIES,
  approvalHref,
  approvalTargetFromPush,
  routeFromPushResponse,
} from "./push-route";

describe("approval push categories", () => {
  test("match the server's category ids, with no ':' or '-' (Expo rule)", () => {
    expect(APPROVAL_PUSH_CATEGORIES("ios").map((category) => category.identifier)).toEqual(["approval_within_limit"]);
    for (const category of APPROVAL_PUSH_CATEGORIES("android")) expect(category.identifier).not.toMatch(/[:-]/);
    expect(APPROVALS_CHANNEL_ID).toBe("approvals");
  });

  test("Approve opens the app on both platforms and asks for the device unlock on iOS", () => {
    const [ios] = APPROVAL_PUSH_CATEGORIES("ios");
    const [android] = APPROVAL_PUSH_CATEGORIES("android");
    expect(ios.actions[0]).toEqual({
      identifier: "approve",
      buttonTitle: "Approve",
      options: { opensAppToForeground: true, isAuthenticationRequired: true },
    });
    expect(android.actions[0]).toEqual({ identifier: "approve", buttonTitle: "Approve", options: { opensAppToForeground: true } });
    expect(ios.actions[1]).toEqual({
      identifier: "decline",
      buttonTitle: "Decline…",
      options: { opensAppToForeground: true, isDestructive: true },
    });
  });
});

describe("approvalTargetFromPush", () => {
  const request = { type: "approval_request", approvalId: "req-1", tenantId: "t-1" };

  test("a plain tap opens the review screen", () => {
    expect(approvalTargetFromPush(request, "expo.modules.notifications.actions.DEFAULT")).toEqual({ approvalId: "req-1", intent: null });
  });

  test("the Approve and Decline actions carry their intent", () => {
    expect(approvalTargetFromPush(request, "approve")).toEqual({ approvalId: "req-1", intent: "approve" });
    expect(approvalTargetFromPush(request, "decline")).toEqual({ approvalId: "req-1", intent: "decline" });
  });

  test("a result push opens the request but never approves", () => {
    expect(approvalTargetFromPush({ ...request, type: "approval_result" }, "approve")).toEqual({ approvalId: "req-1", intent: null });
  });

  test("anything else is not an approval push", () => {
    expect(approvalTargetFromPush({ announcementId: "a1" }, null)).toBeNull();
    expect(approvalTargetFromPush({ type: "approval_request", approvalId: "" }, null)).toBeNull();
    expect(approvalTargetFromPush(null, null)).toBeNull();
  });
});

describe("routeFromPushResponse (the app's one push router)", () => {
  test("approvals first, then announcements, batches to the inbox", () => {
    expect(routeFromPushResponse({ type: "approval_request", approvalId: "req-1" }, "approve")).toBe(
      "/(main)/approval/req-1?intent=approve",
    );
    expect(routeFromPushResponse({ type: "approval_batch", tenantId: "t-1" }, null)).toBe("/(main)/activity?tab=review");
    expect(routeFromPushResponse({ announcementId: "a1", kind: "post" }, null)).toBe("/(main)/whats-new/a1");
    expect(routeFromPushResponse({ orderId: "o1" }, null)).toBeNull();
  });

  test("hrefs escape the id", () => {
    expect(approvalHref({ approvalId: "a b", intent: null })).toBe("/(main)/approval/a%20b");
  });
});
