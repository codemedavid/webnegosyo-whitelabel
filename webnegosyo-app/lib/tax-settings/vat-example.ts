/**
 * The worked example on the settings screen ("a ₱560 meal → the senior pays
 * ₱400"), computed by the real engine so the words can never drift from what
 * the register charges.
 */

import { computeGovDiscount, type VatStatus } from "../gov-discount";
import { formatPeso } from "../format";

export const EXAMPLE_MEAL_PRICE = 560;

export interface SeniorMealExample {
  price: number;
  /** What the senior pays for their own meal. */
  pays: number;
  /** VAT not charged (VAT stores only; 0 otherwise). */
  vatRemoved: number;
  /** The 20% itself. */
  discount: number;
}

/** A senior dining alone on one meal at a store of this VAT status. Null if the engine refuses. */
export function seniorMealExample(
  vatStatus: VatStatus,
  price: number = EXAMPLE_MEAL_PRICE,
): SeniorMealExample | null {
  const result = computeGovDiscount({
    vatStatus,
    lines: [{ key: "meal", name: "Meal", quantity: 1, amount: price, eligible: true }],
    claimants: [
      {
        id: "example",
        kind: "senior",
        name: "Juan Dela Cruz",
        idNumber: "12345",
        allocation: { mode: "items", units: { meal: 1 } },
      },
    ],
  });
  if (!result.ok) return null;
  const [claimant] = result.claimants;
  return { price, pays: claimant.netDue, vatRemoved: claimant.vatRemoved, discount: claimant.discount };
}

/** "₱400" / "₱448.50" — whole pesos without the ".00". */
export function formatExamplePeso(amount: number): string {
  const formatted = formatPeso(amount);
  return formatted.endsWith(".00") ? formatted.slice(0, -3) : formatted;
}

/** "₱560 meal → a senior or PWD pays ₱400", or "" when the engine refuses. */
export function exampleLine(vatStatus: VatStatus): string {
  const example = seniorMealExample(vatStatus);
  if (!example) return "";
  return `${formatExamplePeso(example.price)} meal → a senior or PWD pays ${formatExamplePeso(example.pays)}`;
}
