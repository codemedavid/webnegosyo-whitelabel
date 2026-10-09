/**
 * Split plans for open bills, by bill key (the orders it covers).
 *
 * In memory only. The money a split collects is on the orders' ledgers; the
 * plan is just how the cashier chose to divide the table, kept while they walk
 * between the bill, the order and the floor. A relaunch starts from the
 * ledgers, and the cashier splits whatever is left.
 */

import { create } from "zustand";
import { EMPTY_PLAN, type BillPlan } from "../lib/bill/bill-plan";

interface BillStoreState {
  plans: Readonly<Record<string, BillPlan>>;
  update: (key: string, change: (plan: BillPlan) => BillPlan) => void;
  reset: (key: string) => void;
}

export const useBillStore = create<BillStoreState>((set) => ({
  plans: {},
  update: (key, change) =>
    set((state) => ({ plans: { ...state.plans, [key]: change(state.plans[key] ?? EMPTY_PLAN) } })),
  reset: (key) =>
    set((state) => ({
      plans: Object.fromEntries(Object.entries(state.plans).filter(([planKey]) => planKey !== key)),
    })),
}));

export function useBillPlan(key: string): BillPlan {
  return useBillStore((state) => state.plans[key] ?? EMPTY_PLAN);
}
