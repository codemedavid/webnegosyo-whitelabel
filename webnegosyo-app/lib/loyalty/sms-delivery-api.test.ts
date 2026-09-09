import {
  createLoyaltySmsDeliveryApi,
  enrollLoyaltySmsDevice,
  revokeLoyaltySmsDevice,
  DeviceRevokedError,
} from "./sms-delivery-api";

const tenantId = "11111111-1111-4111-8111-111111111111";
const deviceId = "33333333-3333-4333-8333-333333333333";
const jobId = "44444444-4444-4444-8444-444444444444";
const leaseToken = "55555555-5555-4555-8555-555555555555";
const credential = "A".repeat(43);
const device = { deviceId, credential };

function response(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function setup(session: { access_token: string } | null = { access_token: "token" }) {
  const fetchImpl = jest.fn<Promise<Response>, [string, RequestInit?]>();
  const deps = {
    webAppUrl: "https://www.example.test",
    fetchImpl,
    getSession: async () => ({ data: { session } }),
    sessionTimeoutMs: 50,
    requestTimeoutMs: 50,
  };
  return { fetchImpl, deps, api: createLoyaltySmsDeliveryApi(deps, { tenantId, device }) };
}

function sentBody(fetchImpl: jest.Mock, index = 0): Record<string, unknown> {
  return JSON.parse(String(fetchImpl.mock.calls[index][1]?.body));
}

describe("claim", () => {
  test("posts the device identity with the bearer session and returns the lease", async () => {
    const { api, fetchImpl } = setup();
    const lease = { jobId, leaseToken, leaseExpiresAt: "2026-09-09T12:00:30+00:00" };
    fetchImpl.mockResolvedValue(response(200, { job: lease }));
    expect(await api.claim()).toEqual(lease);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://www.example.test/api/loyalty/sms-delivery/claim");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer token");
    expect(sentBody(fetchImpl)).toEqual({ tenantId, deviceId, credential });
  });

  test("returns null for an empty queue", async () => {
    const { api, fetchImpl } = setup();
    fetchImpl.mockResolvedValue(response(200, { job: null }));
    expect(await api.claim()).toBeNull();
  });

  test("a 403 means the device was revoked: the host is told, then the call throws", async () => {
    const { deps, fetchImpl } = setup();
    const onRevoked = jest.fn();
    const api = createLoyaltySmsDeliveryApi(deps, { tenantId, device }, { onRevoked });
    fetchImpl.mockResolvedValue(response(403, { error: "Forbidden" }));
    await expect(api.claim()).rejects.toBeInstanceOf(DeviceRevokedError);
    expect(onRevoked).toHaveBeenCalledTimes(1);
    await expect(api.finish({ jobId, leaseToken }, "sent")).rejects.toBeInstanceOf(DeviceRevokedError);
    expect(onRevoked).toHaveBeenCalledTimes(2);
  });

  test.each([503, 500, 400])("other statuses throw so the worker treats them as unavailable: %i", async (status) => {
    const { api, fetchImpl } = setup();
    fetchImpl.mockResolvedValue(response(status, { error: "x" }));
    await expect(api.claim()).rejects.toThrow();
  });

  test("throws without a session instead of posting unauthenticated", async () => {
    const { api, fetchImpl } = setup(null);
    await expect(api.claim()).rejects.toThrow("signed out");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("a hung session read is bounded by the deadline", async () => {
    const fetchImpl = jest.fn();
    const api = createLoyaltySmsDeliveryApi(
      {
        webAppUrl: "https://www.example.test",
        fetchImpl,
        getSession: () => new Promise(() => {}),
        sessionTimeoutMs: 10,
        requestTimeoutMs: 10,
      },
      { tenantId, device },
    );
    await expect(api.claim()).rejects.toThrow("timeout");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("a hung request is bounded by the deadline", async () => {
    const { api, fetchImpl } = setup();
    fetchImpl.mockReturnValue(new Promise(() => {}));
    await expect(api.claim()).rejects.toThrow("timeout");
  });

  test("refuses a malformed lease from the server", async () => {
    const { api, fetchImpl } = setup();
    fetchImpl.mockResolvedValue(response(200, { job: { jobId, leaseToken: "bad", leaseExpiresAt: "x" } }));
    await expect(api.claim()).rejects.toThrow();
  });
});

describe("authorize", () => {
  const job = { jobId, leaseToken };

  test("returns the dispatch grant", async () => {
    const { api, fetchImpl } = setup();
    const grant = { jobId, leaseToken, phone: "+639171234567", code: "012345", expiresAt: "2026-09-09T12:05:00+00:00" };
    fetchImpl.mockResolvedValue(response(200, { grant }));
    expect(await api.authorize(job)).toEqual(grant);
    expect(fetchImpl.mock.calls[0][0]).toBe("https://www.example.test/api/loyalty/sms-delivery/authorize");
    expect(sentBody(fetchImpl)).toEqual({ tenantId, deviceId, credential, jobId, leaseToken });
  });

  test("returns null when the server refuses the grant", async () => {
    const { api, fetchImpl } = setup();
    fetchImpl.mockResolvedValue(response(200, { grant: null }));
    expect(await api.authorize(job)).toBeNull();
  });

  test("throws on transport failure so the worker records an uncertain outcome", async () => {
    const { api, fetchImpl } = setup();
    fetchImpl.mockRejectedValue(new Error("socket closed"));
    await expect(api.authorize(job)).rejects.toThrow();
  });
});

describe.each(["finish", "recover"] as const)("%s", (action) => {
  const job = { jobId, leaseToken };

  test("posts the outcome and returns whether it was applied", async () => {
    const { api, fetchImpl } = setup();
    fetchImpl.mockResolvedValue(response(200, { applied: true }));
    expect(await api[action](job, "sent")).toBe(true);
    expect(fetchImpl.mock.calls[0][0]).toBe(`https://www.example.test/api/loyalty/sms-delivery/${action}`);
    expect(sentBody(fetchImpl)).toEqual({ tenantId, deviceId, credential, jobId, leaseToken, outcome: "sent" });
  });

  test("a refused acknowledgement is false, not a throw", async () => {
    const { api, fetchImpl } = setup();
    fetchImpl.mockResolvedValue(response(200, { applied: false }));
    expect(await api[action](job, "failed")).toBe(false);
  });

  test("a 503 throws so the worker retries the acknowledgement", async () => {
    const { api, fetchImpl } = setup();
    fetchImpl.mockResolvedValue(response(503, { error: "retry" }));
    await expect(api[action](job, "sent")).rejects.toThrow();
  });
});

describe("enrollment", () => {
  test("returns the minted device and credential once", async () => {
    const { deps, fetchImpl } = setup();
    fetchImpl.mockResolvedValue(response(200, { success: true, device }));
    expect(await enrollLoyaltySmsDevice(deps, tenantId)).toEqual({ ok: true, device });
    expect(fetchImpl.mock.calls[0][0]).toBe("https://www.example.test/api/loyalty/sms-devices");
    expect(sentBody(fetchImpl)).toEqual({ tenantId });
  });

  test("maps a refusal and an outage to actionable messages", async () => {
    const { deps, fetchImpl } = setup();
    fetchImpl.mockResolvedValue(response(403, { error: "Device enrollment was refused." }));
    expect(await enrollLoyaltySmsDevice(deps, tenantId)).toEqual({
      ok: false,
      error: "Device enrollment was refused.",
    });
    fetchImpl.mockResolvedValue(response(503, { error: "down" }));
    expect((await enrollLoyaltySmsDevice(deps, tenantId)).ok).toBe(false);
    fetchImpl.mockResolvedValue(response(200, { success: true, device: { deviceId, credential: "bad" } }));
    expect((await enrollLoyaltySmsDevice(deps, tenantId)).ok).toBe(false);
  });

  test("revokes by device ID", async () => {
    const { deps, fetchImpl } = setup();
    fetchImpl.mockResolvedValue(response(200, { success: true }));
    expect(await revokeLoyaltySmsDevice(deps, tenantId, deviceId)).toEqual({ ok: true });
    expect(fetchImpl.mock.calls[0][1]?.method).toBe("DELETE");
    expect(sentBody(fetchImpl)).toEqual({ tenantId, deviceId });
  });
});
