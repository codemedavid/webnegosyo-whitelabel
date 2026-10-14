jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: { extra: { webAppUrl: "https://webnegosyo.com" } },
  },
}));

const getSessionMock = jest.fn();
jest.mock("./supabase", () => ({
  supabase: { auth: { getSession: getSessionMock } },
}));

import {
  classifyStockResponse,
  notifyOrderStockRedeplete,
  notifyPosStockDepletion,
  notifyOrderStockRestore,
  withStockRetry,
  type StockPostOutcome,
} from "./pos-stock-notify";
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
    ).resolves.toBe("retry");
  });

  it("never throws when the session lookup fails", async () => {
    // Arrange
    getSessionMock.mockRejectedValue(new Error("auth offline"));

    // Act / Assert
    await expect(
      notifyPosStockDepletion("t1", "order-1", items),
    ).resolves.toBe("retry");
  });

  it("reports ok once the platform accepted the depletion", async () => {
    await expect(notifyPosStockDepletion("t1", "order-1", items)).resolves.toBe("ok");
  });

  it("reports retry when there was no session to send it with", async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    await expect(notifyPosStockDepletion("t1", "order-1", items)).resolves.toBe("retry");
  });

  it("reports retry on a server error and permanent on a refusal", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 });
    await expect(notifyPosStockDepletion("t1", "order-1", items)).resolves.toBe("retry");
    fetchMock.mockResolvedValueOnce({ ok: false, status: 409 });
    await expect(notifyPosStockDepletion("t1", "order-1", items)).resolves.toBe("permanent");
  });

  it("treats a sale with no items as already done", async () => {
    await expect(notifyPosStockDepletion("t1", "order-1", [])).resolves.toBe("ok");
  });
});

describe("notifyOrderStockRestore", () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: "token-1" } },
    });
  });

  it("asks the platform to reverse the order-s sale movements", async () => {
    // Act
    await notifyOrderStockRestore("t1", "jh7dm2p8qr3n5x9");

    // Assert
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://webnegosyo.com/api/inventory/order-stock");
    expect(init.headers.Authorization).toBe("Bearer token-1");
    expect(JSON.parse(init.body)).toEqual({
      tenantId: "t1",
      orderId: "jh7dm2p8qr3n5x9",
      action: "restore",
    });
  });

  it("sends no items, since the platform derives the reversal itself", async () => {
    // Act
    await notifyOrderStockRestore("t1", "order-1");

    // Assert
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty("items");
  });

  it("does not call the platform when there is no session", async () => {
    // Arrange
    getSessionMock.mockResolvedValue({ data: { session: null } });

    // Act
    await notifyOrderStockRestore("t1", "order-1");

    // Assert
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never throws when the platform is unreachable", async () => {
    // Arrange — the cancellation is already saved; a stock write must never
    // make an order un-cancellable.
    fetchMock.mockRejectedValue(new Error("network down"));

    // Act / Assert
    await expect(
      notifyOrderStockRestore("t1", "order-1"),
    ).resolves.toBe("retry");
  });
});

describe("audit source", () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;
    getSessionMock.mockResolvedValue({ data: { session: { access_token: "token-1" } } });
  });

  it("tells the platform which screen deducted the stock", async () => {
    await notifyPosStockDepletion("t1", "order-1", items, "qr_scan");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ source: "qr_scan" });
  });

  it("sends no source key when none is named, so old requests are unchanged", async () => {
    await notifyPosStockDepletion("t1", "order-1", items);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty("source");
  });

  it("names the source of a restore", async () => {
    await notifyOrderStockRestore("t1", "order-1", "pos");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ action: "restore", source: "pos" });
  });
});

describe("notifyOrderStockRedeplete", () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock as unknown as typeof fetch;
    getSessionMock.mockResolvedValue({ data: { session: { access_token: "token-1" } } });
  });

  it("asks the platform to re-spend what the cancellation returned, sending no lines", async () => {
    // Act
    const outcome = await notifyOrderStockRedeplete("t1", "order-1", "merchant_app");

    // Assert
    expect(outcome).toBe("ok");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      tenantId: "t1",
      orderId: "order-1",
      action: "redeplete",
      source: "merchant_app",
    });
  });

  it("reports a refusal for an order that is still cancelled as permanent", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 409 });
    await expect(notifyOrderStockRedeplete("t1", "order-1")).resolves.toBe("permanent");
  });
});

describe("classifyStockResponse", () => {
  it.each([
    [true, 200, "ok"],
    [false, 400, "permanent"],
    [false, 401, "retry"],
    [false, 403, "permanent"],
    [false, 409, "permanent"],
    [false, 404, "retry"],
    [false, 429, "retry"],
    [false, 500, "retry"],
    [false, 503, "retry"],
    [false, null, "retry"],
  ] as const)("ok=%s status=%s is %s", (ok, status, expected) => {
    expect(classifyStockResponse(ok, status)).toBe(expected);
  });
});

describe("withStockRetry", () => {
  it("retries a transient failure after each backoff delay until it lands", async () => {
    // Arrange
    const outcomes: StockPostOutcome[] = ["retry", "retry", "ok"];
    const attempt = jest.fn(async () => outcomes.shift() ?? "ok");
    const sleep = jest.fn().mockResolvedValue(undefined);

    // Act
    const outcome = await withStockRetry(attempt, { delaysMs: [10, 20, 30], sleep });

    // Assert
    expect(outcome).toBe("ok");
    expect(attempt).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[10], [20]]);
  });

  it("stops at once on a permanent refusal", async () => {
    const attempt = jest.fn(async (): Promise<StockPostOutcome> => "permanent");
    const sleep = jest.fn().mockResolvedValue(undefined);

    await expect(withStockRetry(attempt, { delaysMs: [10, 20], sleep })).resolves.toBe("permanent");
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("gives back retry once every delay is spent", async () => {
    const attempt = jest.fn(async (): Promise<StockPostOutcome> => "retry");
    const sleep = jest.fn().mockResolvedValue(undefined);

    await expect(withStockRetry(attempt, { delaysMs: [10, 20], sleep })).resolves.toBe("retry");
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it("never throws, even when an attempt does", async () => {
    const attempt = jest.fn(async (): Promise<StockPostOutcome> => {
      throw new Error("boom");
    });
    await expect(withStockRetry(attempt, { delaysMs: [], sleep: jest.fn() })).resolves.toBe("retry");
  });
});
