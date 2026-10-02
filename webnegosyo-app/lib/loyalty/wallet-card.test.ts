import {
  isMemberCardCode,
  identifyWalletCard,
  resolveScannedCustomer,
  describeScanFailure,
  type WalletCardDeps,
} from "./wallet-card";
import type { CustomerRecord } from "../customers/repo";

jest.mock("../supabase", () => ({ supabase: {} }));
jest.mock("../web-app-url", () => ({ getWebAppUrl: () => "https://store.test" }));
jest.mock("../customers/repo", () => ({
  listCustomers: jest.fn(),
  createCustomer: jest.fn(),
}));

const CODE = `WNLC1.${"A".repeat(24)}`;

function deps(response: { status: number; body: unknown } | Error): WalletCardDeps {
  return {
    getAccessToken: async () => "session",
    fetch: jest.fn(async () => {
      if (response instanceof Error) throw response;
      return { ok: response.status < 300, status: response.status, json: async () => response.body };
    }) as unknown as WalletCardDeps["fetch"],
  };
}

describe("isMemberCardCode", () => {
  it("accepts only our wallet card QR", () => {
    expect(isMemberCardCode(CODE)).toBe(true);
    expect(isMemberCardCode(` ${CODE}\n`)).toBe(true);
    expect(isMemberCardCode(`v1.${"a".repeat(43)}.${"f".repeat(64)}`)).toBe(false);
    expect(isMemberCardCode("https://example.com")).toBe(false);
  });
});

describe("identifyWalletCard", () => {
  it("posts the scanned code with the cashier's session", async () => {
    const d = deps({ status: 200, body: { success: true, phoneE164: "+639171234567" } });
    await expect(identifyWalletCard("tenant-1", CODE, d)).resolves.toEqual({ ok: true, phoneE164: "+639171234567" });
    const [url, init] = (d.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("https://store.test/api/loyalty/passes/identify");
    expect(init.headers.Authorization).toBe("Bearer session");
    expect(JSON.parse(init.body)).toEqual({ tenantId: "tenant-1", code: CODE });
  });

  it("refuses a code that is not a member card without calling the server", async () => {
    const d = deps({ status: 200, body: {} });
    await expect(identifyWalletCard("tenant-1", "hello", d)).resolves.toEqual({ ok: false, reason: "not_a_card" });
    expect(d.fetch).not.toHaveBeenCalled();
  });

  it.each([
    [404, "not_found"],
    [403, "forbidden"],
    [401, "signed_out"],
    [503, "unavailable"],
  ])("maps HTTP %s to %s", async (status, reason) => {
    await expect(identifyWalletCard("tenant-1", CODE, deps({ status, body: {} }))).resolves.toEqual({ ok: false, reason });
  });

  it("a network failure is unavailable, not a crash", async () => {
    await expect(identifyWalletCard("tenant-1", CODE, deps(new Error("offline")))).resolves.toEqual({ ok: false, reason: "unavailable" });
  });

  it("no session is signed_out", async () => {
    const d = { ...deps({ status: 200, body: {} }), getAccessToken: async () => null };
    await expect(identifyWalletCard("tenant-1", CODE, d)).resolves.toEqual({ ok: false, reason: "signed_out" });
  });

  it("a malformed success body is unavailable", async () => {
    await expect(identifyWalletCard("tenant-1", CODE, deps({ status: 200, body: { success: true, phoneE164: "0917" } })))
      .resolves.toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("resolveScannedCustomer", () => {
  const record = (overrides: Partial<CustomerRecord>): CustomerRecord =>
    ({ id: "c1", name: "Maria", phoneE164: "+639171234567", email: null, ...overrides }) as CustomerRecord;

  it("attaches the saved guest with that exact number", async () => {
    const repo = {
      listCustomers: jest.fn(async () => [record({ id: "other", phoneE164: "+639170000000" }), record({})]),
      createCustomer: jest.fn(),
    };
    await expect(resolveScannedCustomer("tenant-1", "+639171234567", repo)).resolves.toEqual({
      id: "c1", name: "Maria", phoneE164: "+639171234567", email: null,
    });
    expect(repo.createCustomer).not.toHaveBeenCalled();
  });

  it("saves the card holder as a new guest when the store has never seen them at the counter", async () => {
    const repo = {
      listCustomers: jest.fn(async () => []),
      createCustomer: jest.fn(async () => record({ id: "new", name: null })),
    };
    const attached = await resolveScannedCustomer("tenant-1", "+639171234567", repo);
    expect(repo.createCustomer).toHaveBeenCalledWith("tenant-1", {
      name: null, phoneE164: "+639171234567", email: null, notes: null,
    });
    expect(attached.id).toBe("new");
  });
});

describe("describeScanFailure", () => {
  it("speaks to the cashier", () => {
    expect(describeScanFailure("not_a_card")).toMatch(/not a loyalty card/i);
    expect(describeScanFailure("not_found")).toMatch(/another store|not recognised/i);
    expect(describeScanFailure("forbidden")).toMatch(/permission/i);
  });
});
