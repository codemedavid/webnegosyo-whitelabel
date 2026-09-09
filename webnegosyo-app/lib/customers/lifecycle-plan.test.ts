/**
 * Deciding whether a mutation the register just ran needs a lifecycle sync.
 *
 * `useSafeMutation` is the one chokepoint every order screen goes through, so
 * this planner runs on EVERY mutation the app makes. It therefore has to be
 * cheap and, above all, quiet: a plan returned for the wrong mutation would
 * post a status change for a cart. Platform-backed tenants get a plan too:
 * their Hub reads `orders` directly, but loyalty earning still has to hear
 * about a delivery or a settlement the register wrote straight to Supabase.
 */
import { planLifecycleSync } from "./lifecycle-plan";

const BASE = {
  tenantId: "11111111-1111-1111-1111-111111111111",
  orderBackend: "convex" as const,
};

describe("planLifecycleSync", () => {
  it("plans a sync when a Convex order's status changes", () => {
    const plan = planLifecycleSync({
      ...BASE,
      refName: "orders:updateOrderStatus",
      args: { orderId: "order-1", status: "delivered" },
    });

    expect(plan).toMatchObject({
      backend: "convex",
      externalOrderId: "order-1",
      status: "delivered",
    });
  });

  it("translates the app's `supabase` into the platform's `tenant_supabase`", () => {
    const plan = planLifecycleSync({
      ...BASE,
      orderBackend: "supabase",
      refName: "orders:updateOrderStatus",
      args: { orderId: "order-1", status: "ready" },
    });

    expect(plan?.backend).toBe("tenant_supabase");
  });

  it("names the platform's own orders table for a platform-backed tenant, so loyalty still hears the change", () => {
    const plan = planLifecycleSync({
      ...BASE,
      orderBackend: "platform",
      refName: "orders:updateOrderStatus",
      args: { orderId: "order-1", status: "delivered" },
    });

    expect(plan?.backend).toBe("platform_supabase");
  });

  it("carries the payment state through when the register settles a sale", () => {
    const plan = planLifecycleSync({
      ...BASE,
      refName: "orders:updatePaymentStatus",
      args: { orderId: "order-1", paymentStatus: "paid" },
    });

    expect(plan).toMatchObject({ externalOrderId: "order-1", paymentStatus: "paid" });
    expect(plan?.source).toBeNull();
  });

  it("plans a sync for setPrepTime, which writes a status alongside the promise", () => {
    const plan = planLifecycleSync({
      ...BASE,
      refName: "orders:setPrepTime",
      args: { orderId: "order-1", status: "preparing", prepMinutes: 10 },
    });

    expect(plan).toMatchObject({ status: "preparing" });
  });

  it.each([
    "orders:createOrder",
    "orders:recordPayment",
    "orders:reviseOrder",
    "analytics:trackEvent",
  ])("stays quiet for %s, which is not a lifecycle change", (refName) => {
    expect(planLifecycleSync({ ...BASE, refName, args: { orderId: "order-1" } })).toBeNull();
  });

  it("plans nothing without an order id rather than posting a malformed event", () => {
    expect(
      planLifecycleSync({ ...BASE, refName: "orders:updateOrderStatus", args: { status: "ready" } })
    ).toBeNull();
  });

  it("plans nothing when no store is selected", () => {
    expect(
      planLifecycleSync({
        ...BASE,
        tenantId: null,
        refName: "orders:updateOrderStatus",
        args: { orderId: "order-1", status: "ready" },
      })
    ).toBeNull();
  });

  it("marks a POS sale as pos so it settles on payment, not on delivery", () => {
    const plan = planLifecycleSync({
      ...BASE,
      refName: "orders:updatePaymentStatus",
      args: { orderId: "order-1", paymentStatus: "paid", source: "pos" },
    });

    expect(plan?.source).toBe("pos");
  });

  it("passes the branch through when the mutation names one", () => {
    const plan = planLifecycleSync({
      ...BASE,
      refName: "orders:updateOrderStatus",
      args: { orderId: "order-1", status: "ready", outletId: "outlet-9" },
    });

    expect(plan?.outletId).toBe("outlet-9");
  });
});

describe("planLifecycleSync — unresolved store", () => {
  it("plans nothing before the store's backend has resolved", () => {
    expect(
      planLifecycleSync({
        tenantId: "11111111-1111-1111-1111-111111111111",
        orderBackend: null,
        refName: "orders:updateOrderStatus",
        args: { orderId: "order-1", status: "ready" },
      })
    ).toBeNull();
  });
});
