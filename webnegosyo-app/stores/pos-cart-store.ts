/**
 * Register cart state.
 *
 * Deliberately NOT persisted: a cart restored from a previous shift would let a
 * cashier ring up stale items into a new sale. The register always opens empty.
 *
 * All mutations delegate to the pure engine in lib/pos-cart.ts, which returns
 * new arrays — this store never mutates in place.
 */

import { create } from "zustand";
import {
  addLine,
  cartTotals,
  clearCart,
  removeLine,
  updateQty,
  type CartTotals,
  type PosCartLine,
  type PosLineInput,
  type ServiceCharge,
} from "../lib/pos-cart";
import {
  editModeTotals,
  withEditVouchers,
  type EditModeTotals,
  type EnteredEditMode,
  type OrderEditContext,
} from "../lib/pos-edit-mode";
import { useAuthStore } from "./auth-store";
import {
  EMPTY_POS_DISCOUNT_SESSION,
  addSessionVoucher,
  clearSessionManualDiscount,
  discountAfterCartChange,
  removeSessionVoucher,
  sessionDiscount,
  setSessionManualDiscount,
  type PosDiscountSession,
  type PosSessionDiscount,
} from "../lib/pos-discount-session";
import type { ManualDiscount } from "../lib/pos-discount";
import { previewSessionVoucher, type VoucherEntryVerdict } from "../lib/pos-voucher-entry";
import type { StaffPermissionHolder } from "../lib/staff-permissions";
import type { Voucher } from "../lib/vouchers/types";
import {
  clearedSaleCustomer,
  type AttachedCustomer,
} from "../lib/customers/pos-attachment";

interface PosCartState {
  lines: PosCartLine[];
  /**
   * Set while the register is editing a placed order rather than ringing up a
   * new sale. Null is the ordinary counter-sale mode.
   *
   * Held here rather than in a route param because the register and the tender
   * screen are separate routes that must agree on which order is being edited —
   * a param would have to be threaded through every navigation between them.
   */
  editContext: OrderEditContext | null;
  /** Modifiers on the edited order that are no longer on the live menu. */
  editWarnings: string[];
  /** Order type chosen for this sale; drives service charge and payment methods. */
  orderTypeId: string | null;
  orderTypeName: string | null;
  serviceCharge: ServiceCharge | undefined;
  /** Optional name the cashier took for the customer. */
  customerName: string;
  /**
   * A known guest picked from the customer list, or null for a walk-in.
   *
   * Held alongside `customerName` rather than replacing it: most counter sales
   * are anonymous and the free-text box stays the fast path. What the
   * attachment adds is a *contact*, which is what makes the sale land on the
   * guest's profile — see `lib/customers/pos-attachment.ts`.
   */
  attachedCustomer: AttachedCustomer | null;

  add: (input: PosLineInput) => void;
  setQty: (key: string, quantity: number) => void;
  remove: (key: string) => void;
  reset: () => void;
  setOrderType: (
    orderTypeId: string,
    orderTypeName: string,
    serviceCharge: ServiceCharge | undefined,
  ) => void;
  setCustomerName: (name: string) => void;
  /** Attach a guest to this sale, or pass null to make it a walk-in again. */
  setAttachedCustomer: (customer: AttachedCustomer | null) => void;
  totals: () => CartTotals;

  /** Vouchers presented and any open discount given for THIS sale. */
  discount: PosDiscountSession;
  applyVoucher: (voucher: Voucher) => void;
  removeVoucher: (code: string) => void;
  setManualDiscount: (manual: ManualDiscount, user: StaffPermissionHolder) => void;
  clearManualDiscount: () => void;
  /** Priced against the cart as it stands, never a remembered figure. */
  sessionDiscount: () => PosSessionDiscount;
  /** Judges a code against this sale before it is accepted. */
  checkVoucher: (voucher: Voucher) => VoucherEntryVerdict;

  /**
   * What the order being edited is now worth, codes applied during the edit
   * included. Null on an ordinary counter sale.
   *
   * Lives on the store rather than on each screen because the register and the
   * tender screen both need it, and a figure computed twice is a figure that
   * can disagree with itself — one shown to the cashier, the other saved.
   */
  editTotals: () => EditModeTotals | null;

  /** Load a placed order into the register. Replaces the cart wholesale. */
  beginEdit: (entered: EnteredEditMode) => void;
  /** Null means the lookup failed — the bill as placed is then carried. */
  setEditVouchers: (vouchers: Voucher[] | null) => void;
  /** Leave edit mode and clear the cart, saved or abandoned. */
  endEdit: () => void;
}

/**
 * The bill a discount is judged and capped against.
 *
 * A COUNTER SALE is priced from the chosen order type: the service charge is
 * whatever that type adds, and there is no delivery — the register has no
 * concept of it.
 *
 * An EDITED ORDER is priced from the bill as placed. Its service charge is the
 * residue the order carried beyond items and delivery, and its delivery fee is
 * real. Judging one against the counter-sale basis is what rejected a
 * free-delivery voucher on a delivery order as `no_delivery_fee`, and what
 * capped a discount against the wrong bill.
 *
 * The two are folded here, once, so `sessionDiscount` and `checkVoucher` can
 * never answer from different bills — an accepted code that then prices to
 * nothing is the exact failure the sheet was built to stop.
 */
