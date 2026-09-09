// The Team screen's transport. Every one of its writes used to go out through
// `supabase.functions.invoke`, whose fetch is wrapped by supabase-js in a
// helper that FIRST awaits `auth.getSession()` and only then hits the network:
//
//   const accessToken = await getAccessToken()   // <- unbounded
//   return fetch(input, { ...init, headers })
//
// `functions.invoke` catches everything that wrapper rejects with and reports
// the same sentence — "Failed to send a request to the Edge Function" — so a
// session read that failed or hung looked identical to a dead network, left no
// trace in the edge logs (the request never left the phone), and told the
// merchant nothing. That is the "Could not save" alert on the Team screen.
//
// This transport is the bounded replacement: the session read has a deadline,
// the request has a deadline, a dropped socket is retried once, and every
// failure carries a sentence the merchant can act on.

import {
  createManageStaffInvoke,
  MANAGE_STAFF_REQUEST_TIMEOUT_MS,
  MANAGE_STAFF_SESSION_TIMEOUT_MS,
} from "./manage-staff-transport";

const FUNCTIONS_URL = "https://project.supabase.co/functions/v1";
const ANON_KEY = "anon-key";

/** A promise that never settles — the hang the deadlines exist to survive. */
const forever = <T,>() => new Promise<T>(() => {});

function sessionWith(token: string | null) {
  return jest.fn().mockResolvedValue({
    data: { session: token ? { access_token: token } : null },
    error: null,
  });
}

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

function makeInvoke(overrides: Partial<Parameters<typeof createManageStaffInvoke>[0]> = {}) {
  return createManageStaffInvoke({
    functionsUrl: FUNCTIONS_URL,
    anonKey: ANON_KEY,
    getSession: sessionWith("caller-jwt"),
    fetchImpl: jest.fn().mockResolvedValue(jsonResponse(200, { success: true, data: [] })),
    ...overrides,
  });
}

describe("createManageStaffInvoke — the request it sends", () => {
  it("posts the body to manage-staff as the signed-in caller", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(jsonResponse(200, { success: true, data: [] }));
    const invoke = makeInvoke({ fetchImpl });

    const { data, error } = await invoke({ action: "list" });

    expect(error).toBeNull();
    expect(data).toEqual({ success: true, data: [] });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`${FUNCTIONS_URL}/manage-staff`);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer caller-jwt");
    // The gateway rejects a call with no project key before the function runs.
    expect(init.headers.apikey).toBe(ANON_KEY);
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ action: "list" });
  });

  it("returns the function's own refusal, not a generic one", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(jsonResponse(403, { success: false, error: "Only the owner may do that." }));
    const invoke = makeInvoke({ fetchImpl });

    const { data, error } = await invoke({ action: "remove", userId: "u1" });

    expect(data).toBeNull();
    expect((error as Error).message).toBe("Only the owner may do that.");
  });

  it("names the status when the server answers with no JSON at all", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => "<html>bad gateway</html>",
    });
    const invoke = makeInvoke({ fetchImpl });

    const { error } = await invoke({ action: "list" });

    expect((error as Error).message).toMatch(/502/);
  });
});

describe("createManageStaffInvoke — the failures that used to be invisible", () => {
  it("retries once when the socket drops, and succeeds on the retry", async () => {
    const fetchImpl = jest
      .fn()
      .mockRejectedValueOnce(new TypeError("Network request failed"))
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: null }));
    const invoke = makeInvoke({ fetchImpl });

    const { data, error } = await invoke({ action: "list" });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(error).toBeNull();
    expect(data).toEqual({ success: true, data: null });
  });

  it("says the connection failed when both attempts fail", async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new TypeError("Network request failed"));
    const invoke = makeInvoke({ fetchImpl });

    const { error } = await invoke({ action: "list" });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect((error as Error).message).toMatch(/connection/i);
    // Never the library sentence that started this.
    expect((error as Error).message).not.toMatch(/Edge Function/);
  });

  it("settles when the session read hangs on a stalled token refresh", async () => {
    jest.useFakeTimers();
    const fetchImpl = jest.fn();
    const invoke = makeInvoke({ getSession: jest.fn(forever) as never, fetchImpl });

    const settled = invoke({ action: "list" });
    await jest.advanceTimersByTimeAsync(MANAGE_STAFF_SESSION_TIMEOUT_MS + 1);
    const { error } = await settled;

    expect(fetchImpl).not.toHaveBeenCalled();
    expect((error as Error).message).toMatch(/sign-in|signed in|session/i);
    jest.useRealTimers();
  });

  it("settles when the request itself hangs", async () => {
    jest.useFakeTimers();
    const fetchImpl = jest.fn(forever) as never;
    const invoke = makeInvoke({ fetchImpl });

    const settled = invoke({ action: "list" });
    // The session read resolves first; only then is the request deadline armed.
    await jest.advanceTimersByTimeAsync(MANAGE_STAFF_REQUEST_TIMEOUT_MS + 1);
    const { error } = await settled;

    expect((error as Error).message).toMatch(/took too long|timed out/i);
    jest.useRealTimers();
  });

  it("asks the merchant to sign in again when there is no session", async () => {
    const fetchImpl = jest.fn();
    const invoke = makeInvoke({ getSession: sessionWith(null), fetchImpl });

    const { error } = await invoke({ action: "list" });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect((error as Error).message).toMatch(/sign in/i);
  });

  it("survives a session read that rejects outright", async () => {
    const invoke = makeInvoke({
      getSession: jest.fn().mockRejectedValue(new Error("boom")),
      fetchImpl: jest.fn(),
    });

    const { error } = await invoke({ action: "list" });

    expect(error).toBeInstanceOf(Error);
  });
});
