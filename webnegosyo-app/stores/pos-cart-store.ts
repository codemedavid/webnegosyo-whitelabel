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
import type { EnteredEditMode, OrderEditContext } from "../lib/pos-edit-mode";
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

  /** Load a placed order into the register. Replaces the cart wholesale. */
  beginEdit: (entered: EnteredEditMode) => void;
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

  add: (input) => set((s) => ({ lines: addLine(s.lines, input) })),
  setQty: (key, quantity) => set((s) => ({ lines: updateQty(s.lines, key, quantity) })),
  remove: (key) => set((s) => ({ lines: removeLine(s.lines, key) })),

  // Clears the sale but keeps the order type, so a cashier ringing up a queue
  // of dine-in customers does not re-pick it for every single sale.
  reset: () =>
    set({ lines: clearCart(), ...clearedSaleCustomer(), editContext: null, editWarnings: [] }),

  beginEdit: (entered) =>
    set({
      lines: entered.cart,
      editContext: entered.context,
      editWarnings: entered.warnings,
      ...clearedSaleCustomer(),
    }),

  // Leaves an empty register rather than restoring whatever preceded the edit:
  // `canEnterEditMode` only admits an edit onto an empty cart, so there is
  // never a counter sale underneath to restore.
  // Clears the guest too. Leaving edit mode previously kept whatever name was
  // in the box, which with an attachment would credit the next counter sale to
  // the edited order's customer.
  endEdit: () =>
    set({ lines: clearCart(), ...clearedSaleCustomer(), editContext: null, editWarnings: [] }),

  setOrderType: (orderTypeId, orderTypeName, serviceCharge) =>
    set({ orderTypeId, orderTypeName, serviceCharge }),

  setCustomerName: (customerName) => set({ customerName }),

  setAttachedCustomer: (attachedCustomer) => set({ attachedCustomer }),

  totals: () => cartTotals(get().lines, get().serviceCharge),
}));
