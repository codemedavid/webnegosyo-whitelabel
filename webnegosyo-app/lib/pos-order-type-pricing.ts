/**
 * Register-side glue for per-order-type pricing.
 *
 * The pure module (`order-type-pricing.ts`, ported from the web) answers "what
 * does this item cost on this channel?". This file applies that answer to the
 * cart's shapes: a line input on its way into the cart, the lines already in
 * it when the cashier switches chips, and the figure printed on a tile.
 *
 * Every function prices from the LIST figures (`listBasePrice`,
 * `listPriceModifier`) and writes the derived ones (`basePrice`,
 * `priceModifier`). Deriving from the derived figure would compound the
 * markup on every switch; deriving from the list figure makes repricing
 * idempotent and makes removing the pricing restore the store price exactly.
 *
 * A line with no `listBasePrice` was hydrated from a placed order. Its price
 * is what the customer was quoted, so it is handed back by reference — the
 * store also refuses to reprice in edit mode, but this module must not depend
 * on that.
 */

import {
  resolveItemPrice,
  resolveModifierPrice,
  type OrderTypePricing,
} from "./order-type-pricing";
import {
  priceLine,
  type PosCartLine,
  type PosCartSelection,
  type PosLineInput,
} from "./pos-cart";

/** The product fields a tile needs to show its price on a channel. */
export interface DisplayPriceSource {
  id: string;
  price: number;
  discounted_price: number | null;
}

/** Each modifier's charge on this channel, derived from its list figure. */
export function priceSelectionsForOrderType(
  selections: readonly PosCartSelection[],
  pricing: OrderTypePricing | null,
): PosCartSelection[] {
  return selections.map((selection) => {
    const listPriceModifier = selection.listPriceModifier ?? selection.priceModifier;
    return {
      ...selection,
      listPriceModifier,
      priceModifier: resolveModifierPrice(listPriceModifier, pricing),
    };
  });
}

/**
 * A line input priced for this channel. An input without a list price is not
 * the register's to reprice and comes back by reference.
 */
export function priceLineInputForOrderType<T extends PosLineInput>(
  input: T,
  pricing: OrderTypePricing | null,
): T {
  if (input.listBasePrice === undefined) return input;
  return {
    ...input,
    basePrice: resolveItemPrice(input.menuItemId, input.listBasePrice, pricing),
    selections: priceSelectionsForOrderType(input.selections, pricing),
  };
}

/**
 * The cart re-priced for a newly chosen order type. Keys are untouched —
 * identity is item + options + note, never price — so the sale keeps stacking.
 */
export function repriceLinesForOrderType(
  lines: readonly PosCartLine[],
  pricing: OrderTypePricing | null,
): PosCartLine[] {
  return lines.map((line) => {
    if (line.listBasePrice === undefined) return line;
    return priceLine(priceLineInputForOrderType(line, pricing), line.quantity);
  });
}

/** What a product tile shows: the effective store price, priced for the channel. */
export function displayPriceForOrderType(
  product: DisplayPriceSource,
  pricing: OrderTypePricing | null,
): number {
  return resolveItemPrice(product.id, product.discounted_price ?? product.price, pricing);
}
