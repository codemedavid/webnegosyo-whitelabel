/**
 * The guest cards of a split bill: what each guest owes, what they have paid,
 * and the receipt each one prints. Pure; the screen only draws it.
 */
import type { ReceiptOrder } from "../receipt-layout";
import { toCents } from "./money";
import { billSummary, type BillOrder } from "./bill-orders";
import { partPaidCents, type BillPlan } from "./bill-plan";
import { billUnits, evenShareCents, itemParts, type BillUnit } from "./bill-split";
import { evenShareReceipt, itemPartReceipt } from "./bill-receipt";

export interface BillPartView {
  /** Plan key for this guest's payments: "even:0", "items:2". */
  key: string;
  guest: number;
  label: string;
  amountCents: number;
  paidCents: number;
  remainingCents: number;
  isPaid: boolean;
  /** By item: centavos of this share that belong to each order. */
  preferred?: Record<string, number>;
  /** By item: the pieces this guest had. */
  units: BillUnit[];
  receipt: (paidCents: number) => ReceiptOrder;
}

export interface BillPartsResult {
  parts: BillPartView[];
  unassigned: BillUnit[];
}

function partView(
  key: string,
  guest: number,
  amountCents: number,
  plan: BillPlan,
  rest: Pick<BillPartView, "receipt" | "units" | "preferred">,
): BillPartView {
  const paidCents = Math.min(amountCents, partPaidCents(plan, key));
  const remainingCents = Math.max(0, amountCents - paidCents);
  return {
    key,
    guest,
    label: `Guest ${guest + 1}`,
    amountCents,
    paidCents,
    remainingCents,
    isPaid: amountCents > 0 && remainingCents === 0,
    ...rest,
  };
}

export function billPartViews(orders: readonly BillOrder[], plan: BillPlan, nowMs: number): BillPartsResult {
  if (plan.mode === "even") {
    const owedCents = toCents(billSummary(orders).owed);
    const basis = plan.basisCents ?? owedCents;
    const isShareOfBalance = basis < toCents(billSummary(orders).total);
    const shares = evenShareCents(basis, plan.guests);
    const parts = shares.map((shareCents, index) =>
      partView(`even:${index}`, index, shareCents, plan, {
        units: [],
        receipt: (paidCents) =>
          evenShareReceipt(orders, { nowMs, index, count: plan.guests, shareCents, paidCents, isShareOfBalance }),
      }),
    );
    return { parts, unassigned: [] };
  }

  if (plan.mode === "items") {
    const { parts, unassigned } = itemParts(billUnits(orders), plan.assignment, plan.guests);
    return {
      parts: parts.map((part) =>
        partView(`items:${part.guest}`, part.guest, part.totalCents, plan, {
          units: part.units,
          preferred: part.byOrder,
          receipt: (paidCents) => itemPartReceipt(orders, part, { nowMs, count: plan.guests, paidCents }),
        }),
      ),
      unassigned,
    };
  }

  return { parts: [], unassigned: [] };
}

/**
 * By item prices every piece from the whole bill, so it cannot start once
 * money has been taken some other way: the pieces would add up to more than
 * is owed. Money taken by this split's own guests is accounted for already.
 */
export function itemSplitBlockedReason(orders: readonly BillOrder[], plan: BillPlan): string | null {
  const paidOnOrders = toCents(billSummary(orders).paid);
  const paidThroughSplit = plan.mode === "items"
    ? Object.values(plan.paid).reduce((sum, cents) => sum + cents, 0)
    : 0;
  if (paidOnOrders <= paidThroughSplit) return null;
  return "Part of this bill has already been paid, so it can only be split evenly now.";
}

export interface UnitGroup {
  key: string;
  name: string;
  /** Choices, add-ons and notes, as one quiet line. */
  detail: string;
  count: number;
  /** The menu price of one piece; a guest's total adds their share of charges. */
  unitCents: number;
  unitIds: string[];
}

/** Identical pieces as one row ("3× Latte"), in the order they appear. */
export function groupUnits(units: readonly BillUnit[]): UnitGroup[] {
  const groups = new Map<string, UnitGroup>();
  for (const unit of units) {
    const { item } = unit;
    const detail = [
      ...(item.variationSelections?.map((s) => s.optionName) ?? (item.variation ? [item.variation] : [])),
      ...(item.addons?.map((a) => `+ ${a.name}`) ?? []),
      ...(item.specialInstructions ? [`“${item.specialInstructions}”`] : []),
    ].join(" · ");
    const key = JSON.stringify([item.menuItemName, detail, unit.itemCents]);
    const existing = groups.get(key);
    groups.set(
      key,
      existing
        ? { ...existing, count: existing.count + 1, unitIds: [...existing.unitIds, unit.id] }
        : { key, name: item.menuItemName, detail, count: 1, unitCents: unit.itemCents, unitIds: [unit.id] },
    );
  }
  return [...groups.values()];
}
