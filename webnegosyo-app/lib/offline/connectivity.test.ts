import {
  getConnectivity,
  isOffline,
  probeReachability,
  reportOffline,
  reportOnline,
  reportOutcome,
  resetConnectivityForTests,
  shouldPollReachability,
  subscribeConnectivity,
} from "./connectivity";

describe("connectivity belief", () => {
  beforeEach(() => resetConnectivityForTests());

  it("starts unknown, which is not offline — the register tries the server first", () => {
    expect(getConnectivity().status).toBe("unknown");
    expect(isOffline()).toBe(false);
  });

  it("a network failure flips it offline; a server answer flips it back", () => {
    reportOutcome(new TypeError("Network request failed"), 100);
    expect(isOffline()).toBe(true);
    expect(getConnectivity().changedAt).toBe(100);

    reportOutcome(undefined, 200);
    expect(getConnectivity()).toEqual({ status: "online", changedAt: 200 });
  });

  it("a server refusal counts as online — the server answered", () => {
    reportOffline(1);
    reportOutcome(new Error("ArgumentValidationError"), 2);
    expect(getConnectivity().status).toBe("online");
  });

  it("notifies listeners only on a change, never on a repeat", () => {
    const listener = jest.fn();
    subscribeConnectivity(listener);
    reportOnline(1);
    reportOnline(2);
    reportOnline(3);
    expect(listener).toHaveBeenCalledTimes(1);
    reportOffline(4);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("polls only while not online", () => {
    expect(shouldPollReachability("unknown")).toBe(true);
    expect(shouldPollReachability("offline")).toBe(true);
    expect(shouldPollReachability("online")).toBe(false);
  });
});

describe("probeReachability", () => {
  it("is true when the server answers, whatever the status code", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 404 });
    await expect(probeReachability({ url: "https://x/health", fetchImpl })).resolves.toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://x/health",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("is false when the fetch throws", async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new TypeError("Network request failed"));
    await expect(probeReachability({ url: "https://x/health", fetchImpl })).resolves.toBe(false);
  });

  it("is false when the server does not answer within the deadline", async () => {
    const fetchImpl = jest.fn(
      (_url: string, init?: RequestInit) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        })
    ) as unknown as typeof fetch;
    await expect(
      probeReachability({ url: "https://x/health", fetchImpl, timeoutMs: 10 })
    ).resolves.toBe(false);
  });
});
