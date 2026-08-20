/**
 * The state that belongs to ONE sale at the tender screen.
 *
 * The tender screen is a hidden tab screen, so it mounts once per app launch
 * and is never unmounted by navigation. Anything per-sale must therefore be
 * re-minted on every focus, not at mount: a mount-time idempotency key is
 * shared by every sale after the first (deduping them into the first order),
 * and a mount-time `isCompleting` that a successful sale leaves true freezes
 * the register on the next checkout.
 */

import type { CapturedProof } from "../components/pos/ProofCapture";

export interface TenderSession {
  /**
   * Idempotency key for createOrder. A retry after a network blip inside the
   * same visit reuses it, so the sale is never charged twice; a new visit
   * mints a new one, so two sales are never deduped into one order.
   */
  clientOrderId: string;
  isCompleting: boolean;
  tenderedText: string;
  reference: string;
  proof: CapturedProof | null;
  editReason: string;
}

export function newClientOrderId(): string {
  return `pos-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/** Everything a fresh sale starts from when the tender screen gains focus. */
export function freshTenderSession(): TenderSession {
  return {
    clientOrderId: newClientOrderId(),
    isCompleting: false,
    tenderedText: "",
    reference: "",
    proof: null,
    editReason: "",
  };
}
