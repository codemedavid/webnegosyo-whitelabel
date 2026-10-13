/**
 * The lifecycle post is how a Convex or tenant-Supabase store's cancel reaches
 * the platform's order_status_events (and so Store Activity) with its reason.
 */
jest.mock("../authorized-post", () => ({ postAuthorized: jest.fn(async () => ({ ok: true })) }));

import { postAuthorized } from "../authorized-post";
import { notifyLifecycleSync } from "./lifecycle";
import type { LifecycleSyncPlan } from "./lifecycle-plan";

const PLAN: LifecycleSyncPlan = {
  tenantId: "t1",
  backend: "convex",
  externalOrderId: "order-1",
  status: "cancelled",
  paymentStatus: null,
  source: null,
  outletId: null,
};

describe("notifyLifecycleSync", () => {
  beforeEach(() => (postAuthorized as jest.Mock).mockClear());

  it("sends the cancel's reason and note when the plan has them", async () => {
    await notifyLifecycleSync({ ...PLAN, reason: "Customer left", note: "Waited 40 min" });
    expect((postAuthorized as jest.Mock).mock.calls[0][1]).toMatchObject({
      status: "cancelled",
      reason: "Customer left",
      note: "Waited 40 min",
    });
  });

  it("sends no reason keys for a plain status move", async () => {
    await notifyLifecycleSync(PLAN);
    const body = (postAuthorized as jest.Mock).mock.calls[0][1] as Record<string, unknown>;
    expect(body).not.toHaveProperty("reason");
    expect(body).not.toHaveProperty("note");
  });
});
