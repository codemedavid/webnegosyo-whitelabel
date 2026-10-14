/**
 * The Senior/PWD sheet's working copy of one claimant, before it is applied.
 *
 * The sheet asks three things — who, their ID, what's theirs — and shows the
 * money live as the cashier answers. Everything here is pure so the sheet is
 * only layout: what a choice means for the bill is decided (and tested) here.
 */

import {
  GOV_DISCOUNT_RULES,
  checkIdNumber,
  isClaimantNameValid,
  looksLikeUnusualPwdId,
  unclaimedUnits,
  type GovClaimantInput,
  type GovDiscountKind,
} from "./gov-discount";
import type { PosCartLine } from "./pos-cart";
import { govLinesFromCart, withClaimant, type PosGovSession } from "./pos-gov-discount";
import type { CapturedIdPhoto } from "./gov-id-photos/types";

/**
 * How the claimant's share is decided.
 * `whole`: they are eating alone — every eligible item not already claimed.
 * `items`: the cashier picks their dishes.
 * `shared`: a shared table, split by the number of diners.
 */
export type ShareChoice = "whole" | "items" | "shared";

export interface ClaimantDraft {
  id: string;
  kind: GovDiscountKind;
  name: string;
  idNumber: string;
  share: ShareChoice;
  /** Units picked per cart line key (used when `share` is `items`). */
  units: Readonly<Record<string, number>>;
  /** The optional photo of their ID (only when the store allows photos). */
  idPhoto: CapturedIdPhoto | null;
}

export function newClaimantDraft(id: string, kind: GovDiscountKind): ClaimantDraft {
  return { id, kind, name: "", idNumber: "", share: "whole", units: {}, idPhoto: null };
}

export function draftFromClaimant(
  claimant: GovClaimantInput,
  idPhoto: CapturedIdPhoto | null = null,
): ClaimantDraft {
  return {
    id: claimant.id,
    kind: claimant.kind,
    name: claimant.name,
    idNumber: claimant.idNumber,
    share: claimant.allocation.mode === "shared" ? "shared" : "items",
    units: claimant.allocation.mode === "items" ? claimant.allocation.units : {},
    idPhoto,
  };
}

/** Units of a line this draft may still take (others' claims excluded). */
export function availableUnits(
  line: PosCartLine,
  session: PosGovSession,
  draftId: string,
  excluded: ReadonlySet<string>,
): number {
  if (excluded.has(line.menuItemId)) return 0;
  const [govLine] = govLinesFromCart([line], excluded);
  return unclaimedUnits(govLine, session.claimants, draftId);
}

export function claimantFromDraft(
  draft: ClaimantDraft,
  cart: readonly PosCartLine[],
  session: PosGovSession,
  excluded: ReadonlySet<string>,
): GovClaimantInput {
  const base = { id: draft.id, kind: draft.kind, name: draft.name, idNumber: draft.idNumber };
  if (draft.share === "shared") return { ...base, allocation: { mode: "shared" } };

  const units =
    draft.share === "whole"
      ? Object.fromEntries(
          cart.flatMap((line) => {
            const count = availableUnits(line, session, draft.id, excluded);
            return count > 0 ? [[line.key, count]] : [];
          }),
        )
      : Object.fromEntries(Object.entries(draft.units).filter(([, count]) => count > 0));
  return { ...base, allocation: { mode: "items", units } };
}

/** The session as it would be with this draft applied — for the live preview. */
export function sessionWithDraft(
  session: PosGovSession,
  draft: ClaimantDraft,
  cart: readonly PosCartLine[],
  excluded: ReadonlySet<string>,
): PosGovSession {
  const claimant = claimantFromDraft(draft, cart, session, excluded);
  const next = withClaimant(session, claimant);
  return draft.share === "shared" && next.diners === null ? { ...next, diners: 2 } : next;
}

export function withUnits(draft: ClaimantDraft, lineKey: string, count: number): ClaimantDraft {
  return { ...draft, share: "items", units: { ...draft.units, [lineKey]: Math.max(0, count) } };
}

export interface DraftCheck {
  name: string | null;
  idNumber: string | null;
  /** Soft notice; never blocks. */
  idHint: string | null;
}

/** Inline messages for the ID step — shown only once a field was touched. */
export function checkDraft(draft: ClaimantDraft): DraftCheck {
  const rule = GOV_DISCOUNT_RULES[draft.kind];
  const idVerdict = checkIdNumber(draft.idNumber);
  return {
    name: isClaimantNameValid(draft.name) ? null : "Enter the name printed on the ID.",
    idNumber:
      idVerdict === "ok"
        ? null
        : idVerdict === "missing"
          ? `Enter the ${rule.idLabel}.`
          : "Use letters, numbers and dashes only.",
    idHint:
      idVerdict === "ok" && looksLikeUnusualPwdId(draft.kind, draft.idNumber)
        ? "Not the usual PWD ID format (RR-PPMM-BBB-NNNNNNN) — check the card."
        : null,
  };
}

export function isIdentityComplete(draft: ClaimantDraft): boolean {
  const check = checkDraft(draft);
  return check.name === null && check.idNumber === null;
}
