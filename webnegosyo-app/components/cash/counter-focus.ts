import {
  PH_DENOMINATIONS,
  usesLooseCoins,
  type Denomination,
  type DenominationCounts,
  type DenominationKey,
} from "../../lib/cash/denominations";

/** Which row the keypad types into: a denomination, the loose-coins total, or none. */
export type CounterFocus = DenominationKey | "loose" | null;

export interface CounterRows {
  bills: readonly Denomination[];
  /** Empty when the coins were counted by total (and none by piece). */
  coins: readonly Denomination[];
  isCoinsByTotal: boolean;
  isLooseShown: boolean;
}

function hasPieceCoins(counts: DenominationCounts): boolean {
  return PH_DENOMINATIONS.some((d) => d.kind === "coin" && (counts[d.key] ?? 0) > 0);
}

/**
 * The rows on screen. 5¢/1¢ only after "More coins" (or when already counted);
 * coin rows fold into "Counted by total" once a loose total is typed — but
 * never while a coin row holds pieces, so no counted money is ever hidden.
 */
export function counterRows(counts: DenominationCounts, isMoreCoinsShown: boolean, isLooseRequested: boolean): CounterRows {
  const isCoinsByTotal = usesLooseCoins(counts) && !hasPieceCoins(counts);
  const coins = isCoinsByTotal
    ? []
    : PH_DENOMINATIONS.filter((d) => d.kind === "coin" && (!d.isMoreCoins || isMoreCoinsShown || (counts[d.key] ?? 0) > 0));
  return {
    bills: PH_DENOMINATIONS.filter((d) => d.kind === "bill"),
    coins,
    isCoinsByTotal,
    isLooseShown: isLooseRequested || usesLooseCoins(counts),
  };
}

/** Rows in the order Next walks them: bills, coins, then the loose total. */
export function focusOrder(rows: CounterRows): readonly Exclude<CounterFocus, null>[] {
  return [...rows.bills.map((d) => d.key), ...rows.coins.map((d) => d.key), ...(rows.isLooseShown ? (["loose"] as const) : [])];
}

/** The row after `focus`; null after the last one. */
export function nextFocus(rows: CounterRows, focus: CounterFocus): CounterFocus {
  const order = focusOrder(rows);
  if (focus === null) return order[0] ?? null;
  const at = order.indexOf(focus);
  return at < 0 || at + 1 >= order.length ? null : order[at + 1];
}

export function isLastFocus(rows: CounterRows, focus: CounterFocus): boolean {
  const order = focusOrder(rows);
  return focus !== null && order[order.length - 1] === focus;
}
