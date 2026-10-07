import {
  isMemberCardCode,
  identifyWalletCard,
  resolveScannedCustomer,
  describeScanFailure,
  describeAttachFailure,
  attachFailureDetail,
  type WalletCardDeps,
} from "./wallet-card";
import { DuplicateCustomerError } from "../customers/repo";

jest.mock("../supabase", () => ({ supabase: {} }));
jest.mock("../web-app-url", () => ({ getWebAppUrl: () => "https://store.test" }));
jest.mock("../customers/attach-lookup", () => ({
  findAttachableByPhone: jest.fn(),
  createAttachableCustomer: jest.fn(),
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
  // Through the register's exact lookup + quick-create, never the guest list:
  // a cashier scanning a card may hold `pos` without the `customers` grant.
  const guest = { id: "c1", name: "Maria", phoneE164: "+639171234567", email: null };

  it("attaches the saved guest with that exact number", async () => {
    const repo = {
      findByPhone: jest.fn(async () => guest),
      create: jest.fn(),
    };
    await expect(resolveScannedCustomer("tenant-1", "+639171234567", repo)).resolves.toEqual(guest);
    expect(repo.findByPhone).toHaveBeenCalledWith("tenant-1", "+639171234567");
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("saves the card holder as a new guest when the store has never seen them at the counter", async () => {
    const repo = {
      findByPhone: jest.fn(async () => null),
      create: jest.fn(async () => ({ ...guest, id: "new", name: null })),
    };
    const attached = await resolveScannedCustomer("tenant-1", "+639171234567", repo);
    expect(repo.create).toHaveBeenCalledWith("tenant-1", {
      name: null, phoneE164: "+639171234567", email: null, notes: null,
    });
    expect(attached.id).toBe("new");
  });

  it("attaches the existing guest when the save races a duplicate", async () => {
    // Another register saved the number between our lookup and our save (or
    // the first lookup could not see the row): the guest exists, so find them.
    const repo = {
      findByPhone: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(guest),
      create: jest.fn(async () => {
        throw new DuplicateCustomerError();
      }),
    };

    await expect(resolveScannedCustomer("tenant-1", "+639171234567", repo)).resolves.toEqual(guest);
    expect(repo.findByPhone).toHaveBeenCalledTimes(2);
  });

  it("still fails when a duplicate is reported but nobody can be found", async () => {
    const repo = {
      findByPhone: jest.fn(async () => null),
      create: jest.fn(async () => {
        throw new DuplicateCustomerError();
      }),
    };

    await expect(resolveScannedCustomer("tenant-1", "+639171234567", repo)).rejects.toBeInstanceOf(
      DuplicateCustomerError,
    );
    expect(repo.findByPhone).toHaveBeenCalledTimes(2);
  });

  it("does not retry the lookup for a failure that is not a duplicate", async () => {
    const repo = {
      findByPhone: jest.fn(async () => null),
      create: jest.fn(async () => {
        throw new Error("timeout");
      }),
    };

    await expect(resolveScannedCustomer("tenant-1", "+639171234567", repo)).rejects.toThrow("timeout");
    expect(repo.findByPhone).toHaveBeenCalledTimes(1);
  });
});

describe("describeAttachFailure", () => {
  const PERMISSION = "You don't have permission to attach guests at this register.";
  const GENERIC = "Card recognised, but the guest could not be attached. Search their number instead.";

  it("names a Postgres permission refusal", () => {
    const refused = Object.assign(new Error("permission denied for function pos_find_customer"), { code: "42501" });
    expect(describeAttachFailure(refused)).toBe(PERMISSION);
  });

  it("names a register function that says the cashier is not allowed", () => {
    expect(describeAttachFailure(Object.assign(new Error("not allowed"), { code: "P0001" }))).toBe(PERMISSION);
    expect(describeAttachFailure(new Error("Not allowed to attach customers"))).toBe(PERMISSION);
  });

  it("falls back to the search hint for anything else", () => {
    expect(describeAttachFailure(Object.assign(new Error("Could not find the function"), { code: "PGRST202" }))).toBe(GENERIC);
    expect(describeAttachFailure(new Error("Network request failed"))).toBe(GENERIC);
    expect(describeAttachFailure("boom")).toBe(GENERIC);
    expect(describeAttachFailure(null)).toBe(GENERIC);
  });
});

describe("describeScanFailure", () => {
  it("speaks to the cashier", () => {
    expect(describeScanFailure("not_a_card")).toMatch(/not a loyalty card/i);
    expect(describeScanFailure("not_found")).toMatch(/another store|not recognised/i);
    expect(describeScanFailure("forbidden")).toMatch(/permission/i);
  });
});

describe("attachFailureDetail", () => {
  it("keeps the Postgres code a logged Error would otherwise hide", () => {
    const missing = Object.assign(new Error("Could not find the function public.pos_find_customer"), { code: "PGRST202" });
    expect(attachFailureDetail(missing)).toEqual({
      code: "PGRST202",
      message: "Could not find the function public.pos_find_customer",
    });
  });

  it("describes a failure that is not an Error", () => {
    expect(attachFailureDetail("boom")).toEqual({ code: null, message: "boom" });
  });
});
