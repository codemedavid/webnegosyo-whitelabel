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

import { fetchPosStockCeilings } from "./pos-stock-ceilings";

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { webAppUrl: "https://shop.test" } } },
}));

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

beforeEach(() => {
  jest.clearAllMocks();
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ ceilings: { "m-pizza": 5 } }),
  });
});

describe("fetchPosStockCeilings", () => {
  it("returns a ceiling per tracked dish", async () => {
    const ceilings = await fetchPosStockCeilings("t1", null);

    expect(ceilings.get("m-pizza")).toBe(5);
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

    await expect(fetchPosStockCeilings("t1", null)).resolves.toEqual(new Map());
  });

  it("knows no ceilings when the platform answers with an error status", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });

    await expect(fetchPosStockCeilings("t1", null)).resolves.toEqual(new Map());
  });

  it("knows no ceilings when the body is not what it expects", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });

    await expect(fetchPosStockCeilings("t1", null)).resolves.toEqual(new Map());
  });

  it("asks for nothing without a tenant", async () => {
    const ceilings = await fetchPosStockCeilings(null, null);

    expect(ceilings.size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
