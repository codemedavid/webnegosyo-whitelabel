import { isLocalOrderId, newLocalOrderId } from "./local-id";

describe("newLocalOrderId", () => {
  it("mints a well-formed UUID v4 the platform database can take as a primary key", () => {
    const id = newLocalOrderId();
    expect(isLocalOrderId(id)).toBe(true);
    expect(id).toHaveLength(36);
  });

  it("does not repeat itself across a shift's worth of sales", () => {
    const ids = new Set(Array.from({ length: 2000 }, newLocalOrderId));
    expect(ids.size).toBe(2000);
  });

  it("rejects the register's pos-… idempotency tokens and Convex ids", () => {
    expect(isLocalOrderId("pos-abc123xyz")).toBe(false);
    expect(isLocalOrderId("jd7ab2k9x0")).toBe(false);
    expect(isLocalOrderId(null)).toBe(false);
  });
});
