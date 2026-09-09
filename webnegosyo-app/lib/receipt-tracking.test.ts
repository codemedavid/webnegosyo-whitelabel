const mockConstants: { expoConfig: { extra: Record<string, unknown> } | null } = {
  expoConfig: { extra: {} },
};
jest.mock("expo-constants", () => ({
  __esModule: true, // without this the mock is inert (see expo-constants-mock incident)
  get default() {
    return mockConstants;
  },
}));

import { fetchTrackingUrl, getCachedTrackingUrl, clearTrackingUrlCache } from "./receipt-tracking";
import { buildReceiptSegments, layoutWantsQr } from "./receipt-print";

/**
 * The tracking QR needs a signed URL only the web server can mint (the HMAC
 * secret never ships in this bundle — same reasoning as pickup/verify.ts).
 * The fetch is strictly best-effort: any failure returns null, and a null
 * tracking URL simply prints a receipt without a QR. Paper always wins.
 */

const REF = { orderId: "order-1", tenantId: "t1" };
const OPTS = { webAppUrl: "https://web.example.com", accessToken: "jwt-abc" };

function okResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

describe("fetchTrackingUrl", () => {
  afterEach(() => clearTrackingUrlCache());

  it("serves a reprint from memory — the mint happens once per order", async () => {
    const fetchImpl = jest.fn(async () => okResponse({ url: "https://web.example.com/t/x" }));
    await fetchTrackingUrl(REF, { ...OPTS, fetchImpl });
    const again = await fetchTrackingUrl(REF, { ...OPTS, fetchImpl });
    expect(again).toBe("https://web.example.com/t/x");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(getCachedTrackingUrl(REF)).toBe("https://web.example.com/t/x");
  });

  it("does not cache a failed mint — the next print tries again", async () => {
    const fetchImpl = jest.fn(async () => ({ ok: false, status: 500 }) as unknown as Response);
    await fetchTrackingUrl(REF, { ...OPTS, fetchImpl });
    await fetchTrackingUrl(REF, { ...OPTS, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(getCachedTrackingUrl(REF)).toBeNull();
  });

  it("keys the cache per tenant, never handing one store another's link", async () => {
    const fetchImpl = jest.fn(async () => okResponse({ url: "https://web.example.com/t/x" }));
    await fetchTrackingUrl(REF, { ...OPTS, fetchImpl });
    expect(getCachedTrackingUrl({ orderId: "order-1", tenantId: "t2" })).toBeNull();
  });

  it("POSTs the order ref with the caller's bearer token and returns the URL", async () => {
    const fetchImpl = jest.fn(async () =>
      okResponse({ url: "https://web.example.com/kape/order/order-1?t=beef" }),
    );

    const url = await fetchTrackingUrl(REF, { ...OPTS, fetchImpl });

    expect(url).toBe("https://web.example.com/kape/order/order-1?t=beef");
    const [calledUrl, init] = fetchImpl.mock.calls[0]! as unknown as [string, RequestInit];
    expect(calledUrl).toBe("https://web.example.com/api/orders/tracking-url");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer jwt-abc");
    expect(JSON.parse(init.body as string)).toEqual(REF);
  });

  it("returns null on a non-OK response instead of throwing", async () => {
    const fetchImpl = jest.fn(async () =>
      ({ ok: false, status: 403, json: async () => ({}) }) as unknown as Response,
    );
    await expect(fetchTrackingUrl(REF, { ...OPTS, fetchImpl })).resolves.toBeNull();
  });

  it("returns null when the network fails — printing must not depend on signal", async () => {
    const fetchImpl = jest.fn(async () => {
      throw new Error("offline");
    });
    await expect(fetchTrackingUrl(REF, { ...OPTS, fetchImpl })).resolves.toBeNull();
  });

  it("returns null on a malformed body", async () => {
    const fetchImpl = jest.fn(async () => okResponse({ nope: true }));
    await expect(fetchTrackingUrl(REF, { ...OPTS, fetchImpl })).resolves.toBeNull();
  });

  it("uses the canonical www host when the build configured no web app url", async () => {
    // Every shipped build lands here: app.config.ts leaves `extra.webAppUrl`
    // empty on purpose so lib/web-app-url.ts owns the host. A copy of the
    // default that only guards against null therefore reads "" as configured
    // and mints nothing — the QR block goes silent on every receipt.
    mockConstants.expoConfig = { extra: { webAppUrl: "" } };
    const fetchImpl = jest.fn(async () =>
      okResponse({ url: "https://www.webnegosyo.com/kape/order/order-1?t=beef" }),
    );

    const url = await fetchTrackingUrl(REF, { accessToken: "jwt-abc", fetchImpl });

    expect(url).toBe("https://www.webnegosyo.com/kape/order/order-1?t=beef");
    const [calledUrl] = fetchImpl.mock.calls[0]! as unknown as [string, RequestInit];
    expect(calledUrl).toBe("https://www.webnegosyo.com/api/orders/tracking-url");
  });

  it("never posts to the apex host, which 307-redirects and drops the bearer token", async () => {
    mockConstants.expoConfig = { extra: {} };
    const fetchImpl = jest.fn(async () => okResponse({ url: "https://www.webnegosyo.com/x" }));

    await fetchTrackingUrl(REF, { accessToken: "jwt-abc", fetchImpl });

    const [calledUrl] = fetchImpl.mock.calls[0]! as unknown as [string, RequestInit];
    expect(calledUrl).not.toBe("https://webnegosyo.com/api/orders/tracking-url");
  });

  it("returns null without a token — a demo session mints nothing", async () => {
    const fetchImpl = jest.fn();
    await expect(
      fetchTrackingUrl(REF, { webAppUrl: "https://web.example.com", accessToken: null, fetchImpl }),
    ).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("layoutWantsQr", () => {
  it("is true for tenants with nothing saved — the Modern default carries the QR", () => {
    expect(layoutWantsQr(null)).toBe(true);
    expect(layoutWantsQr("classic")).toBe(false);
  });

  it("is true for the detailed preset and any custom layout with a qr block", () => {
    expect(layoutWantsQr("detailed")).toBe(true);
    expect(layoutWantsQr({ version: 1, blocks: [{ kind: "qr" }] })).toBe(true);
    expect(layoutWantsQr({ version: 1, blocks: [{ kind: "items" }] })).toBe(false);
  });
});

describe("buildReceiptSegments", () => {
  const order = {
    _id: "abcdef1234567890",
    _creationTime: Date.UTC(2026, 6, 26, 4, 30),
    customerName: "Walk-in",
    customerContact: "n/a",
    total: 100,
    items: [{ menuItemName: "Latte", quantity: 1, subtotal: 100 }],
  };

  it("emits a qr segment when the layout has one and a URL was minted", () => {
    const segments = buildReceiptSegments(
      order,
      "Kape Co",
      { version: 1, blocks: [{ kind: "businessName" }, { kind: "qr" }] },
      "https://web.example.com/kape/order/x?t=y",
    );
    expect(segments.some((s: { type: string }) => s.type === "qr")).toBe(true);
  });

  it("prints QR-free when no URL could be minted, whatever the layout says", () => {
    const segments = buildReceiptSegments(
      order,
      "Kape Co",
      { version: 1, blocks: [{ kind: "businessName" }, { kind: "qr" }] },
      null,
    );
    expect(segments).toEqual([{ type: "text", text: expect.stringContaining("KAPE CO") }]);
  });
});

describe("fetchTrackingUrl — never holds the receipt hostage", () => {
  it("gives up on a mint that never answers and prints without a QR", async () => {
    jest.useFakeTimers();
    const hang: typeof fetch = () => new Promise(() => undefined);
    const pending = fetchTrackingUrl(
      { orderId: "o1", tenantId: "t1" },
      { accessToken: "tok", webAppUrl: "https://www.webnegosyo.com", fetchImpl: hang, timeoutMs: 1000 },
    );
    await jest.advanceTimersByTimeAsync(1001);
    await expect(pending).resolves.toBeNull();
    jest.useRealTimers();
  });
});
