/**
 * What the register does when a sale asks for more than the stock count
 * covers — the decision behind `StockShortSheet`, kept pure so every branch
 * is tested (`pos-stock-decision.test.ts`).
 *
 * Two store policies (`tenants.pos_stock_policy`, sent by the ceilings route
 * as `stockPolicy`):
 *
 *   warn  (default) the cashier is told and may "Sell anyway" — see
 *         `pos-stock-warning.ts` for why the register never refuses on an
 *         estimate by default.
 *   block "Sell anyway" needs someone who may sell past the count. There is
 *         no generic manager-PIN approval on the platform (the Senior/PWD
 *         approval is bound to its claimants and the sales book), so a
 *         manager signs in on the register instead: an account holding
 *         `inventory` (or the owner) sells anyway directly.
 *
 * Whatever the policy, "Sell N" (what the count covers) is always allowed,
 * and the register NEVER blocks while offline: the count it holds may be
 * hours old, and a failed read already means "no opinion" upstream.
 */

import type { PosCartLine } from "./pos-cart";
import type { StockShortfall } from "./pos-stock-warning";
import { hasPermission, type StaffPermissionHolder } from "./staff-permissions";

export type PosStockPolicy = "warn" | "block";

export const DEFAULT_POS_STOCK_POLICY: PosStockPolicy = "warn";

/** Only the exact word `block` blocks; anything else (an older server sends nothing) warns. */
export function parsePosStockPolicy(raw: unknown): PosStockPolicy {
  return raw === "block" ? "block" : DEFAULT_POS_STOCK_POLICY;
}

/** Whether this account may sell past the count on a `block` store. */
export function canSellPastStock(user: StaffPermissionHolder): boolean {
  return hasPermission(user, "inventory");
}

export interface StockDecisionContext {
  policy: PosStockPolicy;
  isOnline: boolean;
  /** `canSellPastStock` for the signed-in account. */
  canSellShort: boolean;
}

export type SellAnywayMode = "proceed" | "needs_manager";

export interface StockQuestion {
  title: string;
  body: string;
  /** One line per short dish, for the sheet's list. */
  lines: string[];
  /** "Sell 5" / "Sell what's in stock"; null when the count covers none of it. */
  sellWithin: { label: string; units: number | null } | null;
  sellAnyway: { mode: SellAnywayMode; label: string };
  /** Shown under a "Sell anyway" that needs a manager. */
  managerNote: string | null;
  /** Shown while offline, when the count may be out of date. */
  offlineNote: string | null;
}

export type StockDecision = { kind: "proceed" } | { kind: "ask"; question: StockQuestion };

export const MANAGER_NOTE =
  "This store needs a manager to sell more than the stock count. Ask a manager to sign in on this register, or record a stock count.";
export const OFFLINE_NOTE = "You're offline, so the stock count may be out of date.";

const SELL_ANYWAY_LABEL = "Sell anyway";
const SELL_WHAT_IS_IN_STOCK = "Sell what's in stock";

const shelf = (shortfall: StockShortfall): number => Math.max(0, shortfall.producible);

const labelOf = (shortfall: StockShortfall): string =>
  shortfall.optionName ? `${shortfall.dishName} (${shortfall.optionName})` : shortfall.dishName;

const titleFor = (shortfall: StockShortfall): string =>
  shelf(shortfall) === 0 ? "None left" : `Only ${shelf(shortfall)} left`;

const isShort = (shortfall: StockShortfall): boolean => shortfall.wanted > shelf(shortfall);

function policyParts(context: StockDecisionContext): Pick<StockQuestion, "sellAnyway" | "managerNote" | "offlineNote"> {
  const needsManager = context.policy === "block" && context.isOnline && !context.canSellShort;
  return {
    sellAnyway: { mode: needsManager ? "needs_manager" : "proceed", label: SELL_ANYWAY_LABEL },
    managerNote: needsManager ? MANAGER_NOTE : null,
    offlineNote: context.isOnline ? null : OFFLINE_NOTE,
  };
}

function chargeLine(shortfall: StockShortfall): string {
  return `${labelOf(shortfall)}: ${shortfall.wanted} in this sale, stock covers ${shelf(shortfall)}`;
}

export interface AddStockInput {
  /** The shortfall of the dish being added (with the sale already held), or null. */
  shortfall: StockShortfall | null;
  /** Units of the configuration being added. */
  addedQuantity: number;
}

