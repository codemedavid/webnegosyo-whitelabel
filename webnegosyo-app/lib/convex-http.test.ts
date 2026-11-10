import { postConvexMutation, type ConvexMutationRequest } from "./convex-http";

const URL_ = "https://store.convex.cloud";
const REQUEST: ConvexMutationRequest = {
  convexUrl: URL_,
  path: "notifications:registerPushToken",
  args: { userId: "u1", token: "ExpoPush[abc]" },
};

function reply(status: number, body: unknown): Response {
  return { status, ok: status < 300, json: async () => body } as unknown as Response;
}

function headersOf(call: unknown[]): Record<string, string> {
  return (call[1] as RequestInit).headers as Record<string, string>;
}

describe("postConvexMutation", () => {
  it("sends the session token and the mutation", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(reply(200, { status: "success", value: null }));

    const result = await postConvexMutation(REQUEST, { getToken: async () => "jwt-1", fetchImpl });

    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`${URL_}/api/mutation`);
    expect(headersOf(fetchImpl.mock.calls[0]).Authorization).toBe("Bearer jwt-1");
    expect(JSON.parse(init.body)).toEqual({ path: REQUEST.path, args: REQUEST.args, format: "json" });
  });

  it("goes without a token when none could be read, so an unenforced store still rings", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(reply(200, { status: "success" }));

    await expect(postConvexMutation(REQUEST, { getToken: async () => null, fetchImpl })).resolves.toEqual({ ok: true });

    expect(headersOf(fetchImpl.mock.calls[0]).Authorization).toBeUndefined();
  });

  it("reads a refusal out of the body", async () => {
    // Convex answers a failed function with 560, and the reason only in the body.
    const fetchImpl = jest.fn().mockResolvedValue(
      reply(560, { status: "error", errorMessage: "[Request ID: 5f2] Server Error", errorData: "Unauthorized: wrong_tenant" })
    );

    const result = await postConvexMutation(REQUEST, { getToken: async () => "jwt-1", fetchImpl });

    expect(result).toEqual({ ok: false, error: "Unauthorized: wrong_tenant" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("treats a 200 that says error as a failure", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(reply(200, { status: "error", errorMessage: "Nope" }));

    await expect(postConvexMutation(REQUEST, { getToken: async () => "jwt-1", fetchImpl })).resolves.toEqual({
      ok: false,
      error: "Nope",
    });
  });

  it("tries once without a token the deployment rejected: an older store has no auth config at all", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(reply(401, { code: "NoAuthProvider", message: "No auth provider found" }))
      .mockResolvedValueOnce(reply(200, { status: "success" }));

    await expect(postConvexMutation(REQUEST, { getToken: async () => "jwt-1", fetchImpl })).resolves.toEqual({ ok: true });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(headersOf(fetchImpl.mock.calls[1]).Authorization).toBeUndefined();
  });

  it("never throws, and never repeats the token in what it reports", async () => {
    const down = jest.fn().mockRejectedValue(new TypeError("Network request failed"));
    await expect(postConvexMutation(REQUEST, { getToken: async () => "jwt-1", fetchImpl: down })).resolves.toEqual({
      ok: false,
      error: "Network request failed",
    });

    const garbled = jest.fn().mockResolvedValue({ status: 502, ok: false, json: async () => { throw new Error("not json"); } });
    const result = await postConvexMutation(REQUEST, { getToken: async () => "jwt-1", fetchImpl: garbled });
    expect(result).toEqual({ ok: false, error: "HTTP 502" });
    expect(JSON.stringify(result)).not.toContain("jwt-1");
  });

  it("survives a token read that throws", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(reply(200, { status: "success" }));
    const getToken = async () => { throw new Error("locked"); };

    await expect(postConvexMutation(REQUEST, { getToken, fetchImpl })).resolves.toEqual({ ok: true });
  });
});
