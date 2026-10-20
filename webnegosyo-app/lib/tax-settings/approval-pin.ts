/**
 * The "Your approval PIN" card. The shape matches the PIN route's rule (4 to 6
 * digits); whether a PIN is too easy to guess is decided by the server, and its
 * message is shown as-is.
 */

import { hasPermission, type StaffPermissionHolder } from "../staff-permissions";

const PIN_SHAPE = /^[0-9]{4,6}$/;
export const PIN_MAX_LENGTH = 6;

export interface ApprovalPinErrors {
  pin?: string;
  confirmPin?: string;
}

export function validateApprovalPin(pin: string, confirmPin: string): ApprovalPinErrors {
  if (!PIN_SHAPE.test(pin)) return { pin: "Use 4 to 6 numbers" };
  if (pin !== confirmPin) return { confirmPin: "The two PINs do not match" };
  return {};
}

/** Digits only, at most six — what the PIN fields keep while typing. */
export function formatPinInput(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, PIN_MAX_LENGTH);
}

export interface PinHolder extends StaffPermissionHolder {
  isDemo: boolean;
  /** True while a superadmin views a store: they have no store account to hang a PIN on. */
  isImpersonating: boolean;
}

/** Owners, full-access accounts and `discount_review` holders, on a real store account. */
export function canHoldApprovalPin(holder: PinHolder): boolean {
  if (holder.isDemo || holder.isImpersonating || holder.role === "superadmin") return false;
  return hasPermission(holder, "discount_review");
}
