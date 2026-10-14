import { createApprovalsApi, newIdempotencyKey, OFFLINE_MESSAGE, type ApprovalsApiDeps } from "./api";

function response(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

function deps(overrides: Partial<ApprovalsApiDeps> = {}) {
  const fetchImpl = jest.fn(async () => response(200, { success: true, data: { requests: [], isApprover: false }, error: null }));
  return {
    fetchImpl,
    deps: {
      getToken: async () => "tok-123",
      baseUrl: () => "https://www.webnegosyo.com",
      fetchImpl,
      timeoutMs: 200,
      ...overrides,
    } as ApprovalsApiDeps,
  };
}

describe("approvals api client", () => {
  test("sends the bearer token and the tenant on a list read", async () => {
    const { deps: d, fetchImpl } = deps();
    const result = await createApprovalsApi(d).list("t-1", "pending");
    expect(result).toEqual({ ok: true, status: 200, data: { requests: [], isApprover: false } });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://www.webnegosyo.com/api/approvals?tenantId=t-1&status=pending");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok-123");
  });

  test("posts a create with the tenant folded into the body", async () => {
    const { deps: d, fetchImpl } = deps();
    await createApprovalsApi(d).create("t-1", {
      kind: "refund", orderId: "o-1", payload: { scope: "whole" }, reasonCode: "wrong_item", idempotencyKey: "sheet_abcdefgh",
    });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toMatchObject({ tenantId: "t-1", kind: "refund", idempotencyKey: "sheet_abcdefgh" });
  });

  test("returns the server's refusal message and code", async () => {
    const { deps: d } = deps({
      fetchImpl: jest.fn(async () => response(409, { success: false, data: null, error: "You already have 3 requests waiting.", code: "too_many_pending" })),
    });
    expect(await createApprovalsApi(d).withdraw("t-1", "r-1")).toEqual({
      ok: false, status: 409, error: "You already have 3 requests waiting.", code: "too_many_pending", data: null,
    });
  });

  test("no session → 401 without calling the network", async () => {
    const { deps: d, fetchImpl } = deps({ getToken: async () => null });
    const result = await createApprovalsApi(d).get("t-1", "r-1");
    expect(result).toMatchObject({ ok: false, status: 401 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("a hung network resolves as offline instead of hanging", async () => {
    const { deps: d } = deps({ fetchImpl: () => new Promise<Response>(() => undefined), timeoutMs: 20 });
    expect(await createApprovalsApi(d).decide("t-1", "r-1", { decision: "approve" })).toMatchObject({
      ok: false, status: 0, error: OFFLINE_MESSAGE, code: "offline",
    });
  });

  test("a hung session read also resolves", async () => {
    const { deps: d } = deps({ getToken: () => new Promise<string | null>(() => undefined), timeoutMs: 20 });
    expect(await createApprovalsApi(d).getRules("t-1")).toMatchObject({ ok: false, status: 0 });
  });

  test("non-JSON error bodies get a plain message", async () => {
    const { deps: d } = deps({ fetchImpl: jest.fn(async () => ({ ok: false, status: 502, json: async () => { throw new Error("html"); } }) as unknown as Response) });
    expect(await createApprovalsApi(d).saveRules("t-1", { directRefundCap: 400 })).toMatchObject({
      ok: false, status: 502, error: "Couldn't send the request. Nothing was sent. Try again.",
    });
  });

  test("retry keys are URL-safe and distinct", () => {
    let n = 0;
    const key = newIdempotencyKey(() => (n += 0.1) % 1, () => 1_760_000_000_000);
    expect(key).toMatch(/^sheet_[a-z0-9_]+$/);
    expect(key.length).toBeGreaterThanOrEqual(8);
    expect(newIdempotencyKey()).not.toBe(newIdempotencyKey());
  });
});
