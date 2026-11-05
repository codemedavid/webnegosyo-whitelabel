/**
 * The sale the register just finished, for the confirmation it shows.
 *
 * After a swipe the register comes straight back, empty, ready for the next
 * customer — the tender screen that showed the change is already gone. This
 * holds the one line that replaces it ("Give ₱50.00 change", "Order placed ·
 * ₱450.00 unpaid") until the cashier dismisses it or it times out.
 *
 * In memory only: a confirmation is for the moment after the sale, and a
 * relaunch has no business replaying it.
 */

import { create } from "zustand";
import type { CompletedSaleNotice } from "../lib/pos-tender-mode";
import type { ReceiptOrder } from "../lib/receipt-layout";

export interface LastSale {
  /** The order's id; the same id the receipt printed. */
  orderId: string;
  notice: CompletedSaleNotice;
  /**
   * False while the sale is kept on this device only (offline): the order
   * screen cannot open a row the server does not hold yet.
   */
  canOpenOrder: boolean;
  /**
   * The paid sale's receipt, exactly as the register built it — so the banner
   * can print it again without waiting for the server (or a connection).
   * Absent on a pay-later order: it has no receipt yet, its bill prints later.
   */
  receipt?: ReceiptOrder;
  /**
   * Whether a receipt for this sale really came out of the printer — set by
   * `markReceiptPrinted` after a successful print (tender or banner), never
   * for a print that was only sent. Decides "Print receipt" vs "Reprint".
   */
  isReceiptPrinted?: boolean;
  /** The tender's print while it is still running (`trackTenderReceiptPrint`). */
  receiptPrintJob?: Promise<boolean>;
  shownAt: number;
}

interface LastSaleState {
  lastSale: LastSale | null;
  show: (sale: Omit<LastSale, "shownAt">) => void;
  dismiss: () => void;
  /** A receipt for `orderId` came out; ignored once another sale is shown. */
  markReceiptPrinted: (orderId: string) => void;
}

export const usePosLastSaleStore = create<LastSaleState>((set) => ({
  lastSale: null,
  show: (sale) => set({ lastSale: { ...sale, shownAt: Date.now() } }),
  dismiss: () => set({ lastSale: null }),
  markReceiptPrinted: (orderId) =>
    set((state) =>
      state.lastSale && state.lastSale.orderId === orderId
        ? { lastSale: { ...state.lastSale, isReceiptPrinted: true } }
        : state,
    ),
}));
