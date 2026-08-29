/**
 * A tenant's Convex deployment only accepts arguments its validator knows.
 *
 * `orders.serviceCharge` arrived in schema v23. Sending it to a deployment
 * still on v22 is not a degraded write — the validator rejects the whole
 * mutation, so a register that sent it unconditionally would refuse to ring up
 * a sale, and an edit would refuse to save, at every store not yet redeployed.
 *
 * Same gate as `convexScheduledForArg` on the web side, for the same reason.
 */

import { convexServiceChargeArg } from "./convex-service-charge-arg";

describe("convexServiceChargeArg", () => {
  it("sends the charge to a deployment that accepts it", () => {
    expect(convexServiceChargeArg(24, 23)).toEqual({ serviceCharge: 24 });
  });

  it("sends it to anything newer still", () => {
    expect(convexServiceChargeArg(24, 99)).toEqual({ serviceCharge: 24 });
  });

  it("withholds it from a deployment that would reject it", () => {
    // Not `{ serviceCharge: undefined }` — Convex's validator still sees the
    // key and refuses it. The charge stays recoverable as the anonymous
    // residue on those tenants, exactly as before.
    expect(convexServiceChargeArg(24, 22)).toEqual({});
  });

  it("treats an unrecorded version as too old", () => {
    // A tenant whose version was never written was deployed before versions
    // were tracked. Guessing optimistically would break their register.
    expect(convexServiceChargeArg(24, null)).toEqual({});
    expect(convexServiceChargeArg(24, undefined)).toEqual({});
  });

  it("sends nothing for a sale that carried no charge", () => {
    // An absent key rather than a zero, so no reader draws an empty row.
    expect(convexServiceChargeArg(0, 23)).toEqual({});
    expect(convexServiceChargeArg(undefined, 23)).toEqual({});
  });

  it("refuses a corrupt amount rather than writing it", () => {
    // NaN would poison the stored breakdown and print as "P NaN" on a chit.
    expect(convexServiceChargeArg(Number.NaN, 23)).toEqual({});
    expect(convexServiceChargeArg(-5, 23)).toEqual({});
  });

  it("rounds to centavos, matching the total it sits beside", () => {
    expect(convexServiceChargeArg(23.999, 23)).toEqual({ serviceCharge: 24 });
  });
});
