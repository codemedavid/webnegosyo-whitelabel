/**
 * A cart line's key is its identity (item + options + note), so writing a
 * kitchen note on a line gives it a NEW key. Everything the register holds by
 * line key — a cashier's item discount, which units a voucher lands on, which
 * dishes a senior claimed, a placed order's one-dish discount under edit —
 * must follow the dish to its new key, or the note silently drops the money.
 */

import { rekeyDiscountSession, rekeyEditDiscount } from "./pos-line-rekey";
import { EMPTY_POS_DISCOUNT_SESSION, type PosDiscountSession } from "./pos-discount-session";
import type { ManualItemDiscount } from "./pos-discount";
import type { OrderDiscountPayload } from "./order-discount";

const halfOff = (lineKey: string, units = 1): ManualItemDiscount => ({
  lineKey,
  units,
  kind: "percent",
  value: 50,
  reason: "Promo",
});

const senior = (units: Record<string, number>) => ({
  id: "c-1",
  kind: "senior" as const,
  name: "Lola",
  idNumber: "123",
  allocation: { mode: "items" as const, units },
});

describe("rekeyDiscountSession", () => {
  it("moves an item discount to the line's new key", () => {
    const session: PosDiscountSession = {
      ...EMPTY_POS_DISCOUNT_SESSION,
      itemDiscounts: [halfOff("old")],
    };
    const next = rekeyDiscountSession(session, "old", "new");
    expect(next.itemDiscounts).toEqual([halfOff("new")]);
  });

  it("keeps the edited line's discount when merging into a line that has none", () => {
    const session: PosDiscountSession = {
      ...EMPTY_POS_DISCOUNT_SESSION,
      itemDiscounts: [halfOff("old"), halfOff("other")],
    };
    const next = rekeyDiscountSession(session, "old", "new");
    expect(next.itemDiscounts).toEqual([halfOff("other"), halfOff("new")]);
  });

  it("adds the units together when both lines carry the same discount", () => {
    const session: PosDiscountSession = {
      ...EMPTY_POS_DISCOUNT_SESSION,
      itemDiscounts: [halfOff("old", 1), halfOff("new", 2)],
    };
    const next = rekeyDiscountSession(session, "old", "new");
    expect(next.itemDiscounts).toEqual([halfOff("new", 3)]);
  });

  it("lets the edited line's discount win when the two differ (one per line)", () => {
    const fixed: ManualItemDiscount = { ...halfOff("new"), kind: "fixed", value: 10 };
    const session: PosDiscountSession = {
      ...EMPTY_POS_DISCOUNT_SESSION,
      itemDiscounts: [halfOff("old"), fixed],
    };
    const next = rekeyDiscountSession(session, "old", "new");
    expect(next.itemDiscounts).toEqual([halfOff("new")]);
  });

  it("moves (and adds) a voucher's unit picks", () => {
    const session: PosDiscountSession = {
      ...EMPTY_POS_DISCOUNT_SESSION,
      unitPicks: { FRIES50: { old: 1, new: 1 }, OTHER: { x: 2 } },
    };
    const next = rekeyDiscountSession(session, "old", "new");
    expect(next.unitPicks).toEqual({ FRIES50: { new: 2 }, OTHER: { x: 2 } });
  });

  it("moves a senior's claimed units and keeps the approval", () => {
    const approval = { approvalId: "a-1", approverName: "Manager", approvedReduction: 40 };
    const session: PosDiscountSession = {
      ...EMPTY_POS_DISCOUNT_SESSION,
      government: {
        claimants: [senior({ old: 1, keep: 1 })],
        diners: null,
        approval,
        approvalSkippedOffline: false,
      },
    };
    const next = rekeyDiscountSession(session, "old", "new");
    expect(next.government?.claimants[0].allocation).toEqual({
      mode: "items",
      units: { keep: 1, new: 1 },
    });
    expect(next.government?.approval).toEqual(approval);
  });

  it("returns the same session when nothing referred to the old key", () => {
    const session: PosDiscountSession = {
      ...EMPTY_POS_DISCOUNT_SESSION,
      itemDiscounts: [halfOff("other")],
    };
    expect(rekeyDiscountSession(session, "old", "new")).toBe(session);
    expect(rekeyDiscountSession(session, "same", "same")).toBe(session);
  });
});

describe("rekeyEditDiscount", () => {
  const stored = (lineKey: string): OrderDiscountPayload => ({
    total: 20,
    deliveryDiscount: 0,
    lines: [
      {
        label: "Discount — Promo",
        amount: 20,
        items: [{ lineKey, units: 1, amount: 20 }],
      } as OrderDiscountPayload["lines"][number],
    ],
    allocationsByLine: { "line-0": 20 },
  });

  it("moves a placed one-dish discount to the dish's new cart key", () => {
    const next = rekeyEditDiscount(stored("old"), "old", "new");
    expect(next?.lines[0].items).toEqual([{ lineKey: "new", units: 1, amount: 20 }]);
    // Order positions are not cart keys and stay as stored.
    expect(next?.allocationsByLine).toEqual({ "line-0": 20 });
  });

  it("returns the same payload when no dish matched, and null for none", () => {
    const payload = stored("other");
    expect(rekeyEditDiscount(payload, "old", "new")).toBe(payload);
    expect(rekeyEditDiscount(null, "old", "new")).toBeNull();
  });
});
