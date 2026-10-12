/**
 * What an order screen and a receipt say about a Senior/PWD (government)
 * discount: who claimed it, and the VAT block a VAT-registered store prints.
 *
 * BYTE-IDENTICAL in `src/lib/order-gov-summary.ts` and
 * `webnegosyo-app/lib/order-gov-summary.ts` (pinned by
 * `tests/unit/gov-receipt-parity.test.ts`), like `order-summary-rows.ts`: the
 * admin dialog, the register's order screen and the printed paper must name
 * the same claimants and the same figures.
 *
 * Pure and render-agnostic. Amounts are MAGNITUDES; `kind` says which row is
 * a deduction.
 */

import { maskIdNumber } from "./gov-discount/claimant-id";
import type { StoredGovDiscount } from "./gov-discount/payload";
import { GOV_DISCOUNT_KINDS, GOV_DISCOUNT_RULES, type GovDiscountRule } from "./gov-discount/rules";
import { saleVatBreakdown } from "./gov-discount/sale-vat";
import type { GovClaimantResult, VatBreakdown, VatStatus } from "./gov-discount/types";

export interface GovClaimantRow {
  id: string;
  /** "SC", "PWD", … — the receipt and sales-book code. */
  code: GovDiscountRule["code"];
  /** "Senior Citizen", "PWD", … */
  kindLabel: string;
  name: string;
  /** The full ID number — printed on the receipt, as BIR requires. */
  idNumber: string;
  /** "••••1234" — what a screen shows until someone asks for more. */
  maskedId: string;
  /** Their share of the bill before anything came off. */
  share: number;
  /** Everything taken off the bill for them (VAT removed + the discount). */
  reduction: number;
  /** "Own order" or "Shared table · 4 diners". */
  basis: string;
}

export type VatRowKind = "vatable" | "vat" | "vatExempt" | "zeroRated" | "lessDiscount";

export interface VatRow {
  kind: VatRowKind;
  label: string;
  /** Always positive; `lessDiscount` is the one deduction. */
  amount: number;
}

export interface GovOrderSummary {
  claimants: GovClaimantRow[];
  /** Empty at a non-VAT store. */
  vatRows: VatRow[];
  /** Who approved it, when a manager had to. */
  approverName: string | null;
}

function claimantBasis(claimant: GovClaimantResult, diners: number | null): string {
  if (claimant.allocation.mode === "items") return "Own order";
  return diners ? `Shared table · ${diners} diners` : "Shared table";
}

export function govClaimantRows(government: StoredGovDiscount | null | undefined): GovClaimantRow[] {
  if (!government) return [];
  return government.claimants.map((claimant) => {
    const rule = GOV_DISCOUNT_RULES[claimant.kind];
    return {
      id: claimant.id,
      code: rule.code,
      kindLabel: rule.label,
      name: claimant.name,
      idNumber: claimant.idNumber,
      maskedId: maskIdNumber(claimant.idNumber),
      share: claimant.grossShare,
      reduction: claimant.reduction,
      basis: claimantBasis(claimant, government.diners),
    };
  });
}

/** "Less: SC/PWD Discount" — only the exempt kinds' 20% is printed under "Less". */
function lessDiscountLabel(claimants: readonly GovClaimantResult[]): string {
  const codes = GOV_DISCOUNT_KINDS.filter(
    (kind) =>
      GOV_DISCOUNT_RULES[kind].vatTreatment === "exempt" &&
      claimants.some((claimant) => claimant.kind === kind && claimant.discount > 0),
  ).map((kind) => GOV_DISCOUNT_RULES[kind].code);
  return `Less: ${codes.length > 0 ? codes.join("/") : "SC/PWD"} Discount`;
}

/**
 * The invoice's VAT lines (RR 7-2024 §6(B.13)). All four sales lines are
 * always present — an exempt sale missing its "VAT-Exempt Sales" line reads
 * as VATable — and the "Less:" line appears only when something was taken.
 */
export function vatRows(vat: VatBreakdown, claimants: readonly GovClaimantResult[] = []): VatRow[] {
  const rows: VatRow[] = [
    { kind: "vatable", label: "VATable Sales", amount: vat.vatableSales },
    { kind: "vat", label: "VAT (12%)", amount: vat.vatAmount },
    { kind: "vatExempt", label: "VAT-Exempt Sales", amount: vat.vatExemptSales },
    { kind: "zeroRated", label: "Zero-Rated Sales", amount: vat.zeroRatedSales },
  ];
  if (vat.lessDiscounts > 0) {
    rows.push({ kind: "lessDiscount", label: lessDiscountLabel(claimants), amount: vat.lessDiscounts });
  }
  return rows;
}

export interface OrderVatInput {
  government?: StoredGovDiscount | null;
  /** The store's registration today; only consulted for an order with no claimants. */
  storeVatStatus?: VatStatus | null;
  /** What was charged. Authoritative. */
  total: number;
}

/**
 * The VAT block for an order, or null when none should print.
 *
 * An order with claimants prints what it was PRICED with (its stored block),
 * whatever the store's registration says today — re-deriving it would move
 * the exempt share back into VATable sales. Any other order at a VAT store is
 * all VATable, so the block is read straight off the authoritative total.
 */
export function orderVatBreakdown(input: OrderVatInput): VatBreakdown | null {
  const government = input.government;
  if (government && government.claimants.length > 0) {
    return government.vatStatus === "vat" ? government.vat : null;
  }
  if (input.storeVatStatus !== "vat") return null;
  return saleVatBreakdown({ vatStatus: "vat", itemsTotal: input.total });
}

/** Null when the order carries no government discount. */
export function govOrderSummary(government: StoredGovDiscount | null | undefined): GovOrderSummary | null {
  if (!government || government.claimants.length === 0) return null;
  const vat = government.vatStatus === "vat" ? government.vat : null;
  return {
    claimants: govClaimantRows(government),
    vatRows: vat ? vatRows(vat, government.claimants) : [],
    approverName: government.approval?.approverName ?? null,
  };
}
