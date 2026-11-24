/**
 * Custom amounts: the cashier types what some guests pay ("Guest 1 pays
 * ₱500") and every guest left blank shares the rest evenly. With two guests
 * that is one typed figure, the other guest takes the rest. Pure, in whole
 * centavos.
 *
 * The amounts must add up to what the split divides (`basisCents`, frozen when
 * the split was chosen). When they do not, `problem` says by how much and the
 * screen holds every Collect until it is fixed: over-collecting is refused by
 * the ledger anyway, and an unassigned remainder is money nobody is asked for.
 */
import { evenShareCents } from "./bill-split";
import { formatPeso } from "../format";
import { fromCents } from "./money";

export type CustomSplitProblem = { kind: "over"; cents: number } | { kind: "short"; cents: number };

export interface CustomSplit {
  /** One share per guest, in guest order. */
  shares: number[];
  /** Guest index → whether the amount was typed (false = their part of the rest). */
  isTyped: boolean[];
  problem: CustomSplitProblem | null;
}

export function customShareCents(
  basisCents: number,
  guests: number,
  amounts: Readonly<Record<string, number>>,
): CustomSplit {
  const count = Number.isInteger(guests) && guests > 0 ? guests : 0;
  const typed = Array.from({ length: count }, (_, guest) => {
    const cents = amounts[String(guest)];
    return Number.isSafeInteger(cents) && cents >= 0 ? cents : null;
  });
  const typedSum = typed.reduce<number>((sum, cents) => sum + (cents ?? 0), 0);
  const blanks = typed.flatMap((cents, guest) => (cents === null ? [guest] : []));
  const rest = basisCents - typedSum;

  const restShares = rest > 0 && blanks.length > 0 ? evenShareCents(rest, blanks.length) : blanks.map(() => 0);
  const shareOf = new Map(blanks.map((guest, index) => [guest, restShares[index]]));
  const shares = typed.map((cents, guest) => cents ?? shareOf.get(guest) ?? 0);

  const problem: CustomSplitProblem | null =
    rest < 0 ? { kind: "over", cents: -rest } : rest > 0 && blanks.length === 0 ? { kind: "short", cents: rest } : null;

  return { shares, isTyped: typed.map((cents) => cents !== null), problem };
}

function pesos(cents: number): string {
  return formatPeso(fromCents(cents));
}

export function customProblemText(problem: CustomSplitProblem): string {
  return problem.kind === "over"
    ? `The amounts are ${pesos(problem.cents)} more than the bill. Lower one of them.`
    : `${pesos(problem.cents)} is not on anyone yet. Clear a guest's amount to give them the rest.`;
}

/**
 * What the cashier typed, as centavos. Blank = `null` (share the rest);
 * anything that is not a peso amount ("1.2.3", "-5") = `undefined`: kept on
 * screen, flagged, and the split does not change under it.
 */
export function parseAmountCents(text: string): number | null | undefined {
  const trimmed = text.trim().replace(/,/g, "");
  if (trimmed === "") return null;
  if (!/^\d+(\.\d{0,2})?$/.test(trimmed) && !/^\.\d{1,2}$/.test(trimmed)) return undefined;
  const cents = Math.round(Number(trimmed) * 100);
  return Number.isSafeInteger(cents) ? cents : undefined;
}