/** The question when one configuration joins the sale. */
export function decideAddStock(input: AddStockInput, context: StockDecisionContext): StockDecision {
  const { shortfall, addedQuantity } = input;
  if (!shortfall || !isShort(shortfall) || addedQuantity <= 0) return { kind: "proceed" };

  const already = Math.max(0, shortfall.wanted - addedQuantity);
  const units = Math.min(addedQuantity, Math.max(0, shelf(shortfall) - already));
  const held = already > 0 ? ` (${already} already in this sale)` : "";

  return {
    kind: "ask",
    question: {
      title: titleFor(shortfall),
      body: `You're adding ${addedQuantity} × ${labelOf(shortfall)}${held}. Stock covers ${shelf(shortfall)}.`,
      lines: [chargeLine(shortfall)],
      sellWithin: units > 0 ? { label: `Sell ${units}`, units } : null,
      ...policyParts(context),
    },
  };
}

export interface ChargeStockInput {
  shortfalls: readonly StockShortfall[];
  /** False when the cart cannot be cut down safely (a revised placed order). */
  canClamp: boolean;
}

/** The question at Charge, over the whole sale. */
export function decideChargeStock(input: ChargeStockInput, context: StockDecisionContext): StockDecision {
  const shortfalls = input.shortfalls.filter(isShort);
  if (shortfalls.length === 0) return { kind: "proceed" };

  const canSellSome = input.canClamp && shortfalls.some((shortfall) => shelf(shortfall) > 0);
  const lines = shortfalls.map(chargeLine);

  if (shortfalls.length === 1) {
    const [only] = shortfalls;
    return {
      kind: "ask",
      question: {
        title: titleFor(only),
        body: `This sale has ${only.wanted} × ${labelOf(only)}. Stock covers ${shelf(only)}.`,
        lines,
        sellWithin: canSellSome ? { label: `Sell ${shelf(only)}`, units: shelf(only) } : null,
        ...policyParts(context),
      },
    };
  }

  return {
    kind: "ask",
    question: {
      title: `Not enough stock for ${shortfalls.length} items`,
      body: "Stock covers less than this sale asks for:",
      lines,
      sellWithin: canSellSome ? { label: SELL_WHAT_IS_IN_STOCK, units: null } : null,
      ...policyParts(context),
    },
  };
}

export interface LineQuantityChange {
  key: string;
  /** 0 = remove the line. */
  quantity: number;
}

const matches = (line: PosCartLine, shortfall: StockShortfall): boolean =>
  line.menuItemId === shortfall.menuItemId &&
  (shortfall.optionId === null || line.selections.some((s) => s.optionId === shortfall.optionId));

/**
 * The quantity changes that bring the cart within the count: for each
 * shortfall, the lines that draw on that shelf are cut newest first (the
 * cashier's last tap is the likeliest extra), and a line cut to 0 goes.
 * Recomputed from the running quantities, so two shortfalls on one line
 * stack instead of double-counting.
 */
export function clampLinesToStock(
  lines: readonly PosCartLine[],
  shortfalls: readonly StockShortfall[],
): LineQuantityChange[] {
  const quantities = shortfalls.reduce<ReadonlyMap<string, number>>((current, shortfall) => {
    const drawing = lines.filter((line) => matches(line, shortfall));
    const held = drawing.reduce((sum, line) => sum + (current.get(line.key) ?? 0), 0);
    let excess = held - shelf(shortfall);
    if (excess <= 0) return current;

    const next = new Map(current);
    for (const line of [...drawing].reverse()) {
      if (excess <= 0) break;
      const quantity = next.get(line.key) ?? 0;
      const cut = Math.min(quantity, excess);
      next.set(line.key, quantity - cut);
      excess -= cut;
    }
    return next;
  }, new Map(lines.map((line) => [line.key, Number(line.quantity)])));

  const changed = new Map<string, number>();
  for (const shortfall of shortfalls) {
    for (const line of [...lines].reverse()) {
      const quantity = quantities.get(line.key) ?? 0;
      if (matches(line, shortfall) && quantity !== Number(line.quantity)) changed.set(line.key, quantity);
    }
  }
  return [...changed].map(([key, quantity]) => ({ key, quantity }));
}
