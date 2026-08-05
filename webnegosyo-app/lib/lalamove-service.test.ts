/**
 * Booking, syncing and cancelling a Lalamove delivery from the merchant app.
 *
 * The four Lalamove operations were only ever Convex actions. Every tenant on
 * the shared platform Supabase has no Convex deployment at all, so the delivery
 * card's buttons could not reach anything — the merchant could see a booked
 * delivery (once the DTO carried it) but never book, sync or cancel one.
 *
 * This module is the seam: it picks the transport for the session and, on the
 * platform, posts to the web app's Lalamove route with the merchant's own
 * token — the same arrangement the register already uses to burn vouchers and
 * deplete stock, because the Lalamove API keys live on the server and must
 * never reach a phone.
 */

import {
  resolveLalamoveTransport,
  runPlatformLalamoveOp,
} from "./lalamove-service";

jest.mock("./supabase", () => ({
  supabase: { auth: { getSession: jest.fn() } },
}));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { webAppUrl: "https://example.test" } } },
}));

import { supabase } from "./supabase";

function mockSession(token: string | null) {
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({
    data: { session: token ? { access_token: token } : null },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSession("tok");
  global.fetch = jest.fn();
});

describe("resolveLalamoveTransport", () => {
  it("sends a platform-backed store to the web route, not to Convex", () => {
    // Arrange: the store whose orders live in the shared database. It has no
    // deployment url, so the Convex action refs resolve to nothing.
    const session = { orderBackend: "platform" as const, convexUrl: null };

    // Act
    const transport = resolveLalamoveTransport(session);

    // Assert
    expect(transport).toBe("platform");
  });

  it("keeps a Convex store on its own deployment", () => {
    // Arrange
    const session = { orderBackend: "convex" as const, convexUrl: "https://x.convex.cloud" };

    // Act
    const transport = resolveLalamoveTransport(session);

    // Assert
    expect(transport).toBe("convex");
  });

  it("treats an unresolved session with a deployment url as Convex", () => {
    // Arrange: orderBackend is null until the session patch lands. The
    // historical rule — a url means Convex — keeps the card working meanwhile.
    const session = { orderBackend: null, convexUrl: "https://x.convex.cloud" };

    // Act
    const transport = resolveLalamoveTransport(session);

    // Assert
    expect(transport).toBe("convex");
  });

  it("reports unavailable for a per-tenant Supabase project", () => {
    // Arrange: a separate project the app ships no adapter for. Claiming a
    // transport here would post a booking at the wrong database.
    const session = { orderBackend: "supabase" as const, convexUrl: null };

    // Act
    const transport = resolveLalamoveTransport(session);

    // Assert
    expect(transport).toBe("unavailable");
  });

  it("reports unavailable when there is no backend at all", () => {
    // Arrange
    const session = { orderBackend: null, convexUrl: null };

    // Act
    const transport = resolveLalamoveTransport(session);

    // Assert
    expect(transport).toBe("unavailable");
  });
});

describe("runPlatformLalamoveOp", () => {
  it("posts the operation with the merchant's own token", async () => {
    // Arrange
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });

    // Act
    await runPlatformLalamoveOp({ op: "book", tenantId: "t1", orderId: "o1" });

    // Assert
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("https://example.test/api/lalamove");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body)).toEqual({ op: "book", tenantId: "t1", orderId: "o1" });
  });

  it("carries the tip amount on a priority fee", async () => {
    // Arrange
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });

    // Act
    await runPlatformLalamoveOp({
      op: "priority_fee",
      tenantId: "t1",
      orderId: "o1",
      amount: "50",
    });

    // Assert
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(init.body).amount).toBe("50");
  });

  it("returns the server's refusal rather than a generic failure", async () => {
    // Arrange: the reason is the whole value of the message. "Quotation
    // expired" tells a merchant to re-quote; "Something went wrong" does not.
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: "Quotation expired" }),
    });

    // Act
    const result = await runPlatformLalamoveOp({ op: "book", tenantId: "t1", orderId: "o1" });

    // Assert
    expect(result).toEqual({ success: false, error: "Quotation expired" });
  });

  it("reports failure instead of posting when there is no session", async () => {
    // Arrange
    mockSession(null);

    // Act
    const result = await runPlatformLalamoveOp({ op: "book", tenantId: "t1", orderId: "o1" });

    // Assert
    expect(result.success).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("reports failure when the network is gone", async () => {
    // Arrange: a merchant booking a rider from a shop with poor signal must be
    // told it did not go through, not shown a success alert.
    (global.fetch as jest.Mock).mockRejectedValue(new Error("offline"));

    // Act
    const result = await runPlatformLalamoveOp({ op: "book", tenantId: "t1", orderId: "o1" });

    // Assert
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("gives up rather than leaving the button spinning forever", async () => {
    // Arrange: `fetch` has no timeout of its own.
    global.fetch = jest.fn(() => new Promise(() => {})) as never;

    // Act
    const result = await runPlatformLalamoveOp(
      { op: "book", tenantId: "t1", orderId: "o1" },
      { timeoutMs: 20 },
    );

    // Assert
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/took too long|timed out/i);
  });

  it("warns that a timed-out booking may still have placed a rider", async () => {
    // Arrange: the dangerous instruction after a timeout is "try again" — the
    // booking may well have landed, and a second one sends two riders and
    // bills the merchant twice.
    global.fetch = jest.fn(() => new Promise(() => {})) as never;

    // Act
    const result = await runPlatformLalamoveOp(
      { op: "book", tenantId: "t1", orderId: "o1" },
      { timeoutMs: 20 },
    );

    // Assert
    expect(result.error).toMatch(/may have been booked|check before booking again/i);
  });
});
