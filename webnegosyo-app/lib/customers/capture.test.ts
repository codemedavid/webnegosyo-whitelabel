/**
 * Telling the platform a sale happened, so the guest gets a profile.
 *
 * The register writes its orders straight to Convex or to the platform Supabase
 * through the app's own adapter, so it passes through none of the web app's
 * order actions — the only places customer capture is wired. A counter sale
 * built no customer profile at all, however carefully the cashier typed the
 * guest's number in.
 *
 * This is the register's way into that path, and it borrows its contract from
 * `lib/pos-stock-notify.ts`: by the time it runs the sale is rung up, tendered
 * and saved, so nothing here may throw. A guest who does not appear in the
 * Regulars list is fixable by backfill; a register that will not close a sale
 * because a bookkeeping call failed is not.
 */

const mockGetSession = jest.fn();

jest.mock("../supabase", () => ({
  supabase: { auth: { getSession: () => mockGetSession() } },
}));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { webAppUrl: "https://example.test" } } },
}));

import { notifyCustomerCapture, buildCapturePayload } from "./capture";

const FACTS = {
  backend: "convex" as const,
  orderId: "order-1",
  name: "Maria Santos",
  contact: "09171234567",
  total: 250,
  createdAt: "2026-08-03T10:00:00Z",
  channel: "Dine-in",
  items: [{ name: "Latte", quantity: 2 }],
};

let fetchMock: jest.Mock;

beforeEach(() => {
  fetchMock = jest.fn().mockResolvedValue({ ok: true });
  global.fetch = fetchMock as unknown as typeof fetch;
  mockGetSession.mockResolvedValue({ data: { session: { access_token: "token-1" } } });
});

afterEach(() => jest.restoreAllMocks());

describe("buildCapturePayload — what gets sent", () => {
  it("carries the sale's facts under the tenant", () => {
    // Arrange / Act
    const payload = buildCapturePayload("t1", FACTS);

    // Assert
    expect(payload).toMatchObject({
      tenantId: "t1",
      orderId: "order-1",
      total: 250,
      channel: "Dine-in",
      items: [{ name: "Latte", quantity: 2 }],
    });
  });

  it.each([
    ["convex", "convex"],
    ["platform", "platform"],
    ["supabase", "tenant_supabase"],
  ])("translates the %s backend to %s", (backend, expected) => {
    // The app and the platform name these differently: the app's "supabase" means
    // the tenant's own project, which the platform calls "tenant_supabase".
    // Sending the app's word would be rejected as an unknown backend.
    const payload = buildCapturePayload("t1", {
      ...FACTS,
      backend: backend as "convex",
    });

    expect(payload?.backend).toBe(expected);
  });

  it("returns null for an order that identifies nobody", () => {
    // A walk-in with no contact details will never become a customer, so the
    // round trip is pure waste on the busiest screen in the app.
    const payload = buildCapturePayload("t1", {
      ...FACTS,
      name: "Walk-in",
      contact: "",
    });

    expect(payload).toBeNull();
  });

  it("returns null without a tenant", () => {
    expect(buildCapturePayload("", FACTS)).toBeNull();
  });

  it("sends an order identified only by a phone in the customer blob", () => {
    // The cashier's entry lands in customerData, not always in `contact`.
    const payload = buildCapturePayload("t1", {
      ...FACTS,
      name: "Walk-in",
      contact: "",
      customerData: { phone: "09171234567" },
    });

    expect(payload).not.toBeNull();
  });
});

describe("notifyCustomerCapture — the call", () => {
  it("posts the sale to the capture route with the caller's token", async () => {
    // Act
    await notifyCustomerCapture("t1", FACTS);

    // Assert
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://example.test/api/customers/capture-order");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer token-1");
    expect(JSON.parse(init.body).orderId).toBe("order-1");
  });

  it("makes no request at all for an anonymous walk-in", async () => {
    await notifyCustomerCapture("t1", { ...FACTS, name: "Walk-in", contact: "" });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("makes no request when there is no session to authenticate with", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    await notifyCustomerCapture("t1", FACTS);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not throw when the request fails", async () => {
    // The sale is already saved and paid. This must not surface at the counter.
    fetchMock.mockRejectedValue(new Error("offline"));

    await expect(notifyCustomerCapture("t1", FACTS)).resolves.toBeUndefined();
  });

  it("does not throw when the session lookup itself fails", async () => {
    mockGetSession.mockRejectedValue(new Error("auth down"));

    await expect(notifyCustomerCapture("t1", FACTS)).resolves.toBeUndefined();
  });
});
