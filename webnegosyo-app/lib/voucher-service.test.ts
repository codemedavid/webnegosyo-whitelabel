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

import { burnPosRedemptions, listVouchers, lookupVouchers } from "./voucher-service";
import type { OrderDiscountLine } from "./order-totals";

/**
 * The register's two server-mediated voucher calls.
 *
 * The register prices vouchers locally so it survives a flaky counter
 * connection, but two things it cannot do alone: read a merchant's vouchers
 * (they are not on the phone) and burn a redemption (`redeem_voucher()` is
 * service_role only). Both go through the web app, authenticated with the
 * cashier's own session token.
 *
 * The burn is best-effort by the same reasoning as stock depletion: it runs
 * behind a sale already rung up and paid for, and a register that refuses to
 * close a tender because a burn failed is worse than a voucher count that
 * drifts. `redeem_voucher()` is keyed on the order id, so a retry is a no-op
 * rather than a second burn.
 */

const voucherLine = (voucherId: string, amount: number): OrderDiscountLine => ({
  label: "WELCOME10",
  amount,
  voucherId,
  code: "WELCOME10",
});

describe("burnPosRedemptions", () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: "token-1" } },
    });
  });

  it("posts each voucher line to the redeem route with the session token", async () => {
    // Arrange
    const lines = [voucherLine("v-1", 20), voucherLine("v-2", 5)];

    // Act
    await burnPosRedemptions("t1", "order-1", lines, "outlet-9");

    // Assert
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://webnegosyo.com/api/vouchers/redeem");
    expect(init.headers.Authorization).toBe("Bearer token-1");
    expect(JSON.parse(init.body)).toEqual({
      tenantId: "t1",
      orderId: "order-1",
      channel: "pos",
      outletId: "outlet-9",
      redemptions: [
        { voucherId: "v-1", amount: 20 },
        { voucherId: "v-2", amount: 5 },
      ],
    });
  });

  it("ignores a manual discount, which redeems nothing", async () => {
    // A cashier-entered discount has no voucher behind it, so there is no
    // usage count to move.
    await burnPosRedemptions("t1", "order-1", [
      { label: "Discount — Damaged item", amount: 50 },
    ]);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not call the server when the sale had no discount at all", async () => {
    await burnPosRedemptions("t1", "order-1", []);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends only the voucher lines when a sale mixes both kinds", async () => {
    await burnPosRedemptions("t1", "order-1", [
      voucherLine("v-1", 20),
      { label: "Discount — Regular", amount: 10 },
    ]);

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).redemptions).toEqual([
      { voucherId: "v-1", amount: 20 },
    ]);
  });

  it("never throws when the network fails, because the sale is already paid", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));

    await expect(
      burnPosRedemptions("t1", "order-1", [voucherLine("v-1", 20)]),
    ).resolves.toBeUndefined();
  });

  it("does nothing without a session rather than burning anonymously", async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });

    await burnPosRedemptions("t1", "order-1", [voucherLine("v-1", 20)]);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("lookupVouchers", () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: "token-1" } },
    });
  });

  it("returns the vouchers the server resolved for the codes", async () => {
    // Arrange
    const voucher = { id: "v-1", code: "WELCOME10", discountType: "percent" };
    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ vouchers: [voucher] }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    // Act
    const result = await lookupVouchers("t1", ["WELCOME10"]);

    // Assert
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://webnegosyo.com/api/vouchers/lookup");
    expect(JSON.parse(init.body)).toEqual({ tenantId: "t1", codes: ["WELCOME10"] });
    expect(result).toEqual([voucher]);
  });

  it("returns nothing when the lookup fails, so no discount is applied", async () => {
    // A code that cannot be verified must be worth zero, never assumed valid.
    fetchMock = jest.fn().mockRejectedValue(new Error("offline"));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(lookupVouchers("t1", ["WELCOME10"])).resolves.toEqual([]);
  });

  it("returns nothing when the server refuses the request", async () => {
    fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 403 });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(lookupVouchers("t1", ["WELCOME10"])).resolves.toEqual([]);
  });

  it("does not call the server for an empty code list", async () => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(lookupVouchers("t1", [])).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/**
 * The lookup is the one part of register discounting that genuinely needs the
 * network, and it runs behind a spinner the cashier watches. Every other
 * failure — unknown code, refused request, no session — already answers, so
 * the spinner ends and the sheet says something. A request that simply never
 * answers had no such ending: the counter stopped while a customer waited, and
 * the only way out was to force-quit the app.
 *
 * The deadline is what turns "never" into "no", which the sheet already knows
 * how to render. Bounded here rather than in the sheet because the session read
 * can hang too, and a deadline that starts after it is not a deadline.
 */
describe("lookupVouchers deadline", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: "token-1" } },
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("gives up on a request that never answers, so the cashier is not left waiting", async () => {
    // Arrange — a socket that opens and then says nothing, which is what a
    // counter behind a captive portal or a dead uplink actually looks like.
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;

    // Act
    const pending = lookupVouchers("t1", ["WELCOME10"], { timeoutMs: 8000 });
    await jest.advanceTimersByTimeAsync(8000);

    // Assert — fails closed, exactly as an unverifiable code does.
    await expect(pending).resolves.toEqual([]);
  });

  it("releases the socket rather than leaving the request running", async () => {
    // Arrange
    let signal: AbortSignal | undefined;
    global.fetch = jest.fn((_url: unknown, init: { signal?: AbortSignal }) => {
      signal = init.signal;
      return new Promise(() => {});
    }) as unknown as typeof fetch;

    // Act
    const pending = lookupVouchers("t1", ["WELCOME10"], { timeoutMs: 8000 });
    await jest.advanceTimersByTimeAsync(8000);
    await pending;

    // Assert
    expect(signal?.aborted).toBe(true);
  });

  it("counts the session read against the same deadline", async () => {
    // Arrange — reading the session can hang too, on a client mid token
    // refresh with no signal. A deadline that only starts once it returns is
    // not a deadline, and this is the hang that gets reported.
    getSessionMock.mockReturnValue(new Promise(() => {}));
    global.fetch = jest.fn() as unknown as typeof fetch;

    // Act
    const pending = lookupVouchers("t1", ["WELCOME10"], { timeoutMs: 8000 });
    await jest.advanceTimersByTimeAsync(8000);

    // Assert
    await expect(pending).resolves.toEqual([]);
  });

  it("answers immediately when the server does, without waiting out the deadline", async () => {
    // Arrange
    const voucher = { id: "v-1", code: "WELCOME10" };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ vouchers: [voucher] }),
    }) as unknown as typeof fetch;

    // Act
    const result = await lookupVouchers("t1", ["WELCOME10"], { timeoutMs: 8000 });

    // Assert
    expect(result).toEqual([voucher]);
  });
});

