/**
 * The BIR Taxpayer Identification Number as an owner types it on a phone.
 *
 * A TIN is nine digits (123-456-789); the BIR adds a branch code of three to
 * five digits (000 for the head office, 00000 on newer certificates). Owners
 * copy it off their Certificate of Registration either way — with or without
 * the branch part — so the field accepts both and `splitTin` separates them.
 *
 * Ported from the web's `src/lib/tax-settings/tin.ts`; the two patterns are the
 * `store_tax_profiles` CHECK constraints, so a value the app accepts is never
 * refused by the database with an unreadable error.
 */

/** Same rule as the `store_tax_profiles_tin_ck` constraint. */
export const TIN_PATTERN = /^[0-9]{3}-?[0-9]{3}-?[0-9]{3}(-?[0-9]{3,5})?$/;

/** Same rule as the `store_tax_profiles_branch_code_ck` constraint. */
export const BRANCH_CODE_PATTERN = /^[0-9]{3,5}$/;

const TIN_GROUPS = [3, 3, 3, 5] as const;
const TIN_BASE_DIGITS = 9;
const BRANCH_CODE_MAX_DIGITS = 5;
export const TIN_MAX_DIGITS = TIN_GROUPS.reduce((sum, size) => sum + size, 0);
/** The longest the TIN field can get once grouped: 14 digits + 3 dashes. */
export const TIN_MAX_LENGTH = TIN_MAX_DIGITS + TIN_GROUPS.length - 1;

function digitsOf(value: string): string {
  return value.replace(/\D/g, "");
}

function groupDigits(digits: string): string {
  const parts: string[] = [];
  let start = 0;
  for (const size of TIN_GROUPS) {
    if (start >= digits.length) break;
    parts.push(digits.slice(start, start + size));
    start += size;
  }
  return parts.join("-");
}

/** What the TIN field shows while typing: digits only, grouped 000-000-000-00000. */
export function formatTinInput(raw: string): string {
  return groupDigits(digitsOf(raw).slice(0, TIN_MAX_DIGITS));
}

/** Digits only, at most five — the branch code field. */
export function formatBranchCodeInput(raw: string): string {
  return digitsOf(raw).slice(0, BRANCH_CODE_MAX_DIGITS);
}

export interface SplitTin {
  /** "123-456-789", or "" when nothing was typed. */
  base: string;
  /** The branch digits typed after the nine, or "". */
  branch: string;
}

/** Separates the nine-digit TIN from a branch code typed after it. */
export function splitTin(value: string): SplitTin {
  const digits = digitsOf(value);
  return {
    base: groupDigits(digits.slice(0, TIN_BASE_DIGITS)),
    branch: digits.slice(TIN_BASE_DIGITS),
  };
}
