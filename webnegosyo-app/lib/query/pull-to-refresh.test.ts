/**
 * Pull-to-refresh must refetch, and must be seen to.
 *
 * Five screens used to show a 600 ms spinner that refetched nothing. The
 * gesture now awaits every query the screen holds, and the spinner stays up
 * for at least a beat so an instant cache hit still reads as "refreshed".
 */
import { MIN_REFRESH_SPINNER_MS, minSpinner, refreshWithMinSpinner } from "./pull-to-refresh";

describe("refreshWithMinSpinner", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("calls every refetch and holds the spinner for the minimum duration", async () => {
    const refetchA = jest.fn(async () => {});
    const refetchB = jest.fn(async () => {});
    const setRefreshing = jest.fn();

    const done = refreshWithMinSpinner([refetchA, refetchB], setRefreshing);

    expect(setRefreshing).toHaveBeenLastCalledWith(true);
    expect(refetchA).toHaveBeenCalledTimes(1);
    expect(refetchB).toHaveBeenCalledTimes(1);

    await Promise.resolve();
    expect(setRefreshing).not.toHaveBeenCalledWith(false);

    jest.advanceTimersByTime(MIN_REFRESH_SPINNER_MS);
    await done;
    expect(setRefreshing).toHaveBeenLastCalledWith(false);
    expect(MIN_REFRESH_SPINNER_MS).toBe(400);
  });

  it("waits for a slow refetch beyond the minimum", async () => {
    let resolveSlow: () => void = () => {};
    const slow = jest.fn(() => new Promise<void>((resolve) => (resolveSlow = resolve)));
    const setRefreshing = jest.fn();

    const done = refreshWithMinSpinner([slow], setRefreshing);
    jest.advanceTimersByTime(MIN_REFRESH_SPINNER_MS);
    await Promise.resolve();
    expect(setRefreshing).not.toHaveBeenCalledWith(false);

    resolveSlow();
    await done;
    expect(setRefreshing).toHaveBeenLastCalledWith(false);
  });

  it("clears the spinner even when a refetch rejects", async () => {
    const failing = jest.fn(async () => {
      throw new Error("offline");
    });
    const setRefreshing = jest.fn();
    jest.spyOn(console, "warn").mockImplementation(() => {});

    const done = refreshWithMinSpinner([failing], setRefreshing);
    jest.advanceTimersByTime(MIN_REFRESH_SPINNER_MS);
    await expect(done).resolves.toBeUndefined();

    expect(setRefreshing).toHaveBeenLastCalledWith(false);
    (console.warn as jest.Mock).mockRestore();
  });
});

describe("minSpinner", () => {
  it("resolves after the given delay", async () => {
    jest.useFakeTimers();
    const resolved = jest.fn();
    const p = minSpinner(100).then(resolved);
    jest.advanceTimersByTime(99);
    await Promise.resolve();
    expect(resolved).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    await p;
    expect(resolved).toHaveBeenCalled();
    jest.useRealTimers();
  });
});
