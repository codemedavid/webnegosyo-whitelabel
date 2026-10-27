/**
 * The "Remit to" choice at the end of a shift (06 §4.3 step 4) and how it
 * reaches `close_shift(…, p_remit_to, p_remit_to_safe, …)` (CONTRACTS W2.2).
 *
 * A person: the cash goes to them; they accept on their phone ("Send to their
 * phone") or type their PIN on this tablet ("PIN here now", W2.3 route).
 * The store safe: the drop safe; optionally naming who will open it, who then
 * accepts later. Either way `remit_to` is advisory — the receiver's own accept
 * is what settles it.
 */

/** Someone who may receive cash here: a cash manager with reach to this branch. */
export interface CashReceiver {
  userId: string;
  name: string;
  /** "Owner", "Manager". */
  roleLabel?: string | null;
  /** Already worded: "On shift now", "Last seen 2h ago". */
  presence?: string | null;
  /** false = no approver PIN set, so "PIN here now" can't work. Unknown (undefined) is allowed; the route answers 412. */
  hasPin?: boolean;
}

export type RemitTarget = { kind: "person"; userId: string } | { kind: "safe"; openerUserId: string | null };

/** How a person receives it. Ignored for the safe. */
export type RemitHow = "phone" | "pin";

export interface RemitCloseArgs {
  remitTo: string | null;
  remitToSafe: boolean;
}

export const PIN_OFFLINE_LINE = "PIN here now needs a connection. Send to their phone instead.";
export const NO_PIN_LINE = "No PIN set. Send to their phone instead.";

/** The two close_shift arguments; null while nothing is picked. */
export function remitCloseArgs(target: RemitTarget | null): RemitCloseArgs | null {
  if (!target) return null;
  if (target.kind === "person") return { remitTo: target.userId, remitToSafe: false };
  return { remitTo: target.openerUserId, remitToSafe: true };
}

/** Why "PIN here now" can't be used for this receiver right now; null = it can. */
export function pinBlockedReason(receiver: CashReceiver | null, isOffline: boolean): string | null {
  if (isOffline) return PIN_OFFLINE_LINE;
  if (receiver?.hasPin === false) return NO_PIN_LINE;
  return null;
}

export function receiverById(receivers: readonly CashReceiver[] | null, userId: string): CashReceiver | null {
  return receivers?.find((receiver) => receiver.userId === userId) ?? null;
}

/** Ready to remit: the safe, or a listed person (by PIN only when PIN can work). */
export function isRemitReady(
  target: RemitTarget | null,
  how: RemitHow,
  receivers: readonly CashReceiver[] | null,
  isOffline: boolean,
): boolean {
  if (!target) return false;
  if (target.kind === "safe") return true;
  const receiver = receiverById(receivers, target.userId);
  if (!receiver) return false;
  return how === "phone" || pinBlockedReason(receiver, isOffline) === null;
}
