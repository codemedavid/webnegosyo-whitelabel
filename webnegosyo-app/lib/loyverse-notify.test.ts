// The module under test imports web-app-url (expo-constants) and supabase for
// its network path; the pure mapper needs neither.
jest.mock("./web-app-url", () => ({
  __esModule: true,
  getWebAppUrl: () => "https://example.test",
}));

const getSession = jest.fn(async () => ({ data: { session: null as unknown } }));
jest.mock("./supabase", () => ({
  __esModule: true,
  supabase: { auth: { getSession: () => getSession() } },
}));

import {
  posLinesToLoyverseOrderLines,
  notifyLoyverseOrderConfirmed,
} from "./loyverse-notify";

describe("posLinesToLoyverseOrderLines", () => {
  it("routes selections by their synced option-id prefix", () => {
    const lines = posLinesToLoyverseOrderLines([
      {
        menuItemId: "mi-1",
        name: "Americano",
        quantity: 2,
        unitPrice: 160,
        subtotal: 320,
        note: "no sugar",
        selections: [
          { groupName: "Size", optionId: "lv-var_l", optionName: "Large" },
          { groupName: "Extras", optionId: "lvm-opt_1", optionName: "Extra shot" },
        ],
      },
    ]);

    expect(lines).toEqual([
      {
        menu_item_id: "mi-1",
        menu_item_name: "Americano",
        variations: { Size: "Large" },
        addons: ["Extra shot"],
        quantity: 2,
        price: 160,
        subtotal: 320,
        special_instructions: "no sugar",
      },
    ]);
  });

  it("sends unsynced selections through both channels so the server can match either", () => {
    const lines = posLinesToLoyverseOrderLines([
      {
        menuItemId: "mi-2",
        name: "Latte",
        quantity: 1,
        unitPrice: 150,
        subtotal: 150,
        selections: [{ groupName: "Milk", optionId: "opt-local", optionName: "Oat" }],
      },
    ]);

    expect(lines[0].variations).toEqual({ Milk: "Oat" });
    expect(lines[0].addons).toEqual(["Oat"]);
  });

  it("omits the variations map when nothing is selected", () => {
    const lines = posLinesToLoyverseOrderLines([
      {
        menuItemId: "mi-3",
        name: "Water",
        quantity: 1,
        unitPrice: 20,
        subtotal: 20,
        selections: [],
      },
    ]);
    expect(lines[0].variations).toBeUndefined();
    expect(lines[0].addons).toEqual([]);
  });
});

/**
 * The orders list and the register drawer confirm orders from rows that carry a
 * total and an item COUNT, never the dishes. They can only name the order, so
 * this call has to be legal with no items at all — the server reads the lines.
 */
describe("notifyLoyverseOrderConfirmed", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    getSession.mockResolvedValue({ data: { session: { access_token: "tok" } } });
  });

  it("posts an order id alone, leaving the server to resolve the lines", async () => {
    await notifyLoyverseOrderConfirmed("tenant-1", { orderId: "order-1" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://example.test/api/loyverse");
    expect(JSON.parse(init.body)).toEqual({
      tenantId: "tenant-1",
      orderId: "order-1",
      context: "order_confirm",
    });
  });

  it("authenticates with the merchant's own session token", async () => {
    await notifyLoyverseOrderConfirmed("tenant-1", { orderId: "order-1" });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer tok");
  });

  it("sends nothing when the merchant has no session", async () => {
    getSession.mockResolvedValue({ data: { session: null } });

    await notifyLoyverseOrderConfirmed("tenant-1", { orderId: "order-1" });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never throws when the push fails, because the order is already confirmed", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));

    await expect(
      notifyLoyverseOrderConfirmed("tenant-1", { orderId: "order-1" }),
    ).resolves.toBeUndefined();
  });
});
