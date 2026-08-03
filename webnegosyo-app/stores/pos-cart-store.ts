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
import { withEditVouchers, type EnteredEditMode, type OrderEditContext } from "../lib/pos-edit-mode";
import { useAuthStore } from "./auth-store";
import {
  EMPTY_POS_DISCOUNT_SESSION,
  addSessionVoucher,
  clearSessionManualDiscount,
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

  /** Load a placed order into the register. Replaces the cart wholesale. */
  beginEdit: (entered: EnteredEditMode) => void;
  /** Null means the lookup failed — the bill as placed is then carried. */
  setEditVouchers: (vouchers: Voucher[] | null) => void;
  /** Leave edit mode and clear the cart, saved or abandoned. */
  endEdit: () => void;
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
  setQty: (key, quantity) => set((s) => ({ lines: updateQty(s.lines, key, quantity) })),
  remove: (key) => set((s) => ({ lines: removeLine(s.lines, key) })),

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

  beginEdit: (entered) =>
    set({
      lines: entered.cart,
      editContext: entered.context,
      editWarnings: entered.warnings,
      ...clearedSaleCustomer(),
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
    const { lines, serviceCharge, discount } = get();
    const { serviceCharge: charge } = cartTotals(lines, serviceCharge);
    // The branch comes from the session, not a caller: `totals()` is read from
    // many places that have no reason to know about outlets, and a dropped
    // branch would silently honour a voucher locked to another shop.
    const outletId = useAuthStore.getState().outletId;
    return sessionDiscount(discount, lines, charge, new Date(), outletId);
  },

  checkVoucher: (voucher) => {
    const { lines, serviceCharge, discount } = get();
    const { serviceCharge: charge } = cartTotals(lines, serviceCharge);
    return previewSessionVoucher(
      discount,
      voucher,
      lines,
      charge,
      new Date(),
      useAuthStore.getState().outletId,
    );
  },

  setAttachedCustomer: (attachedCustomer) => set({ attachedCustomer }),

  totals: () =>
    cartTotals(get().lines, get().serviceCharge, get().sessionDiscount().lines),
}));
