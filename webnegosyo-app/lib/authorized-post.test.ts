jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: { extra: { webAppUrl: "https://www.webnegosyo.com" } },
  },
}));

const getSessionMock = jest.fn();
jest.mock("./supabase", () => ({
  supabase: { auth: { getSession: getSessionMock } },
}));

import { postAuthorized, postAuthorizedDetailed } from "./authorized-post";

/**
 * The one bounded, authenticated POST the register's bookkeeping calls share.
 *
 * Why it exists: every "fire-and-forget" call behind a completed sale — stock
 * depletion, the Loyverse receipt, customer capture, the voucher burn — was
 * `await supabase.auth.getSession()` followed by an `await fetch()` with no
 * deadline on either. The tender screen awaits all four before clearing
 * `isCompleting`, so ANY of them hanging leaves the footer spinner up forever
 * with no way out but force-quitting the app. That is the "the second checkout
 * just loads" freeze cashiers hit.
 *
 * `getSession()` is the likelier of the two to hang: GoTrueClient chains every
 * caller behind whatever currently holds the storage lock, so one stalled
 * background token refresh (an auto-refresh that fired while the app was
 * backgrounded and never got a response) makes every later session read wait
 * on it for the rest of the process's life. `lib/voucher-service.ts` already
 * documents that hazard for the lookup path; this module is the same guarantee
 * for the write path, in one place instead of four copies.
 *
 * The contract is therefore: NEVER throws, and ALWAYS settles.
 */

/** A promise that never settles — the hang this module exists to survive. */
const forever = <T,>() => new Promise<T>(() => {});

describe("postAuthorized", () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: "token-1" } },
    });
  });

  test("posts the body to the web app route with the cashier's bearer token", async () => {
    // Act
    const delivered = await postAuthorized("/api/inventory/order-stock", {
      tenantId: "t1",
    });

    // Assert
    expect(delivered).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://www.webnegosyo.com/api/inventory/order-stock");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer token-1");
    expect(JSON.parse(init.body)).toEqual({ tenantId: "t1" });
  });

  test("settles rather than hanging when the session read never returns", async () => {
    // Arrange — one stalled token refresh holds GoTrue's lock and every later
    // getSession() queues behind it. Unbounded, this is the register freeze.
    getSessionMock.mockReturnValue(forever());

    // Act
    const delivered = await postAuthorized("/api/loyverse", {}, { timeoutMs: 20 });

    // Assert
    expect(delivered).toBe(false);
  });

  test("settles rather than hanging when the request never returns", async () => {
    // Arrange — a counter connection that accepts the socket and then stalls.
    fetchMock.mockReturnValue(forever());

    // Act
    const delivered = await postAuthorized("/api/loyverse", {}, { timeoutMs: 20 });

    // Assert
    expect(delivered).toBe(false);
  });

  test("aborts the stalled request instead of leaving the socket open", async () => {
    // Arrange
    fetchMock.mockReturnValue(forever());

    // Act
    await postAuthorized("/api/loyverse", {}, { timeoutMs: 20 });

    // Assert — the deadline releases the connection, it does not merely stop
    // waiting on it.
    const [, init] = fetchMock.mock.calls[0];
    expect(init.signal.aborted).toBe(true);
  });

  test("does not call the route at all when there is no session", async () => {
    // Arrange
    getSessionMock.mockResolvedValue({ data: { session: null } });

    // Act
    const delivered = await postAuthorized("/api/loyverse", {});

    // Assert
    expect(delivered).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("never throws when the request rejects", async () => {
    // Arrange
    fetchMock.mockRejectedValue(new Error("Network request failed"));

    // Act / Assert — the sale is already paid for by the time this runs; a
    // bookkeeping failure must not surface as a failed tender.
    await expect(postAuthorized("/api/loyverse", {})).resolves.toBe(false);
  });

  test("reports a refusal from the server as undelivered", async () => {
    // Arrange
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    // Act
    const delivered = await postAuthorized("/api/loyverse", {});

    // Assert
    expect(delivered).toBe(false);
  });
});

/**
 * The stock notifier must tell a permanent refusal (403, 409) from a transient
 * one (5xx, 404 while the order row propagates, a timeout). The status is part
 * of the answer itself — not a side channel keyed by the request body.
 */
describe("postAuthorizedDetailed", () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock as unknown as typeof fetch;
    getSessionMock.mockResolvedValue({ data: { session: { access_token: "token-1" } } });
  });

  test("answers ok with the status the route gave", async () => {
    await expect(postAuthorizedDetailed("/api/inventory/order-stock", {})).resolves.toEqual({ ok: true, status: 200 });
  });

  test("answers the refusal's status", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403 });
    await expect(postAuthorizedDetailed("/api/inventory/order-stock", {})).resolves.toEqual({ ok: false, status: 403 });
  });

  test("answers a null status when no server answered", async () => {
    fetchMock.mockRejectedValue(new Error("Network request failed"));
    await expect(postAuthorizedDetailed("/api/x", {})).resolves.toEqual({ ok: false, status: null });

    getSessionMock.mockResolvedValue({ data: { session: null } });
    await expect(postAuthorizedDetailed("/api/x", {})).resolves.toEqual({ ok: false, status: null });

    getSessionMock.mockReturnValue(forever());
    await expect(postAuthorizedDetailed("/api/x", {}, { timeoutMs: 20 })).resolves.toEqual({ ok: false, status: null });
  });

  test("postAuthorized still answers a plain boolean", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 409 });
    await expect(postAuthorized("/api/x", {})).resolves.toBe(false);
  });
});