function discountBasis(state: PosCartState): { charge: number; deliveryFee: number } {
  const { lines, serviceCharge, editContext } = state;

  if (editContext) {
    return {
      charge: editContext.carriedCharges + editContext.deliveryFee,
      deliveryFee: editContext.deliveryFee,
    };
  }

  return { charge: cartTotals(lines, serviceCharge).serviceCharge, deliveryFee: 0 };
}

export const usePosCartStore = create<PosCartState>((set, get) => ({
  lines: [],
  editContext: null,
  editWarnings: [],
  orderTypeId: null,
  orderTypeName: null,
  serviceCharge: undefined,
  ...clearedSaleCustomer(),
  discount: EMPTY_POS_DISCOUNT_SESSION,

  add: (input) => set((s) => ({ lines: addLine(s.lines, input) })),
  // Both of these can empty the cart — `updateQty(key, 0)` removes the line —
  // and an emptied cart is the end of a sale. `discountAfterCartChange` decides
  // whether the held discount survives, so a cashier stepping down to zero
  // instead of pressing Clear cannot carry a voucher onto the next customer.
  setQty: (key, quantity) =>
    set((s) => {
      const lines = updateQty(s.lines, key, quantity);
      return { lines, discount: discountAfterCartChange(s.discount, lines) };
    }),
  remove: (key) =>
    set((s) => {
      const lines = removeLine(s.lines, key);
      return { lines, discount: discountAfterCartChange(s.discount, lines) };
    }),

  // Clears the sale but keeps the order type, so a cashier ringing up a queue
  // of dine-in customers does not re-pick it for every single sale.
  // The discount is cleared with the cart. A voucher left held would be
  // applied to the NEXT customer's sale, which is money given away to someone
  // who never presented a code. The attached guest goes for the same reason:
  // the next sale would otherwise be credited to the previous customer.
  reset: () =>
    set({
      lines: clearCart(),
      ...clearedSaleCustomer(),
      editContext: null,
      editWarnings: [],
      discount: EMPTY_POS_DISCOUNT_SESSION,
    }),

  // The discount goes too. A voucher held for the abandoned counter sale would
  // otherwise price itself onto somebody else's already-placed order and show
  // the cashier a discount row nobody gave.
  beginEdit: (entered) =>
    set({
      lines: entered.cart,
      editContext: entered.context,
      editWarnings: entered.warnings,
      ...clearedSaleCustomer(),
      discount: EMPTY_POS_DISCOUNT_SESSION,
    }),

  /**
   * Attaches the vouchers behind an edited order's discount once fetched.
   *
   * Ignored if the edit has already ended, so a slow lookup returning after
   * the cashier backed out cannot resurrect a stale context.
   */
  setEditVouchers: (vouchers) =>
    set((s) =>
      s.editContext ? { editContext: withEditVouchers(s.editContext, vouchers) } : {},
    ),

  // Leaves an empty register rather than restoring whatever preceded the edit:
  // `canEnterEditMode` only admits an edit onto an empty cart, so there is
  // never a counter sale underneath to restore.
  // Clears the guest too. Leaving edit mode previously kept whatever name was
  // in the box, which with an attachment would credit the next counter sale to
  // the edited order's customer.
  endEdit: () =>
    set({
      lines: clearCart(),
      ...clearedSaleCustomer(),
      editContext: null,
      editWarnings: [],
      discount: EMPTY_POS_DISCOUNT_SESSION,
    }),

  setOrderType: (orderTypeId, orderTypeName, serviceCharge) =>
    set({ orderTypeId, orderTypeName, serviceCharge }),

  setCustomerName: (customerName) => set({ customerName }),

  applyVoucher: (voucher) => set((s) => ({ discount: addSessionVoucher(s.discount, voucher) })),
  removeVoucher: (code) => set((s) => ({ discount: removeSessionVoucher(s.discount, code) })),
  setManualDiscount: (manual, user) =>
    set((s) => ({ discount: setSessionManualDiscount(s.discount, manual, user) })),
  clearManualDiscount: () => set((s) => ({ discount: clearSessionManualDiscount(s.discount) })),

  /**
   * Prices this sale's discounts against the cart as it currently stands.
   *
   * The resolved service charge comes from `cartTotals` rather than being
   * recomputed here — it owns that arithmetic, and a second implementation is
   * exactly what the money-wiring guardrail exists to prevent.
   */
  sessionDiscount: () => {
    const { lines, discount } = get();
    const { charge, deliveryFee } = discountBasis(get());
    // The branch comes from the session, not a caller: `totals()` is read from
    // many places that have no reason to know about outlets, and a dropped
    // branch would silently honour a voucher locked to another shop.
    const outletId = useAuthStore.getState().outletId;
    return sessionDiscount(discount, lines, charge, new Date(), outletId, deliveryFee);
  },

  checkVoucher: (voucher) => {
    const { lines, discount } = get();
    const { charge, deliveryFee } = discountBasis(get());
    return previewSessionVoucher(
      discount,
      voucher,
      lines,
      charge,
      new Date(),
      useAuthStore.getState().outletId,
      deliveryFee,
    );
  },

  editTotals: () => {
    const { lines, editContext } = get();
    if (!editContext) return null;
    return editModeTotals(lines, editContext, get().sessionDiscount().lines);
  },

  setAttachedCustomer: (attachedCustomer) => set({ attachedCustomer }),

  totals: () =>
    cartTotals(get().lines, get().serviceCharge, get().sessionDiscount().lines),
}));
