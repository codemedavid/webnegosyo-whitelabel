/**
 * Counter-sale cart engine for the POS register.
 *
 * Pure and side-effect free: every function returns a NEW cart array and never
 * mutates its input, so the Zustand store can swap state atomically and React
 * re-renders reliably. All money is rounded to centavos here — screens format,
 * they never compute.
 *
 * Line identity is a hash of item + selected options + note, so ringing up the
 * same drink twice stacks into one line while a different size stays separate.
 */

import type { ModifierGroup } from "./modifier-groups";

/** One chosen modifier option, flattened for the cart line. */
export interface PosCartSelection {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  /** Added to the item's base price. May be negative (a discount option). */
  priceModifier: number;
}

/** What a screen hands to {@link addLine}. */
export interface PosLineInput {
  menuItemId: string;
  name: string;
  basePrice: number;
  quantity: number;
  selections: PosCartSelection[];
  /** Free-text kitchen note; part of line identity so notes never merge. */
  note?: string;
}

/** A priced, stackable line in the register cart. */
export interface PosCartLine extends PosLineInput {
  /** Stable identity — see {@link lineKey}. */
  key: string;
  /** basePrice plus every selected option's modifier, floored at zero. */
  unitPrice: number;
  /** unitPrice × quantity. */
  subtotal: number;
}

/** Service charge configured on the chosen order type. */
export interface ServiceCharge {
  type: "percentage" | "fixed";
  value: number;
}

export interface CartTotals {
  subtotal: number;
  serviceCharge: number;
  total: number;
  /** Units sold, not lines — 2× Latte counts as 2. */
  itemCount: number;
}

const EMPTY_TOTALS: CartTotals = {
  subtotal: 0,
  serviceCharge: 0,
  total: 0,
  itemCount: 0,
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Stable identity for a configured line.
 *
 * Option ids are sorted so selection order never splits what should stack.
 */
export function lineKey(
  menuItemId: string,
  selections: PosCartSelection[],
  note?: string,
): string {
  const options = selections
    .map((s) => s.optionId)
    .slice()
    .sort()
    .join(",");
  return `${menuItemId}|${options}|${note ?? ""}`;
}

/** Per-unit price of an item with its options applied. Never negative. */
export function unitPrice(basePrice: number, selections: PosCartSelection[]): number {
  const withModifiers = selections.reduce((sum, s) => sum + s.priceModifier, basePrice);
  return round2(Math.max(0, withModifiers));
}

function priceLine(input: PosLineInput, quantity: number): PosCartLine {
  const price = unitPrice(input.basePrice, input.selections);
  return {
    ...input,
    quantity,
    key: lineKey(input.menuItemId, input.selections, input.note),
    unitPrice: price,
    subtotal: round2(price * quantity),
  };
}

/**
 * Ring up an item. Stacks onto an existing identically-configured line;
 * a non-positive quantity is ignored rather than creating a dead line.
 */
export function addLine(cart: PosCartLine[], input: PosLineInput): PosCartLine[] {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) return cart;

  const key = lineKey(input.menuItemId, input.selections, input.note);
  const existing = cart.find((line) => line.key === key);

  if (!existing) return [...cart, priceLine(input, input.quantity)];

  return cart.map((line) =>
    line.key === key ? priceLine(line, line.quantity + input.quantity) : line,
  );
}

/** Set a line's quantity. Dropping to zero or below removes the line. */
export function updateQty(
  cart: PosCartLine[],
  key: string,
  quantity: number,
): PosCartLine[] {
  if (quantity <= 0) return removeLine(cart, key);
  return cart.map((line) => (line.key === key ? priceLine(line, quantity) : line));
}

export function removeLine(cart: PosCartLine[], key: string): PosCartLine[] {
  return cart.filter((line) => line.key !== key);
}

export function clearCart(): PosCartLine[] {
  return [];
}

/** Subtotal, service charge, total, and unit count for the current cart. */
export function cartTotals(
  cart: PosCartLine[],
  serviceCharge?: ServiceCharge,
): CartTotals {
  if (cart.length === 0) return EMPTY_TOTALS;

  const subtotal = round2(cart.reduce((sum, line) => sum + line.subtotal, 0));
  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);

  const charge = !serviceCharge
    ? 0
    : serviceCharge.type === "percentage"
      ? round2((subtotal * serviceCharge.value) / 100)
      : round2(serviceCharge.value);

  return {
    subtotal,
    serviceCharge: charge,
    total: round2(subtotal + charge),
    itemCount,
  };
}

export interface SelectionValidation {
  valid: boolean;
  /** Group id -> customer-readable message. Empty when valid. */
  errors: Record<string, string>;
}

/**
 * Enforce each group's min/max selection rules before a line can be added.
 * `max_select: null` means unlimited (add-on style).
 */
export function validateSelection(
  groups: ModifierGroup[],
  selections: PosCartSelection[],
): SelectionValidation {
  const errors = groups.reduce<Record<string, string>>((acc, group) => {
    const chosen = selections.filter((s) => s.groupId === group.id).length;

    if (chosen < group.min_select) {
      return { ...acc, [group.id]: `Choose at least ${group.min_select} from ${group.name}` };
    }
    if (group.max_select !== null && chosen > group.max_select) {
      return { ...acc, [group.id]: `Choose at most ${group.max_select} from ${group.name}` };
    }
    return acc;
  }, {});

  return { valid: Object.keys(errors).length === 0, errors };
}
