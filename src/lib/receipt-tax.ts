/**
 * The store's tax registration as a receipt prints it.
 *
 * BYTE-IDENTICAL in `src/lib/receipt-tax.ts` and `webnegosyo-app/lib/receipt-tax.ts`
 * (pinned by `tests/unit/gov-receipt-parity.test.ts`): the web Studio previews
 * and browser-prints with the same identity the register prints with.
 *
 * Absent (`undefined`) for a store that never set up Settings → Tax &
 * discounts, and the receipt then prints exactly as it always has.
 */

import { tinHeaderLine, type TaxProfile } from "./gov-discount/tax-profile";

export interface ReceiptTaxIdentity {
  vatStatus: "vat" | "non_vat";
  /** "VAT REG TIN 123-456-789-00000"; null without a TIN. */
  tinLine: string | null;
  /** The BIR-registered name, printed only when it differs from the store name. */
  registeredName: string | null;
  businessAddress: string | null;
  /**
   * True only with a BIR Permit To Use. Without one the paper is a
   * supplementary document and must say so (RR 7-2024).
   */
  isBirRegisteredPos: boolean;
  posMin?: string | null;
  posSerialNo?: string | null;
  posPtuNo?: string | null;
}

export function receiptTaxIdentity(
  profile: TaxProfile | null | undefined,
): ReceiptTaxIdentity | undefined {
  if (!profile) return undefined;
  return {
    vatStatus: profile.vatStatus,
    tinLine: tinHeaderLine(profile),
    registeredName: profile.registeredName,
    businessAddress: profile.businessAddress,
    isBirRegisteredPos: profile.isBirRegisteredPos,
    posMin: profile.posMin,
    posSerialNo: profile.posSerialNo,
    posPtuNo: profile.posPtuNo,
  };
}
