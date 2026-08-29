import { withPlatformTimeout, PLATFORM_CALL_TIMEOUT_MS } from "./platform-call";

/**
 * Every platform read and write awaits supabase-js behind the shared GoTrue
 * auth lock. A background token refresh that stalls there has already frozen a
 * live register once (see the POS second-checkout freeze) — so no platform call
 * may await unbounded. The timeout turns a hang into an error a screen can
 * show and a cashier can retry.
 */
describe("withPlatformTimeout", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("passes a resolving call straight through", async () => {
    await expect(
      withPlatformTimeout(Promise.resolve("rows"), "orders:getOrders")
    ).resolves.toBe("rows");
  });

  it("passes a rejecting call straight through", async () => {
    await expect(
      withPlatformTimeout(Promise.reject(new Error("boom")), "orders:getOrders")
    ).rejects.toThrow("boom");
  });

  it("rejects a hung call after the timeout, naming the call", async () => {
    const hung = withPlatformTimeout(new Promise(() => {}), "orders:createOrder");
    // Attach the handler before advancing so the rejection is never unhandled.
    const outcome = expect(hung).rejects.toThrow(/timed out.*orders:createOrder/i);

    jest.advanceTimersByTime(PLATFORM_CALL_TIMEOUT_MS + 1);

    await outcome;
  });

  it("does not leave a timer armed after the call settles", async () => {
    await withPlatformTimeout(Promise.resolve("ok"), "orders:getOrders");

    expect(jest.getTimerCount()).toBe(0);
  });
});
