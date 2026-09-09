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
import type { OrderDiscountLine } from "./order-totals";

/** One chosen modifier option, flattened for the cart line. */
export interface PosCartSelection {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  /** Added to the item's base price. May be negative (a discount option). */
  priceModifier: number;
  /**
   * The modifier's STORE price, before any order-type markup. `priceModifier`
   * is derived from it by `pos-order-type-pricing.ts`, so switching order
   * types re-derives rather than compounds. Absent on a hydrated edit line.
   */
  listPriceModifier?: number;
}

/** What a screen hands to {@link addLine}. */
/**
 * Order-item metadata the register cannot re-derive but must not destroy.
 *
 * Rows written by web/mobile checkout carry a legacy `variation` string and
 * bundle/upsell markers. Editing an order rewrites its items wholesale, so a
 * quantity change that dropped these would strip "(Large)" off the chit and
 * unlink bundle lines. Hydration stamps this on the line; serialization hands
 * it back verbatim. A line rung up fresh at the counter has none.
 */
export interface OrderLineCarryover {
  variation?: string;
  isUpsellItem?: boolean;
  isBundleItem?: boolean;
  bundleId?: string;
  bundleName?: string;
  slotName?: string;
}

export interface PosLineInput {
  menuItemId: string;
  name: string;
  basePrice: number;
  /**
   * The STORE price the line was rung up at (`discounted_price ?? price`),
   * the pre-order-type source of truth `basePrice` is derived from. Absent on
   * a line hydrated from a placed order, which is never repriced.
   */
  listBasePrice?: number;
  quantity: number;
  selections: PosCartSelection[];
  /** Free-text kitchen note; part of line identity so notes never merge. */
  note?: string;
  /** Metadata carried through an edit untouched; part of line identity so a
   * bundle line never merges into an identical standalone line. */
  carryover?: OrderLineCarryover;
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
  /** Manually-attached delivery fee. Zero on an ordinary counter sale. */
  deliveryFee: number;
  /**
   * What was actually taken off, which is not always what was asked for: a
   * voucher worth more than the sale is capped rather than paid out.
   */
  discountTotal: number;
  total: number;
  /** Units sold, not lines — 2× Latte counts as 2. */
  itemCount: number;
}

const EMPTY_TOTALS: CartTotals = {
  subtotal: 0,
  serviceCharge: 0,
  deliveryFee: 0,
  discountTotal: 0,
  total: 0,
  itemCount: 0,
};

/**
 * Sums the discount lines, ignoring corrupt (negative or non-finite) amounts.
 *
 * Mirrors `sumDiscounts` in `src/lib/order-totals.ts`. A negative amount summed
 * naively would ADD to the bill, which is the one direction a discount must
 * never move a total.
 */
function sumDiscounts(discounts: readonly OrderDiscountLine[]): number {
  return discounts.reduce((sum, line) => {
    if (!Number.isFinite(line.amount) || line.amount <= 0) return sum;
    return sum + line.amount;
  }, 0);
}

/** Centavo rounding. Exported so every money module rounds the same way. */
export function round2(n: number): number {
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
  carryover?: OrderLineCarryover,
): string {
  const options = selections
    .map((s) => s.optionId)
    .slice()
    .sort()
    .join(",");
  // Serialized in sorted-key order so identical carryovers built in different
  // field orders still merge. Absent carryover keeps the historical key shape.
  const carried = carryover
    ? "|" +
      Object.entries(carryover)
        .filter(([, value]) => value !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([key, value]) => `${key}=${String(value)}`)
        .join(",")
    : "";
  return `${menuItemId}|${options}|${note ?? ""}${carried}`;
}

/** Per-unit price of an item with its options applied. Never negative. */
export function unitPrice(basePrice: number, selections: PosCartSelection[]): number {
  const withModifiers = selections.reduce((sum, s) => sum + s.priceModifier, basePrice);
  return round2(Math.max(0, withModifiers));
}

/** A priced line from its input. Exported for the order-type repricer. */
export function priceLine(input: PosLineInput, quantity: number): PosCartLine {
  const price = unitPrice(input.basePrice, input.selections);
  return {
    ...input,
    quantity,
    key: lineKey(input.menuItemId, input.selections, input.note, input.carryover),
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

  const key = lineKey(input.menuItemId, input.selections, input.note, input.carryover);
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

/**
 * Subtotal, service charge, discount, total, and unit count for the cart.
 *
 * Discount semantics are deliberately identical to `computeOrderTotals` on the
 * web — applied to the WHOLE chargeable amount (service charge included) and
 * capped at it, so an over-large voucher makes the sale free and never a
 * refund. The same code can be presented online or at the counter, and a
 * customer quoted one figure and charged another has no way to tell which was
 * right. `tests/unit/vouchers/engine-parity.test.ts` pins the engine that
 * produces these lines; this function is where its output is spent.
 */
export function cartTotals(
  cart: PosCartLine[],
  serviceCharge?: ServiceCharge,
  discounts?: readonly OrderDiscountLine[],
  /**
   * Manually-attached delivery fee, already validated by
   * `chargeableDeliveryFee` — this function trusts but clamps it. Part of the
   * chargeable amount so a free-delivery voucher has something to discount and
   * an over-large voucher still caps at the WHOLE bill, fee included.
   */
  deliveryFee = 0,
): CartTotals {
  if (cart.length === 0) return EMPTY_TOTALS;

  const subtotal = round2(cart.reduce((sum, line) => sum + line.subtotal, 0));
  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);

  const charge = !serviceCharge
    ? 0
    : serviceCharge.type === "percentage"
      ? round2((subtotal * serviceCharge.value) / 100)
      : round2(serviceCharge.value);

  const fee = Number.isFinite(deliveryFee) && deliveryFee > 0 ? round2(deliveryFee) : 0;
  const chargeable = round2(subtotal + charge + fee);
  const discountTotal = Math.min(round2(sumDiscounts(discounts ?? [])), chargeable);

  return {
    subtotal,
    serviceCharge: charge,
    deliveryFee: fee,
    discountTotal,
    total: round2(chargeable - discountTotal),
    itemCount,
  };
}

/**
 * What a REVISED order is worth: its items, plus the fees carried over from
 * when it was placed.
 *
 * Lives here, beside `cartTotals`, because two callers need the same answer and
 * had grown their own copy of it — `editModeTotals` for the was/now header the
 * cashier reads, and `buildRevisionRows` for the total actually written to the
 * order. A drift between those two is a cashier confirming one figure while the
 * customer is billed another, which is precisely the divergence this feature
 * has already had to fix twice on the web side.
 *
 * `carriedCharges` may be NEGATIVE: it is the residue of the placed total after
 * items and delivery are taken out, so a voucher discount lives inside it. That
 * is how an edit preserves a discount nobody can recompute — the voucher's
 * conditions were evaluated against the original cart, which no longer exists.
 */
export function revisedOrderTotal(
  itemsTotal: number,
  deliveryFee: number,
  carriedCharges: number,
): number {
  return round2(itemsTotal + deliveryFee + carriedCharges);
}

/**
 * Units in the cart per menu item, for the quantity badge on a product tile.
 *
 * Sums across lines: the same drink ordered twice with different notes is two
 * lines but one badge showing the combined count.
 */
export function quantityByItem(cart: PosCartLine[]): Record<string, number> {
  return cart.reduce<Record<string, number>>(
    (acc, line) => ({
      ...acc,
      [line.menuItemId]: (acc[line.menuItemId] ?? 0) + line.quantity,
    }),
    {},
  );
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
