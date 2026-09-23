/**
 * Convex mirror of the web's rebook gate (src/lib/lalamove-rebook.ts).
 *
 * The deployment cannot import from src/, so the rule lives twice. The suites
 * make the same assertions on purpose — a cancelled order must be rebookable
 * whichever backend the store is on, and a live one never.
 */
import { isRebookableLalamoveStatus, resolveRequoteGate } from "./lalamoveStatus";

describe("isRebookableLalamoveStatus (convex)", () => {
  it("accepts bookings that ended without a delivery", () => {
    for (const status of ["CANCELED", "CANCELLED", "REJECTED", "EXPIRED", "cancelled"]) {
      expect(isRebookableLalamoveStatus(status)).toBe(true);
    }
  });

  it("refuses live, completed and unknown bookings", () => {
    for (const status of ["COMPLETED", "DELIVERED", "ASSIGNING_DRIVER", "ON_GOING", "", undefined]) {
      expect(isRebookableLalamoveStatus(status)).toBe(false);
    }
  });
});

describe("resolveRequoteGate (convex)", () => {
  it("quotes an unbooked order, retiring nothing", () => {
    expect(resolveRequoteGate(undefined, undefined)).toEqual({ ok: true, retiredOrderId: null });
  });

  it("retires a cancelled booking so the order can be booked again", () => {
    expect(resolveRequoteGate("lala-old", "CANCELLED")).toEqual({
      ok: true,
      retiredOrderId: "lala-old",
    });
  });

  it("refuses a live booking and a completed one", () => {
    expect(resolveRequoteGate("lala-1", "ON_GOING").ok).toBe(false);
    expect(resolveRequoteGate("lala-1", undefined).ok).toBe(false);
    const completed = resolveRequoteGate("lala-1", "COMPLETED");
    expect(!completed.ok && completed.error).toMatch(/completed/i);
  });
});
