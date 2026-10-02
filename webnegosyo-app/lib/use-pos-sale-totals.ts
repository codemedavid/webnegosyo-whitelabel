import { useMemo } from "react";
import type { OrderDiscountLine } from "./order-totals";
import type { CartTotals } from "./pos-cart";
import type { EditModeTotals } from "./pos-edit-mode";
import { usePosCartStore } from "../stores/pos-cart-store";

export interface PosSaleTotals {
  /** The counter sale as it stands — discounts, service and delivery applied. */
  totals: CartTotals;
  /** The discount rows those totals include, priced against the current cart. */
  discountLines: readonly OrderDiscountLine[];
  /** Editing a placed order: what it is now worth. Null on a counter sale. */
  edit: EditModeTotals | null;
}

/**
 * The register's money, recomputed whenever anything it is priced from moves.
 *
 * Keyed on the WHOLE store state rather than a hand-kept list of fields. The
 * tender screen used to memo on `[lines, serviceCharge, delivery]`, and the
 * discount was not on the list: it is a hidden tab that stays mounted, so from
 * the second sale of a launch on, a voucher applied after the last item left
 * "Amount due" at full price while the cart showed the discount. Each new
 * pricing input (delivery, then the discount) had to be remembered in every
 * screen's list separately; the list was the bug. Every write to the store
 * replaces its state object, so nothing that prices a sale can be missed.
 */
export function usePosSaleTotals(): PosSaleTotals {
  const state = usePosCartStore();

  return useMemo(
    () => ({
      totals: state.totals(),
      discountLines: state.sessionDiscount().lines,
      edit: state.editTotals(),
    }),
    [state],
  );
}
