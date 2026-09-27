import { withPlatformTimeout, withPlatformDeadline, PLATFORM_CALL_TIMEOUT_MS } from "./platform-call";
import { getConnectivity, resetConnectivityForTests } from "../offline/connectivity";

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

/**
 * A read the deadline gave up on used to keep running: the race rejected, the
 * screen showed "timed out", and the request itself stayed on the wire. The
 * next poll or invalidation then started ANOTHER copy behind it, so a slow
 * database met a growing queue of abandoned reads from every device — each of
 * them taking a connection slot a fresh read needed. The deadline now aborts
 * the work it bounds, and so does the cache cancelling a read it replaced.
 */
describe("withPlatformDeadline", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetConnectivityForTests();
  });
  afterEach(() => jest.useRealTimers());

  it("hands the work a live signal and passes its result through", async () => {
    let seen: AbortSignal | null = null;

    const result = await withPlatformDeadline((signal) => {
      seen = signal;
      return Promise.resolve("rows");
    }, "orders:getOrders");

    expect(result).toBe("rows");
    expect(seen).not.toBeNull();
    expect((seen as unknown as AbortSignal).aborted).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });

  it("aborts the work when the deadline passes, not just the wait", async () => {
    let seen: AbortSignal | null = null;
    const hung = withPlatformDeadline((signal) => {
      seen = signal;
      return new Promise(() => {});
    }, "orders:getOrders");
    const outcome = expect(hung).rejects.toThrow(/timed out.*orders:getOrders/i);

    jest.advanceTimersByTime(PLATFORM_CALL_TIMEOUT_MS + 1);

    await outcome;
    expect((seen as unknown as AbortSignal).aborted).toBe(true);
  });

  it("aborts the work when the caller cancels it", async () => {
    const caller = new AbortController();
    let seen: AbortSignal | null = null;
    const pending = withPlatformDeadline(
      (signal) => {
        seen = signal;
        return new Promise((_, reject) => {
          signal.addEventListener("abort", () => reject(new Error("AbortError: Aborted")));
        });
      },
      "orders:getOrders",
      { signal: caller.signal }
    );
    const outcome = expect(pending).rejects.toThrow(/aborted/i);

    caller.abort();

    await outcome;
    expect((seen as unknown as AbortSignal).aborted).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });

  it("does not read a cancellation as the connection dropping", async () => {
    const caller = new AbortController();
    const pending = withPlatformDeadline(
      (signal) =>
        new Promise((_, reject) => {
          signal.addEventListener("abort", () => reject(new Error("AbortError: Aborted")));
        }),
      "orders:getOrders",
      { signal: caller.signal }
    );
    const outcome = expect(pending).rejects.toThrow();

    caller.abort();
    await outcome;

    // A read the cache replaced says nothing about the network; flipping the
    // register offline on it would send sales to the offline queue.
    expect(getConnectivity().status).toBe("unknown");
  });

  it("still reads a real timeout as the connection dropping", async () => {
    const hung = withPlatformDeadline(() => new Promise(() => {}), "orders:getOrders");
    const outcome = expect(hung).rejects.toThrow();

    jest.advanceTimersByTime(PLATFORM_CALL_TIMEOUT_MS + 1);
    await outcome;

    expect(getConnectivity().status).toBe("offline");
  });
});
