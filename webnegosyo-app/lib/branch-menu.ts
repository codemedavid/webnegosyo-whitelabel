/**
 * Which branches carry which dish — the owner's cross-branch menu, decided.
 *
 * `outlet_menu_items` holds DIFFERENCES: a row exists only because a branch
 * departs from the store-wide menu. That makes "turn this dish back on here"
 * ambiguous in a way that costs money if it is guessed. Deleting the row is
 * right when the row said nothing else, and wrong the moment it also carried
 * that branch's own price — deleting it there puts the branch silently back on
 * the store-wide amount, which nobody notices until the takings are short.
 *
 * So the decision is made here, in a pure module, next to the resolution rules
 * in `outlet-menu-overrides.ts` that the storefront, the register and the web
 * admin already share. Nothing here queries, throws, or mutates its input.
 */

import {
  buildOutletMenuIndex,
  describeBranchSummary,
  findOutletMenuOverride,
  isItemListedAtOutlet,
  resolveItemForOutlet,
  summarizeItemAcrossBranches,
  type BranchSummaryLabel,
  type NamedBranch,
  type OutletMenuIndex,
  type OutletMenuOverrideRow,
  type OverridableMenuItem,
} from "./outlet-menu-overrides";

export type { NamedBranch, OutletMenuIndex, OutletMenuOverrideRow };
export { buildOutletMenuIndex };

/** The stored shape of one branch's opinion, before ids and timestamps. */
export interface BranchMenuOverrideValues {
  is_listed: boolean;
  is_available: boolean;
  price: number | null;
  discounted_price: number | null;
  discount_cleared: boolean;
}

/** What a branch with no opinion looks like — the store-wide menu. */
export const INHERITED_BRANCH_VALUES: BranchMenuOverrideValues = {
  is_listed: true,
  is_available: true,
  price: null,
  discounted_price: null,
  discount_cleared: false,
};

/**
 * What the service should do about one switch.
 *
 * `noop` is a real outcome, not an oversight: a branch with no row already
 * carries the dish, so switching it on again should not create a row of
 * store-wide defaults for the owner's "has anyone changed this?" counts to
 * trip over.
 */
export type BranchListingWrite =
  | { kind: "noop" }
  | { kind: "delete" }
  | { kind: "upsert"; values: BranchMenuOverrideValues };

/** Whether this row still says anything a customer would notice. */
function overridesNothing(values: BranchMenuOverrideValues): boolean {
  return (
    values.is_listed &&
    values.is_available &&
    values.price === null &&
    values.discounted_price === null &&
    !values.discount_cleared
  );
}

function currentValues(
  current: OutletMenuOverrideRow | null | undefined,
): BranchMenuOverrideValues {
  if (!current) return INHERITED_BRANCH_VALUES;

  return {
    is_listed: current.is_listed,
    is_available: current.is_available,
    price: current.price,
    discounted_price: current.discounted_price,
    discount_cleared: current.discount_cleared,
  };
}

/**
 * Turn one branch's listing switch, keeping everything else that branch said.
 *
 * The merged row is what decides between delete and upsert, so a branch price,
 * a branch sale, an opted-out discount or a sold-out mark all survive the dish
 * being taken off the board and put back on.
 */
export function planBranchListingWrite(
  current: OutletMenuOverrideRow | null | undefined,
  isListed: boolean,
): BranchListingWrite {
  const merged: BranchMenuOverrideValues = { ...currentValues(current), is_listed: isListed };

  if (overridesNothing(merged)) return current ? { kind: "delete" } : { kind: "noop" };

  return { kind: "upsert", values: merged };
}

/** One branch's answer about one dish, as the owner's row renders it. */
export interface BranchProductCell {
  branchId: string;
  branchName: string;
  /** The branch carries the dish at all. This is the switch. */
  isListed: boolean;
  /** Carried, but sellable right now. Shown, never switched from here. */
  isAvailable: boolean;
  /** What this branch actually charges, discount applied. */
  price: number;
}

/** One dish, across every branch. */
export interface BranchProductRow<T extends OverridableMenuItem> {
  product: T;
  branches: BranchProductCell[];
  listedCount: number;
  /**
   * The whole store has this dish switched off. A branch cannot un-86 it, so
   * the row says so rather than offering switches that would do nothing.
   */
  isOffStoreWide: boolean;
  /** The one line worth reading while scanning, or nothing. */
  label: BranchSummaryLabel | null;
}

const effectivePrice = (item: OverridableMenuItem): number =>
  typeof item.discounted_price === "number" ? item.discounted_price : item.price;

/**
 * The owner's cross-branch product list.
 *
 * Every branch appears on every row, including the ones that do not carry the
 * dish — a branch that dropped out is exactly what the owner opened the screen
 * to find, and filtering it out would hide it behind the switch meant to bring
 * it back.
 *
 * Prices and availability come from the same resolution the customer gets, so
 * this screen can never disagree with the storefront or the register.
 */
export function buildBranchProductRows<T extends OverridableMenuItem>(
  products: readonly T[],
  branches: readonly NamedBranch[],
  index: OutletMenuIndex,
): BranchProductRow<T>[] {
  return products.map((product) => {
    const cells = branches.map((branch) => {
      const override = findOutletMenuOverride(index, branch.id, product.id);
      const resolved = resolveItemForOutlet(product, override);

      return {
        branchId: branch.id,
        branchName: branch.name,
        isListed: isItemListedAtOutlet(override),
        isAvailable: resolved.is_available !== false,
        price: effectivePrice(resolved),
      };
    });

    return {
      product,
      branches: cells,
      listedCount: cells.filter((cell) => cell.isListed).length,
      isOffStoreWide: product.is_available === false,
      label: describeBranchSummary(summarizeItemAcrossBranches(product, branches, index)),
    };
  });
}
