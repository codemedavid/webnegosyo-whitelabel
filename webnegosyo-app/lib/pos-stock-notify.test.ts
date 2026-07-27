jest.mock("expo-constants", () => ({
  default: {
    expoConfig: { extra: { webAppUrl: "https://webnegosyo.com" } },
  },
}));

const getSessionMock = jest.fn();
jest.mock("./supabase", () => ({
  supabase: { auth: { getSession: getSessionMock } },
}));

import { notifyPosStockDepletion } from "./pos-stock-notify";
import type { PosStockItem } from "./pos-stock";

const items: PosStockItem[] = [
  { menuItemId: "m-latte", quantity: 2, optionIds: ["o-large"] },
];

describe("notifyPosStockDepletion", () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: "token-1" } },
    });
  });

  it("posts the sale to the platform depletion route with the session token", async () => {
    // Act
    await notifyPosStockDepletion("t1", "jh7dm2p8qr3n5x9", items);

    // Assert
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://webnegosyo.com/api/inventory/order-stock");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer token-1");
    expect(JSON.parse(init.body)).toEqual({
      tenantId: "t1",
      orderId: "jh7dm2p8qr3n5x9",
      items,
    });
  });

  it("does not call the platform when there is no session", async () => {
    // Arrange — a signed-out register must not fire an unauthenticated write.
    getSessionMock.mockResolvedValue({ data: { session: null } });

    // Act
    await notifyPosStockDepletion("t1", "order-1", items);

    // Assert
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips the call entirely for a sale with no items", async () => {
    // Act
    await notifyPosStockDepletion("t1", "order-1", []);

    // Assert
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never throws when the platform is unreachable", async () => {
    // Arrange — the sale is already rung up and paid; a stock write must not
    // be able to fail the tender screen.
    fetchMock.mockRejectedValue(new Error("network down"));

    // Act / Assert
    await expect(
      notifyPosStockDepletion("t1", "order-1", items),
    ).resolves.toBeUndefined();
  });

  it("never throws when the session lookup fails", async () => {
    // Arrange
    getSessionMock.mockRejectedValue(new Error("auth offline"));

    // Act / Assert
    await expect(
      notifyPosStockDepletion("t1", "order-1", items),
    ).resolves.toBeUndefined();
  });
});
