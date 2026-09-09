/**
 * The register's displayed money, selected from the cart store's INPUTS.
 *
 * `pos-cart-store.ts` owns the WRITES and stays the source `pos-tender` charges
 * through. But the screen showing the bill needs the same figures as a pure
 * function of state, so React can recompute them exactly when an input moves —
 * not from a hand-maintained dependency list over `getState()`, which is how
 * the vouchers behind an edited order (attached a beat after navigation) once
 * failed to change the total on screen.
 *
 * No arithmetic lives here. `cartTotals` and `editModeTotals` add the money;
 * this file only hands them the right inputs, the same way the store does.
 */

import { cartTotals, round2, type CartTotals, type PosCartLine, type ServiceCharge } from "./pos-cart";
import { chargeableDeliveryFee, type PosDeliveryDetails } from "./pos-delivery";
import { sessionDiscount, type PosDiscountSession } from "./pos-discount-session";
import { editModeTotals, type EditModeTotals, type OrderEditContext } from "./pos-edit-mode";
import type { OrderDiscountLine } from "./order-totals";

export interface RegisterMoneyInputs {
  lines: PosCartLine[];
  serviceCharge: ServiceCharge | undefined;
  discount: PosDiscountSession;
  delivery: PosDeliveryDetails;
  editContext: OrderEditContext | null;
  /** The branch the sale is rung on — a voucher may be locked to one shop. */
  outletId: string | null;
  now: Date;
}

export interface RegisterMoney {
  totals: CartTotals;
  /** The discount lines priced against the cart as it stands. */
  discountLines: readonly OrderDiscountLine[];
  /** The edit's own judgement, or null when this is a fresh counter sale. */
  edit: EditModeTotals | null;
}

interface DiscountBasis {
  /** The chargeable cap the discount engine prices against. */
  charge: number;
  deliveryFee: number;
}

/**
 * What a discount is priced against — the same rule as the store's
 * `discountBasis`: an edited order from the bill as placed, a counter sale
 * from the live service charge plus any attached delivery fee.
 */
function discountBasis(inputs: RegisterMoneyInputs): DiscountBasis {
  const { lines, serviceCharge, editContext, delivery } = inputs;

  if (editContext) {
    return {
      charge: editContext.carriedCharges + editContext.deliveryFee,
      deliveryFee: editContext.deliveryFee,
    };
  }

  const fee = chargeableDeliveryFee(delivery);
  return {
    charge: round2(cartTotals(lines, serviceCharge).serviceCharge + fee),
    deliveryFee: fee,
  };
}

export function selectRegisterMoney(inputs: RegisterMoneyInputs): RegisterMoney {
  const { lines, serviceCharge, discount, delivery, editContext, outletId, now } = inputs;
  const basis = discountBasis(inputs);

  const discountLines = sessionDiscount(
    discount,
    lines,
    basis.charge,
    now,
    outletId,
    basis.deliveryFee,
  ).lines;

  return {
    totals: cartTotals(lines, serviceCharge, discountLines, chargeableDeliveryFee(delivery)),
    discountLines,
    edit: editContext ? editModeTotals(lines, editContext, discountLines) : null,
  };
}
