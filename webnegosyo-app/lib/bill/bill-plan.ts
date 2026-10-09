/**
 * How the cashier has chosen to split a bill. Pure; held in memory by
 * `stores/bill-store.ts`, so walking away from the bill and back keeps it.
 *
 * Once a guest has paid, the split is locked: changing the guest count or who
 * had what would move the shares under money already taken. The cashier can
 * start over (the payments stay on the orders' ledgers) and split what is left.
 */

export type SplitMode = "one" | "even" | "items";

export interface BillPlan {
  mode: SplitMode;
  guests: number;
  /** Unit id → guest index (0-based). A unit with no entry is still on the table. */
  assignment: Readonly<Record<string, number>>;
  /** What an even split divides, frozen when it was chosen. */
  basisCents: number | null;
  /** Part key ("even:0", "items:2") → centavos collected through this bill. */
  paid: Readonly<Record<string, number>>;
}

export const MIN_GUESTS = 2;
export const MAX_GUESTS = 20;

export const EMPTY_PLAN: BillPlan = {
  mode: "one",
  guests: MIN_GUESTS,
  assignment: {},
  basisCents: null,
  paid: {},
};

export function billKey(orderIds: readonly string[]): string {
  return [...orderIds].sort().join(",");
}

export function isPlanLocked(plan: BillPlan): boolean {
  return Object.values(plan.paid).some((cents) => cents > 0);
}

export function partPaidCents(plan: BillPlan, partKey: string): number {
  return plan.paid[partKey] ?? 0;
}

export function setMode(plan: BillPlan, mode: SplitMode, owedCents: number): BillPlan {
  if (isPlanLocked(plan) || plan.mode === mode) return plan;
  return { ...plan, mode, basisCents: mode === "even" ? owedCents : null };
}

export function setGuests(plan: BillPlan, guests: number): BillPlan {
  if (isPlanLocked(plan)) return plan;
  const next = Math.min(MAX_GUESTS, Math.max(MIN_GUESTS, Math.floor(guests)));
  const assignment = Object.fromEntries(
    Object.entries(plan.assignment).filter(([, guest]) => guest < next),
  );
  return { ...plan, guests: next, assignment };
}

/** `null` puts the piece back on the table. */
export function assignUnit(plan: BillPlan, unitId: string, guest: number | null): BillPlan {
  if (isPlanLocked(plan)) return plan;
  const rest = Object.fromEntries(Object.entries(plan.assignment).filter(([id]) => id !== unitId));
  return { ...plan, assignment: guest === null ? rest : { ...rest, [unitId]: guest } };
}

export function recordPartPayment(plan: BillPlan, partKey: string, cents: number): BillPlan {
  if (cents <= 0) return plan;
  return { ...plan, paid: { ...plan.paid, [partKey]: partPaidCents(plan, partKey) + cents } };
}
