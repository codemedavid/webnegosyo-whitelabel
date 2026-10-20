/**
 * Line-specific discounts (a unit-limited voucher, a cashier's item discount)
 * as an ORDER stores them.
 *
 * The register prices against cart keys; an order knows its lines only by
 * position (`line-<index>`, the checkout's convention, read by
 * `order_items.discount_amount`, receipts, reports and split bills). These two
 * helpers translate, and total each order line's share.
 */
import type { DiscountLineItem, OrderDiscountLine } from "./order-totals";
import type { PosCartLine } from "./pos-cart";

const ORDER_LINE_KEY = /^line-\d+$/;

/**
 * The lines with each dish re-keyed from a cart key to `line-<index>` of
 * `cart`. A key already in order form is kept; a dish no longer in the cart
 * is dropped from the line (its money stays on the line itself).
 */
export function toOrderLineDiscounts(
  lines: readonly OrderDiscountLine[],
  cart: readonly Pick<PosCartLine, "key">[],
): OrderDiscountLine[] {
  const indexByKey = new Map(cart.map((line, index) => [line.key, index]));
  return lines.map((line) => {
    if (!line.items || line.items.length === 0) return line;
    const items = line.items.flatMap((item): DiscountLineItem[] => {
      if (ORDER_LINE_KEY.test(item.lineKey)) return [item];
      const index = indexByKey.get(item.lineKey);
      return index === undefined ? [] : [{ ...item, lineKey: `line-${index}` }];
    });
    if (items.length > 0) return { ...line, items };
    const { items: dropped, ...rest } = line;
    void dropped;
    return rest;
  });
}

/**
 * The cart key now holding order line `line-<index>`, for an order opened for
 * an edit. `cartKeys[index]` is the cart key order line `index` loaded as
 * (`orderLineCartKeys`): loading merges identical lines and skips empty ones,
 * so cart position i is NOT order line i — the dish's identity is the only
 * safe link. Null when that line did not load; undefined when `lineKey` is not
 * an order position at all.
 */
export function cartKeyForOrderLine(
  lineKey: string,
  cartKeys: readonly (string | null)[],
): string | null | undefined {
  const match = /^line-(\d+)$/.exec(lineKey);
  if (!match) return undefined;
  return cartKeys[Number(match[1])] ?? null;
}

/**
 * The reverse of `toOrderLineDiscounts`, for an order opened for an edit: each
 * dish re-keyed from its stored position to its cart key, so an edit that
 * removes an earlier dish (shifting every later position) leaves the discount
 * on its DISH. A dish whose line did not load is dropped.
 */
export function toCartLineDiscounts(
  lines: readonly OrderDiscountLine[],
  cartKeys: readonly (string | null)[],
): OrderDiscountLine[] {
  return lines.map((line) => {
    if (!line.items || line.items.length === 0) return line;
    const items = line.items.flatMap((item): DiscountLineItem[] => {
      const key = cartKeyForOrderLine(item.lineKey, cartKeys);
      if (key === undefined) return [item];
      return key ? [{ ...item, lineKey: key }] : [];
    });
    return { ...line, items };
  });
}

/** Each order line's share of the line-specific discounts, in pesos. */
export function lineItemAllocations(lines: readonly OrderDiscountLine[]): Record<string, number> {
  const cents: Record<string, number> = {};
  for (const line of lines) {
    for (const item of line.items ?? []) {
      if (!ORDER_LINE_KEY.test(item.lineKey) || !Number.isFinite(item.amount) || item.amount <= 0) continue;
      cents[item.lineKey] = (cents[item.lineKey] ?? 0) + Math.round(item.amount * 100);
    }
  }
  return Object.fromEntries(Object.entries(cents).map(([key, value]) => [key, value / 100]));
}

/** Two allocation maps added together, to the centavo. */
export function mergeAllocations(
  a: Readonly<Record<string, number>>,
  b: Readonly<Record<string, number>>,
): Record<string, number> {
  const merged: Record<string, number> = { ...a };
  for (const [key, amount] of Object.entries(b)) {
    merged[key] = Math.round(((merged[key] ?? 0) + amount) * 100) / 100;
  }
  return merged;
}
