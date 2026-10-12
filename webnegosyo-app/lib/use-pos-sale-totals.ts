import { useMemo } from "react";
import type { OrderDiscountLine } from "./order-totals";
import type { CartTotals } from "./pos-cart";
import type { EditModeTotals } from "./pos-edit-mode";
import { usePosCartStore } from "../stores/pos-cart-store";
import { useGovDiscountContextStore } from "../stores/gov-discount-context-store";
import type { PosSessionDiscount } from "./pos-discount-session";

export interface PosSaleTotals {
  /** The counter sale as it stands — discounts, service and delivery applied. */
  totals: CartTotals;
  /** The discount rows those totals include, priced against the current cart. */
  discountLines: readonly OrderDiscountLine[];
  /** Editing a placed order: what it is now worth. Null on a counter sale. */
  edit: EditModeTotals | null;
  /** The full discount picture — including the Senior/PWD side and which won. */
  discount: PosSessionDiscount;
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
 *
 * The Senior/PWD rules live in their own store (loaded after the register
 * opens), so its state is a key too.
 */
export function usePosSaleTotals(): PosSaleTotals {
  const state = usePosCartStore();
  const govContext = useGovDiscountContextStore();

  return useMemo(() => {
    const discount = state.sessionDiscount();
    return {
      totals: state.totals(),
      discountLines: discount.lines,
      edit: state.editTotals(),
      discount,
    };
    // `govContext` is read inside the store methods; it is listed so a profile
    // that lands after the register opened re-prices the sale on screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, govContext]);
}