describe("listVouchers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: "token-1" } },
    });
  });

  it("asks the web app for the merchant's vouchers with the cashier's own token", async () => {
    // Arrange
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ vouchers: [{ id: "v-1", code: "SAVE20" }] }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    // Act
    const result = await listVouchers("t1");

    // Assert
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://webnegosyo.com/api/vouchers/list");
    expect(init.headers.Authorization).toBe("Bearer token-1");
    expect(JSON.parse(init.body)).toEqual({ tenantId: "t1" });
    expect(result).toEqual([{ id: "v-1", code: "SAVE20" }]);
  });

  it("shows nothing rather than an error when the counter has no signal", async () => {
    // Arrange — the browse list is a convenience; the typed-code path still
    // works. A thrown fetch must not take the discount sheet down with it.
    global.fetch = jest.fn().mockRejectedValue(new Error("offline")) as unknown as typeof fetch;

    // Act & Assert
    await expect(listVouchers("t1")).resolves.toEqual([]);
  });

  it("shows nothing when the server refuses the read", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;

    await expect(listVouchers("t1")).resolves.toEqual([]);
  });

  it("does not call out at all without a session", async () => {
    // Arrange
    getSessionMock.mockResolvedValue({ data: { session: null } });
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    // Act
    const result = await listVouchers("t1");

    // Assert
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });
});
