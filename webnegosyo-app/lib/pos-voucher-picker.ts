import { formatPeso } from "./format";
import type { VoucherEntryVerdict } from "./pos-voucher-entry";
import type { Voucher } from "./vouchers/types";

/**
 * The merchant's promotions, made choosable at the counter.
 *
 * The register's only way in was a typed code, which assumes the cashier knows
 * what the shop is running. The promotions are written by the owner in the web
 * admin, so "isn't there a student discount?" left the counter guessing at
 * spellings, and a mistyped code is indistinguishable from an expired one.
 *
 * This module decides nothing about money. Whether a voucher can be used on
 * THIS sale — and the sentence explaining why not — comes from the same
 * `previewSessionVoucher` verdict the typed path already goes through, passed
 * in as `judge`. Two implementations of "can this code be used" is exactly the
 * drift that would let the list offer a code the Apply button then refuses.
 */

export interface VoucherChoice {
  voucher: Voucher;
  /** Already on this sale — tapping it again would be a silent no-op. */
  isApplied: boolean;
  isUsable: boolean;
  /** The engine's own wording for a refusal. Absent when usable or applied. */
  reason?: string;
  /** One line of what it is worth, e.g. "20% off · Min ₱500.00". */
  terms: string;
}

/**
 * What the voucher is worth, in the cashier's words.
 *
 * The minimum spend is included because it is the commonest reason a code the
 * customer holds does nothing, and the cashier can act on it — one more item
 * reaches it — where they cannot act on an expiry.
 */
export function voucherTerms(voucher: Voucher): string {
  const value =
    voucher.discountType === "percent"
      ? `${voucher.discountValue}% off`
      : voucher.discountType === "fixed"
        ? `${formatPeso(voucher.discountValue)} off`
        : "Free delivery";

  if (!voucher.minOrderAmount) return value;
  return `${value} · Min ${formatPeso(voucher.minOrderAmount)}`;
}

/** Ranked so the taps a cashier can actually make sit at the top. */
function rank(choice: VoucherChoice): number {
  if (choice.isApplied) return 0;
  return choice.isUsable ? 1 : 2;
}

export function buildVoucherChoices(
  vouchers: readonly Voucher[],
  appliedCodes: readonly string[],
  judge: (voucher: Voucher) => VoucherEntryVerdict,
): VoucherChoice[] {
  const applied = new Set(appliedCodes.map((code) => code.trim().toUpperCase()));

  const choices = vouchers
    // A switched-off or online-only code can never be honoured at a counter.
    // Listing it invites a tap the engine will always refuse, and a list where
    // half the rows do nothing is a list the cashier stops reading. The
    // endpoint filters too; this does not depend on that query staying right.
    .filter((voucher) => voucher.isActive && voucher.channels.includes("pos"))
    .map((voucher): VoucherChoice => {
      const terms = voucherTerms(voucher);

      // Judged only when it is not already held. The engine refuses a held
      // code with "already applied", which rendered as a reason would read as
      // if the voucher itself were broken.
      if (applied.has(voucher.code.trim().toUpperCase())) {
        return { voucher, isApplied: true, isUsable: false, terms };
      }

      const verdict = judge(voucher);
      if (verdict.isAccepted) {
        return { voucher, isApplied: false, isUsable: true, terms };
      }

      return { voucher, isApplied: false, isUsable: false, reason: verdict.message, terms };
    });

  // Stable within a group: the endpoint's order is the merchant's own, and
  // reshuffling it every render would move a row out from under a tapping
  // finger.
  return choices
    .map((choice, index) => ({ choice, index }))
    .sort((a, b) => rank(a.choice) - rank(b.choice) || a.index - b.index)
    .map((entry) => entry.choice);
}
