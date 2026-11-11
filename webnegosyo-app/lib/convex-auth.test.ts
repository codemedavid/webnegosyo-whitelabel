import { armConvexAuth, convexTokenFetcher, CONVEX_AUTH_RETRY_BASE_MS, CONVEX_AUTH_RETRY_MAX_MS, type ConvexAuthClient } from "./convex-auth";

describe("convexTokenFetcher", () => {
  it("reads the session when Convex just wants the token", async () => {
    const read = jest.fn().mockResolvedValue("cached");
    const refresh = jest.fn();
    await expect(convexTokenFetcher({ read, refresh })({ forceRefreshToken: false })).resolves.toBe("cached");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes when the server rejected the token it had", async () => {
    const read = jest.fn();
    const refresh = jest.fn().mockResolvedValue("fresh");
    await expect(convexTokenFetcher({ read, refresh })({ forceRefreshToken: true })).resolves.toBe("fresh");
    expect(read).not.toHaveBeenCalled();
  });

  it("keeps the token it has when a refresh fails: a dropped connection must not sign the register out of Convex", async () => {
    const read = jest.fn().mockResolvedValue("cached");
    const refresh = jest.fn().mockResolvedValue(null);
    await expect(convexTokenFetcher({ read, refresh })({ forceRefreshToken: true })).resolves.toBe("cached");
  });
});

describe("armConvexAuth", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function client() {
    const setAuth = jest.fn();
    return { setAuth, value: { setAuth } as unknown as ConvexAuthClient, onChange: () => setAuth.mock.calls.at(-1)![1] as (ok: boolean) => void };
  }
  const fetchToken = async () => "token";

  it("hands the client the token fetcher", () => {
    const c = client();
    armConvexAuth(c.value, { fetchToken, isSignedIn: () => true });
    expect(c.setAuth).toHaveBeenCalledTimes(1);
    expect(c.setAuth.mock.calls[0][0]).toBe(fetchToken);
  });

  it("tries again after the client gives up on its token", () => {
    // Convex stops asking once a fetch answers null. A token read that timed out
    // behind a stalled refresh would otherwise leave this client unauthenticated
    // until it is recreated, and an enforced store refuses every sale meanwhile.
    const c = client();
    armConvexAuth(c.value, { fetchToken, isSignedIn: () => true });

    c.onChange()(false);
    expect(c.setAuth).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(CONVEX_AUTH_RETRY_BASE_MS);
    expect(c.setAuth).toHaveBeenCalledTimes(2);
  });

  it("backs off, up to a ceiling, and starts over once a token sticks", () => {
    const c = client();
    armConvexAuth(c.value, { fetchToken, isSignedIn: () => true });

    c.onChange()(false);
    jest.advanceTimersByTime(CONVEX_AUTH_RETRY_BASE_MS);
    c.onChange()(false);
    jest.advanceTimersByTime(CONVEX_AUTH_RETRY_BASE_MS);
    expect(c.setAuth).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(CONVEX_AUTH_RETRY_BASE_MS);
    expect(c.setAuth).toHaveBeenCalledTimes(3);

    for (let i = 0; i < 12; i += 1) {
      c.onChange()(false);
      jest.advanceTimersByTime(CONVEX_AUTH_RETRY_MAX_MS);
    }
    const before = c.setAuth.mock.calls.length;
    c.onChange()(false);
    jest.advanceTimersByTime(CONVEX_AUTH_RETRY_MAX_MS - 1);
    expect(c.setAuth).toHaveBeenCalledTimes(before);
    jest.advanceTimersByTime(1);
    expect(c.setAuth).toHaveBeenCalledTimes(before + 1);

    c.onChange()(true);
    c.onChange()(false);
    jest.advanceTimersByTime(CONVEX_AUTH_RETRY_BASE_MS);
    expect(c.setAuth).toHaveBeenCalledTimes(before + 2);
  });

  it("leaves a device with no signed-in account alone", () => {
    // The demo store runs with no token at all, and that is fine.
    const c = client();
    armConvexAuth(c.value, { fetchToken, isSignedIn: () => false });
    c.onChange()(false);
    jest.advanceTimersByTime(CONVEX_AUTH_RETRY_MAX_MS * 2);
    expect(c.setAuth).toHaveBeenCalledTimes(1);
  });

  it("stops once the client is replaced", () => {
    const c = client();
    const disarm = armConvexAuth(c.value, { fetchToken, isSignedIn: () => true });
    c.onChange()(false);
    disarm();
    jest.advanceTimersByTime(CONVEX_AUTH_RETRY_MAX_MS * 2);
    expect(c.setAuth).toHaveBeenCalledTimes(1);

    c.onChange()(false);
    jest.advanceTimersByTime(CONVEX_AUTH_RETRY_MAX_MS * 2);
    expect(c.setAuth).toHaveBeenCalledTimes(1);
  });
});
