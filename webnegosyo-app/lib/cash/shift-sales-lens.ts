/**
 * The Shift sales screen's lenses (owner decision 2026-11-04: a cashier sees
 * her own shift's sales, never the whole store's):
 *
 *   mine    the shift holder's own sales — report_shift_sales p_scope 'cashier'
 *   store   everything the branch sold in the shift's hours — p_scope 'window',
 *           only for a cash manager or a Reports holder (the server refuses
 *           anyone else with 42501; the app does not offer it)
 *   drawer  the money this cashier took, counted on the tablet
 *
 * Pure: the screen reads the account, this decides.
 */

import { hasPermission, type StaffPermissionHolder } from "../staff-permissions";
import type { ShiftSalesScope } from "./shift-sales";

export type ShiftSalesLensKey = "mine" | "store" | "drawer";

export interface LensOption {
  label: string;
  value: ShiftSalesLensKey;
}

/** Whether the account may see what the whole branch sold (the server's rule for the window scope). */
export function canSeeStoreSales(user: StaffPermissionHolder): boolean {
  return hasPermission(user, "cash_manage") || hasPermission(user, "reports");
}

export function lensOptions(input: { canSeeStore: boolean; isMine: boolean }): LensOption[] {
  const own: LensOption = { label: input.isMine ? "My sales" : "Cashier's sales", value: "mine" };
  const drawer: LensOption = { label: "My drawer", value: "drawer" };
  return input.canSeeStore ? [own, { label: "Store sales", value: "store" }, drawer] : [own, drawer];
}

/** `?lens=mine` (End shift, My shifts, the Drawer) opens on her own sales; a plain cashier always does. */
export function initialLens(input: { param: string | undefined; canSeeStore: boolean }): ShiftSalesLensKey {
  if (!input.canSeeStore || input.param === "mine") return "mine";
  return "store";
}

/** Which report the server is asked for under a lens. A plain cashier is only ever asked hers. */
export function reportScopeFor(lens: ShiftSalesLensKey, canSeeStore: boolean): ShiftSalesScope {
  if (!canSeeStore || lens === "mine") return "cashier";
  return "window";
}
