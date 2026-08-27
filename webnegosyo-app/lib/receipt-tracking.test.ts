import { fetchTrackingUrl } from "./receipt-tracking";
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
  it("POSTs the order ref with the caller's bearer token and returns the URL", async () => {
    const fetchImpl = jest.fn(async () =>
      okResponse({ url: "https://web.example.com/kape/order/order-1?t=beef" }),
    );

    const url = await fetchTrackingUrl(REF, { ...OPTS, fetchImpl });

    expect(url).toBe("https://web.example.com/kape/order/order-1?t=beef");
    const [calledUrl, init] = fetchImpl.mock.calls[0]! as [string, RequestInit];
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

  it("returns null without a token — a demo session mints nothing", async () => {
    const fetchImpl = jest.fn();
    await expect(
      fetchTrackingUrl(REF, { webAppUrl: "https://web.example.com", accessToken: null, fetchImpl }),
    ).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("layoutWantsQr", () => {
  it("is false for tenants on Classic (no saved layout)", () => {
    expect(layoutWantsQr(null)).toBe(false);
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
    expect(segments.some((s) => s.type === "qr")).toBe(true);
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
