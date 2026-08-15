/**
 * Verifying a scanned pickup ticket against the web API.
 *
 * The app cannot check the HMAC itself — API_SECRET lives on the web server
 * and must never ship in a mobile bundle. So the scanned triple goes to
 * /api/orders/track, which verifies timing-safely and returns the order.
 * A forged or guessed order id comes back 401, and this module's job is to
 * turn each HTTP outcome into something staff can act on.
 */

// Native module: not transformable under jest, and every test below injects
// its own webAppUrl anyway. Mirrors lib/customers/capture.test.ts.
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { webAppUrl: "https://webnegosyo.com" } } },
}));

import { verifyPickupTicket } from "./verify";

const ticket = {
  tenantId: "tenant-abc",
  orderId: "order-123",
  token: "a".repeat(64),
};

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("verifyPickupTicket", () => {
  it("returns the order when the token verifies", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        status: "ready",
        customerName: "Ana Cruz",
        total: 350,
        items: [{ name: "Latte", quantity: 2, price: 175, subtotal: 350 }],
      })
    );

    const result = await verifyPickupTicket(ticket, {
      webAppUrl: "https://webnegosyo.com",
      fetchImpl,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.order.customerName).toBe("Ana Cruz");
    expect(result.order.status).toBe("ready");
  });

  it("calls the tracking endpoint with the scanned triple", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(jsonResponse(200, { status: "ready", items: [] }));

    await verifyPickupTicket(ticket, {
      webAppUrl: "https://webnegosyo.com",
      fetchImpl,
    });

    const url = new URL(fetchImpl.mock.calls[0][0] as string);
    expect(url.origin + url.pathname).toBe(
      "https://webnegosyo.com/api/orders/track"
    );
    expect(url.searchParams.get("orderId")).toBe("order-123");
    expect(url.searchParams.get("tenantId")).toBe("tenant-abc");
    expect(url.searchParams.get("token")).toBe("a".repeat(64));
  });

  it("tolerates a trailing slash on the configured web app url", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(jsonResponse(200, { status: "ready", items: [] }));

    await verifyPickupTicket(ticket, {
      webAppUrl: "https://webnegosyo.com/",
      fetchImpl,
    });

    const url = new URL(fetchImpl.mock.calls[0][0] as string);
    expect(url.pathname).toBe("/api/orders/track");
  });

  it("reports an invalid token when the API rejects it", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(jsonResponse(401, { error: "Invalid tracking token" }));

    const result = await verifyPickupTicket(ticket, {
      webAppUrl: "https://webnegosyo.com",
      fetchImpl,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("invalid_token");
  });

  it("reports not found when the order does not exist", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(jsonResponse(404, { error: "Order not found" }));

    const result = await verifyPickupTicket(ticket, {
      webAppUrl: "https://webnegosyo.com",
      fetchImpl,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("not_found");
  });

  it("reports rate limiting separately so staff know to retry", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(jsonResponse(429, { error: "Too many requests" }));

    const result = await verifyPickupTicket(ticket, {
      webAppUrl: "https://webnegosyo.com",
      fetchImpl,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("rate_limited");
  });

  it("reports offline when the request cannot be made", async () => {
    // The counter loses signal constantly. This must be distinguishable from
    // a rejected token — one means "try again", the other means "do not hand
    // this order over".
    const fetchImpl = jest.fn().mockRejectedValue(new Error("Network request failed"));

    const result = await verifyPickupTicket(ticket, {
      webAppUrl: "https://webnegosyo.com",
      fetchImpl,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("offline");
  });

  it("reports a configuration problem when no web app url is set", async () => {
    // A build shipped without webAppUrl would otherwise fail every scan with
    // a generic network error and send someone hunting the wrong problem.
    const fetchImpl = jest.fn();

    const result = await verifyPickupTicket(ticket, {
      webAppUrl: "",
      fetchImpl,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("not_configured");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("treats an unexpected server error as unavailable, not as a valid order", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(500, {}));

    const result = await verifyPickupTicket(ticket, {
      webAppUrl: "https://webnegosyo.com",
      fetchImpl,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("unavailable");
  });

  it("rejects a 200 response that is not an order", async () => {
    // A proxy or captive portal answering 200 with something else must not
    // put a confirm button in front of staff with nothing behind it.
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(200, { hello: "world" }));

    const result = await verifyPickupTicket(ticket, {
      webAppUrl: "https://webnegosyo.com",
      fetchImpl,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("unavailable");
  });

  it("rejects a 200 response whose body is not JSON", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("Unexpected token < in JSON");
      },
    } as unknown as Response);

    const result = await verifyPickupTicket(ticket, {
      webAppUrl: "https://webnegosyo.com",
      fetchImpl,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("unavailable");
  });

  it("defaults malformed item entries rather than dropping the order", async () => {
    // Staff still need to see the order even if one line is odd; a missing
    // quantity showing as blank would be worse than showing 1.
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        status: "ready",
        items: [{ name: "Latte" }, { quantity: 3 }],
      })
    );

    const result = await verifyPickupTicket(ticket, {
      webAppUrl: "https://webnegosyo.com",
      fetchImpl,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.order.items).toEqual([
      { name: "Latte", quantity: 1 },
      { name: "Item", quantity: 3 },
    ]);
  });

  it("tolerates a response with no items array", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(jsonResponse(200, { status: "ready" }));

    const result = await verifyPickupTicket(ticket, {
      webAppUrl: "https://webnegosyo.com",
      fetchImpl,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.order.items).toEqual([]);
  });

  it("carries the store's scan setting through from the tracking payload", async () => {
    // The app cannot read the tenants table; this response is the only place
    // it can learn the store turned scan-to-collect off.
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        status: "ready",
        items: [],
        pickupScanEnabled: false,
      })
    );

    const result = await verifyPickupTicket(ticket, {
      webAppUrl: "https://webnegosyo.com",
      fetchImpl,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.order.scanEnabled).toBe(false);
  });

  it("leaves the scan setting undefined when the response omits it", async () => {
    // An older web deploy has no such field. Undefined must not be read as
    // false downstream, or every store stops scanning on deploy skew.
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(jsonResponse(200, { status: "ready", items: [] }));

    const result = await verifyPickupTicket(ticket, {
      webAppUrl: "https://webnegosyo.com",
      fetchImpl,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.order.scanEnabled).toBeUndefined();
  });

  it("ignores a non-boolean scan setting rather than trusting it", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { status: "ready", items: [], pickupScanEnabled: "false" })
      );

    const result = await verifyPickupTicket(ticket, {
      webAppUrl: "https://webnegosyo.com",
      fetchImpl,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.order.scanEnabled).toBeUndefined();
  });
});
