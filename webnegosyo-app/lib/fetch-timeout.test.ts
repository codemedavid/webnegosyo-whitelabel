/**
 * A push-token write to a Convex deployment that never answers must not hang
 * for the life of the process; the OS may already have suspended the socket.
 */
import { fetchWithTimeout, FETCH_TIMEOUT_MS, type FetchLike } from "./fetch-timeout";

describe("fetchWithTimeout", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("passes the request through and resolves with the response", async () => {
    const response = { ok: true } as Response;
    const fetchImpl = jest.fn<Promise<Response>, Parameters<FetchLike>>(async () => response);

    const result = await fetchWithTimeout("https://x.convex.cloud/api/mutation", { method: "POST" }, 1000, fetchImpl);

    expect(result).toBe(response);
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("aborts the request once the deadline passes", async () => {
    const fetchImpl = jest.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        })
    );

    const pending = fetchWithTimeout("https://x.convex.cloud/api/mutation", {}, 500, fetchImpl);
    jest.advanceTimersByTime(500);

    await expect(pending).rejects.toThrow("aborted");
  });

  it("has a default deadline measured in seconds, not minutes", () => {
    expect(FETCH_TIMEOUT_MS).toBeGreaterThanOrEqual(5_000);
    expect(FETCH_TIMEOUT_MS).toBeLessThanOrEqual(15_000);
  });
});
