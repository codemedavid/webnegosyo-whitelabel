/**
 * Payment-method classification for the POS tender screen.
 *
 * `payment_methods` has no "is cash" column — merchants just name the method —
 * so cash is inferred from the name. The inference only decides which UI opens
 * (numeric keypad vs QR display); the merchant's explicit
 * `require_payment_proof` flag is still honoured on top of it.
 *
 * Pure and side-effect free. The Supabase read lives in the screen; this module
 * only shapes and classifies.
 */

import type { PosTender } from "./pos-order";

/**
 * Whole-word cash names. Anchored so "GCash" — a wallet whose name ENDS in
 * "cash" — is never misread as physical cash at the drawer.
 */
const CASH_NAME = /(^|\s)(cash|cod)(\s|$)/i;

/** A tenant's payment method, as read from Supabase. */
export interface PosPaymentMethod {
  id: string;
  name: string;
  details: string | null;
  qr_code_url: string | null;
  require_payment_proof: boolean;
  order_index: number;
}

/** What the tender screen collected before completing the sale. */
export interface TenderInput {
  cashTendered?: number;
  changeDue?: number;
  proofUrl?: string;
  proofFileId?: string;
  reference?: string;
}

/** True when this method is settled with physical cash at the drawer. */
export function isCashMethod(method: PosPaymentMethod): boolean {
  return CASH_NAME.test(method.name);
}

/**
 * Whether completing the sale requires a confirmation photo.
 *
 * Every non-cash method does: the cashier must photograph the customer's
 * payment confirmation before the sale can be swiped through. A cash method
 * does not, unless the merchant explicitly flagged it.
 */
export function requiresProof(method: PosPaymentMethod): boolean {
  return !isCashMethod(method) || method.require_payment_proof;
}

/** What the cashier has entered so far to evidence a cashless payment. */
export interface ProofEvidence {
  reference?: string;
  hasProof?: boolean;
}

/**
 * Whether the sale is still waiting on evidence that the customer paid.
 *
 * A reference number and a photo are alternatives, not a pair: the wallet's
 * transaction number identifies the payment on its own, so once it is typed
 * there is nothing left for the camera to add. This matches online checkout,
 * which has always taken a screenshot OR a reference.
 */
export function isProofOutstanding(
  method: PosPaymentMethod,
  evidence: ProofEvidence,
): boolean {
  if (!requiresProof(method)) return false;
  return !evidence.hasProof && !evidence.reference?.trim();
}

/**
 * Build the tender record for a completed sale.
 *
 * Cash and proof fields are mutually exclusive by construction, so a cash sale
 * can never carry a stray screenshot and a wallet sale can never claim change
 * was handed back.
 */
export function toTender(method: PosPaymentMethod, input: TenderInput): PosTender {
  const isCash = isCashMethod(method);

  const settlement = isCash
    ? { cashTendered: input.cashTendered, changeDue: input.changeDue }
    : {
        proofUrl: input.proofUrl,
        proofFileId: input.proofFileId,
        reference: input.reference,
      };

  return {
    methodName: method.name,
    isCash,
    ...(method.details ? { methodDetails: method.details } : {}),
    ...Object.fromEntries(
      Object.entries(settlement).filter(([, value]) => value !== undefined),
    ),
  };
}
