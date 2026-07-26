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

interface PosCartState {
  lines: PosCartLine[];
  /** Order type chosen for this sale; drives service charge and payment methods. */
  orderTypeId: string | null;
  orderTypeName: string | null;
  serviceCharge: ServiceCharge | undefined;
  /** Optional name the cashier took for the customer. */
  customerName: string;

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
  totals: () => CartTotals;
}

export const usePosCartStore = create<PosCartState>((set, get) => ({
  lines: [],
  orderTypeId: null,
  orderTypeName: null,
  serviceCharge: undefined,
  customerName: "",

  add: (input) => set((s) => ({ lines: addLine(s.lines, input) })),
  setQty: (key, quantity) => set((s) => ({ lines: updateQty(s.lines, key, quantity) })),
  remove: (key) => set((s) => ({ lines: removeLine(s.lines, key) })),

  // Clears the sale but keeps the order type, so a cashier ringing up a queue
  // of dine-in customers does not re-pick it for every single sale.
  reset: () => set({ lines: clearCart(), customerName: "" }),

  setOrderType: (orderTypeId, orderTypeName, serviceCharge) =>
    set({ orderTypeId, orderTypeName, serviceCharge }),

  setCustomerName: (customerName) => set({ customerName }),

  totals: () => cartTotals(get().lines, get().serviceCharge),
}));
