/**
 * Shapes for per-product, per-variation and per-add-on sales.
 *
 * A "line" is one order_items row as either backend returns it, joined with
 * the moment its order was placed. Everything downstream is pure arithmetic
 * over lines, so the same figures come out whichever backend served them.
 */

import type { ModifierGroup } from "../modifier-groups";

export interface LineSelection {
  typeName: string;
  optionName: string;
  priceAdjustment: number;
}

export interface LineAddon {
  name: string;
  /** 0 when the backend stored only the name (every web checkout on platform). */
  price: number;
  quantity?: number;
}

/** One sold line. Cancelled orders are never lines. */
export interface SalesLine {
  orderId: string;
  /** When the order was placed (or rung up), epoch ms. */
  createdAtMs: number;
  source?: string;
  menuItemId: string;
  menuItemName: string;
  quantity: number;
  /** What the line took, add-ons included, before any order-level discount. */
  subtotal: number;
  variation?: string;
  variationSelections?: readonly LineSelection[];
  addons?: readonly LineAddon[];
}

/** What the live menu says about a product, used to name and price options. */
export interface CatalogProduct {
  id: string;
  name: string;
  imageUrl?: string | null;
  groups: readonly ModifierGroup[];
}

export type ModifierKind = "variation" | "addon";

/**
 * Where an add-on's price came from.
 * - `recorded`: stored on the line when it was sold — exact.
 * - `menu`: looked up by name on today's menu — an estimate, because the price
 *   may have changed since, and web checkouts never stored it.
 * - `unknown`: neither — the add-on is counted but not valued.
 */
export type PriceSource = "recorded" | "menu" | "unknown";

/** One option a line carried, resolved against the menu where possible. */
export interface LineModifier {
  kind: ModifierKind;
  /** The group it belongs to ("Size", "Add-ons"), or "Options" if unknown. */
  groupName: string;
  name: string;
  /** How many of it came with ONE unit of the product (usually 1). */
  perUnit: number;
  unitPrice: number | null;
  priceSource: PriceSource;
}
