/**
 * Attaching a guest to a counter sale without reading the guest list.
 *
 * The POS picker read `customers` directly, so the only thing between a cashier
 * and the whole book (names, phones, spend, consent) was the tab bar. RLS now
 * gives that table to the `customers` grant alone; a register-only cashier
 * attaches a guest through two narrow functions instead — an EXACT phone/email
 * lookup and a quick-create — and can never browse by fragment.
 */

const mockRpc = jest.fn();
const mockListCustomers = jest.fn();

jest.mock("../supabase", () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));

jest.mock("./repo", () => {
  class DuplicateCustomerError extends Error {}
  return {
    listCustomers: (...args: unknown[]) => mockListCustomers(...args),
    DuplicateCustomerError,
  };
});

import {
  createAttachableCustomer,
  findAttachableByPhone,
  findAttachableCustomers,
} from "./attach-lookup";
import { DuplicateCustomerError } from "./repo";

const ROW = { id: "c1", name: "Maria", phone_e164: "+639171234567", email: null };
const ATTACHABLE = { id: "c1", name: "Maria", phoneE164: "+639171234567", email: null };

beforeEach(() => {
  mockRpc.mockReset();
  mockListCustomers.mockReset();
});

describe("findAttachableCustomers — a cashier without the customers grant", () => {
  it("finds the guest with exactly the number they read out", async () => {
    // Arrange
    mockRpc.mockResolvedValue({ data: [ROW], error: null });

    // Act
    const found = await findAttachableCustomers("t1", "0917 123 4567", false);

    // Assert
    expect(mockRpc).toHaveBeenCalledWith("pos_find_customer", {
      p_tenant_id: "t1",
      p_phone_e164: "+639171234567",
      p_email: null,
    });
    expect(found).toEqual([ATTACHABLE]);
    expect(mockListCustomers).not.toHaveBeenCalled();
  });

  it("finds a guest by exact email", async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    await findAttachableCustomers("t1", "Maria@Example.com", false);

    expect(mockRpc).toHaveBeenCalledWith("pos_find_customer", {
      p_tenant_id: "t1",
      p_phone_e164: null,
      p_email: "maria@example.com",
    });
  });

  it("never browses: an empty box or a name fragment reads nothing", async () => {
    await expect(findAttachableCustomers("t1", "", false)).resolves.toEqual([]);
    await expect(findAttachableCustomers("t1", "Mar", false)).resolves.toEqual([]);

    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockListCustomers).not.toHaveBeenCalled();
  });

  it("throws on a failed lookup rather than claiming nobody matches", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "timeout" } });

    await expect(findAttachableCustomers("t1", "09171234567", false)).rejects.toThrow("timeout");
  });

  it("keeps the Postgres code on a failed lookup so the cause can be told apart", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: "42501", message: "permission denied" } });

    await expect(findAttachableCustomers("t1", "09171234567", false)).rejects.toMatchObject({
      code: "42501",
      message: "permission denied",
    });
  });

  it("carries a null code when the failure has none", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "timeout" } });

    await expect(findAttachableCustomers("t1", "09171234567", false)).rejects.toMatchObject({ code: null });
  });
});

describe("findAttachableCustomers — staff holding the customers grant", () => {
  it("keeps the searchable list", async () => {
    mockListCustomers.mockResolvedValue([{ ...ATTACHABLE, orderCount: 3 }]);

    const found = await findAttachableCustomers("t1", "Mar", true);

    expect(mockListCustomers).toHaveBeenCalledWith("t1", { search: "Mar", limit: 20 });
    expect(found).toEqual([ATTACHABLE]);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe("findAttachableByPhone", () => {
  it("is the exact lookup, for a scanned wallet card", async () => {
    mockRpc.mockResolvedValue({ data: [ROW], error: null });

    await expect(findAttachableByPhone("t1", "+639171234567")).resolves.toEqual(ATTACHABLE);
  });

  it("is null when nobody has that number", async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    await expect(findAttachableByPhone("t1", "+639171234567")).resolves.toBeNull();
  });
});

describe("createAttachableCustomer", () => {
  const GUEST = { name: null, phoneE164: "+639171234567", email: null, notes: null };

  it("saves through the register function, not the table", async () => {
    mockRpc.mockResolvedValue({ data: [ROW], error: null });

    await expect(createAttachableCustomer("t1", GUEST)).resolves.toEqual(ATTACHABLE);
    expect(mockRpc).toHaveBeenCalledWith("pos_create_customer", {
      p_tenant_id: "t1",
      p_name: null,
      p_phone_e164: "+639171234567",
      p_email: null,
    });
  });

  it("reports a number that is already saved as a duplicate", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: "23505", message: "dup" } });

    await expect(createAttachableCustomer("t1", GUEST)).rejects.toBeInstanceOf(
      DuplicateCustomerError
    );
  });

  it("keeps the Postgres code on a failure that is not a duplicate", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: "42501", message: "not allowed" } });

    const failure = createAttachableCustomer("t1", GUEST);

    await expect(failure).rejects.toMatchObject({ code: "42501", message: "not allowed" });
    await expect(failure).rejects.not.toBeInstanceOf(DuplicateCustomerError);
  });

  it("throws when the function returns no row", async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    await expect(createAttachableCustomer("t1", GUEST)).rejects.toThrow();
  });
});
