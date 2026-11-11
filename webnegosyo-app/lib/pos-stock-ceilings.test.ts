/**
 * The register's read of how many of each dish the kitchen can make.
 *
 * Same endpoint the storefront's quantity stepper uses, so a cashier and a
 * customer looking at the same dish are quoted the same number.
 *
 * Never throws and never propagates a failure. A register whose stock read
 * hiccuped must ring up sales exactly as it did before this existed — the
 * warning is an aid, and an aid that can break the till is not one.
 */

import { fetchPosStockCeilings, isFailedStockRead } from "./pos-stock-ceilings";
import { NO_STOCK_CEILINGS } from "./pos-stock-warning";
import { forgetStockPolicies, knownStockPolicy } from "./pos-stock-policy-memo";

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { webAppUrl: "https://shop.test" } } },
}));

const mockToken = jest.fn();
jest.mock("./authorized-post", () => ({
  getAccessTokenBounded: (...args: unknown[]) => mockToken(...args),
}));

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

beforeEach(() => {
  jest.clearAllMocks();
  mockToken.mockResolvedValue(null);
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ ceilings: { "m-pizza": 5 }, optionCeilings: { "m-latte": { "o-oat": 2 } } }),
  });
});

describe("fetchPosStockCeilings", () => {
  it("returns a ceiling per tracked dish", async () => {
    const ceilings = await fetchPosStockCeilings("t1", null);

    expect(ceilings.dishes.get("m-pizza")).toBe(5);
  });

  it("keeps the per-option ceilings, so a line is judged by its configuration", async () => {
    const ceilings = await fetchPosStockCeilings("t1", null);

    expect(ceilings.options.get("m-latte")?.get("o-oat")).toBe(2);
  });

  it("drops malformed option ceilings rather than reading them as empty shelves", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ceilings: {}, optionCeilings: { "m-latte": { "o-oat": "lots" } } }),
    });

    const ceilings = await fetchPosStockCeilings("t1", null);
    expect(ceilings.options.get("m-latte")?.has("o-oat")).toBe(false);
  });

  it("reads the store's stock policy from the route", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ceilings: { "m-pizza": 5 }, stockPolicy: "block" }) });

    const ceilings = await fetchPosStockCeilings("t1", null);
    expect(ceilings.stockPolicy).toBe("block");
    // The tender reads it to know a stock clearance is needed at Charge.
    expect(knownStockPolicy("t1")).toBe("block");
  });

  it("remembers only an explicit policy, never the default it reads for an older server", async () => {
    forgetStockPolicies();
    await fetchPosStockCeilings("t9", null);
    expect(knownStockPolicy("t9")).toBeUndefined();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ceilings: {}, stockPolicy: "warn" }) });
    await fetchPosStockCeilings("t9", null);
    expect(knownStockPolicy("t9")).toBe("warn");
  });

  it("reads warn when an older server sends no policy, or an unknown one", async () => {
    expect((await fetchPosStockCeilings("t1", null)).stockPolicy).toBe("warn");

    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ceilings: {}, stockPolicy: "refuse" }) });
    expect((await fetchPosStockCeilings("t1", null)).stockPolicy).toBe("warn");
  });

  it("gives up on a read that never answers, with no opinion", async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));

    const ceilings = await fetchPosStockCeilings("t1", null, 20);
    expect(ceilings).toBe(NO_STOCK_CEILINGS);
  });

  it("sends the cashier's token when signed in, so the platform limits per person", async () => {
    mockToken.mockResolvedValue("tok-1");
    await fetchPosStockCeilings("t1", null);

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok-1");
  });

  it("still reads without a session — the route is public", async () => {
    await fetchPosStockCeilings("t1", null);

    const init = fetchMock.mock.calls[0][1] as RequestInit | undefined;
    expect((init?.headers as Record<string, string> | undefined)?.Authorization).toBeUndefined();
  });

  it("asks about the register's own branch", async () => {
    await fetchPosStockCeilings("t1", "branch-1");

    expect(String(fetchMock.mock.calls[0][0])).toContain("outletId=branch-1");
  });

  it("omits the branch when the register is not branch-bound", async () => {
    await fetchPosStockCeilings("t1", null);

    expect(String(fetchMock.mock.calls[0][0])).not.toContain("outletId");
  });

  it("knows no ceilings when the request fails", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));

    await expect(fetchPosStockCeilings("t1", null)).resolves.toEqual(NO_STOCK_CEILINGS);
  });

  it("knows no ceilings when the platform answers with an error status", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });

    await expect(fetchPosStockCeilings("t1", null)).resolves.toEqual(NO_STOCK_CEILINGS);
  });

  it("knows no ceilings when the body is not what it expects", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });

    await expect(fetchPosStockCeilings("t1", null)).resolves.toEqual(NO_STOCK_CEILINGS);
  });

  it("asks for nothing without a tenant", async () => {
    const ceilings = await fetchPosStockCeilings(null, null);

    expect(ceilings).toEqual(NO_STOCK_CEILINGS);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("isFailedStockRead", () => {
  it("tells every failure apart from a read that found nothing tracked", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    expect(isFailedStockRead(await fetchPosStockCeilings("t1", null))).toBe(true);
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    expect(isFailedStockRead(await fetchPosStockCeilings("t1", null))).toBe(true);
    fetchMock.mockImplementation(() => new Promise(() => {}));
    expect(isFailedStockRead(await fetchPosStockCeilings("t1", null, 20))).toBe(true);

    fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({ ceilings: {} }) });
    const empty = await fetchPosStockCeilings("t1", null);
    expect(empty.dishes.size).toBe(0);
    expect(isFailedStockRead(empty)).toBe(false);
  });
});
