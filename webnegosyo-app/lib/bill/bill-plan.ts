/**
 * How the cashier has chosen to split a bill. Pure; held in memory by
 * `stores/bill-store.ts`, so walking away from the bill and back keeps it.
 *
 * Once a guest has paid, the split is locked: changing the guest count or who
 * had what would move the shares under money already taken. The cashier can
 * start over (the payments stay on the orders' ledgers) and split what is left.
 * Custom amounts are the one exception: a guest who has paid keeps the amount
 * they paid against, while the others' amounts can still change.
 */

export type SplitMode = "one" | "even" | "items" | "custom";

export interface BillPlan {
  mode: SplitMode;
  guests: number;
  /** Unit id → guest index (0-based). A unit with no entry is still on the table. */
  assignment: Readonly<Record<string, number>>;
  /** What an even or custom split divides, frozen when it was chosen. */
  basisCents: number | null;
  /**
   * Custom amounts: guest index → centavos the cashier typed for them. A guest
   * with no entry shares what the typed amounts leave, evenly with the other
   * blank guests (`customShareCents`).
   */
  amounts: Readonly<Record<string, number>>;
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
  amounts: {},
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
  const isDivided = mode === "even" || mode === "custom";
  return { ...plan, mode, basisCents: isDivided ? owedCents : null, amounts: {} };
}

export function setGuests(plan: BillPlan, guests: number): BillPlan {
  if (isPlanLocked(plan)) return plan;
  const next = Math.min(MAX_GUESTS, Math.max(MIN_GUESTS, Math.floor(guests)));
  const assignment = Object.fromEntries(
    Object.entries(plan.assignment).filter(([, guest]) => guest < next),
  );
  const amounts = Object.fromEntries(Object.entries(plan.amounts).filter(([guest]) => Number(guest) < next));
  return { ...plan, guests: next, assignment, amounts };
}

export function customPartKey(guest: number): string {
  return `custom:${guest}`;
}

/**
 * Types (or, with `null`, clears) a guest's custom amount. Refused once that
 * guest has paid anything: their share is what the money was taken against.
 * Other guests stay editable, so "Guest 1 paid ₱500" never blocks the rest.
 */
export function setCustomAmount(plan: BillPlan, guest: number, cents: number | null): BillPlan {
  if (plan.mode !== "custom" || guest < 0 || guest >= plan.guests) return plan;
  if (partPaidCents(plan, customPartKey(guest)) > 0) return plan;
  const key = String(guest);
  if (cents === null) {
    if (!(key in plan.amounts)) return plan;
    const rest = Object.fromEntries(Object.entries(plan.amounts).filter(([g]) => g !== key));
    return { ...plan, amounts: rest };
  }
  if (!Number.isSafeInteger(cents) || cents < 0) return plan;
  return { ...plan, amounts: { ...plan.amounts, [key]: cents } };
}

/**
 * A custom-amount guest pays: their share is pinned at what it was when they
 * paid, so a later edit to someone else's amount never moves it (a blank
 * guest's share would otherwise follow the others).
 */
export function recordCustomPayment(plan: BillPlan, guest: number, shareCents: number, cents: number): BillPlan {
  if (cents <= 0) return plan;
  const key = String(guest);
  const amounts = key in plan.amounts ? plan.amounts : { ...plan.amounts, [key]: shareCents };
  return recordPartPayment({ ...plan, amounts }, customPartKey(guest), cents);
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
