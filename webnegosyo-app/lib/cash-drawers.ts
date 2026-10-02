/**
 * Cash drawers — the physical tills a shift holds.
 *
 * A store with one till never needs this: a shift without a drawer is the
 * cashier's personal drawer, exactly as before. A store with two ("Cashier 1",
 * "Cashier 2") names them so each count belongs to one box of money, and the
 * owner can mark one as ZERO BALANCE — it starts empty and every peso counted
 * at close is handed over, nothing is left behind as float.
 *
 * Pure and side-effect free. cash-drawer-service.ts owns the rows; the DB
 * (migration 20261001120000) enforces the same rules, so these only let the
 * screen say what is wrong before the write is refused.
 */

import { MAX_DRAWER_CASH } from "./shift";
import { hasPermission, type StaffPermissionHolder } from "./staff-permissions";

/** One till, as the screens consume it. */
export interface CashDrawer {
  id: string;
  outletId: string | null;
  name: string;
  /** The float this till normally starts a shift with. Always 0 on a zero-balance till. */
  startingCash: number;
  isZeroBalance: boolean;
  sortOrder: number;
}

/** Cash that entered or left a drawer without a sale. */
export type CashMoveKind = "collect" | "pay_in" | "pay_out";

export interface CashMove {
  id: string;
  shiftId: string;
  kind: CashMoveKind;
  amount: number;
  reason: string | null;
  recordedByName: string;
  createdAt: string;
}

export const DRAWER_NAME_MAX = 40;
export const CASH_MOVE_REASON_MAX = 200;

/** Suggested names, in the order a counter adds tills. */
export function suggestDrawerName(existing: readonly { name: string }[]): string {
  const taken = new Set(existing.map((d) => d.name.trim().toLowerCase()));
  for (let n = 1; n <= existing.length + 1; n += 1) {
    const candidate = `Cashier ${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `Cashier ${existing.length + 1}`;
}

/**
 * Who may set up tills, collect cash from anyone's drawer, and close a shift
 * on a cashier's behalf. Mirrors `app_user_manages_cash()` in SQL: the owner,
 * a full-access account, or staff granted `store_setup`.
 */
export function canManageCash(user: StaffPermissionHolder): boolean {
  return hasPermission(user, "store_setup");
}

export interface DrawerInput {
  name: string;
  startingCash: number;
  isZeroBalance: boolean;
}

export type DrawerInputVerdict =
  | { ok: true; value: DrawerInput }
  | { ok: false; field: "name" | "startingCash"; reason: string };

/**
 * Whether a till can be saved as typed. A zero-balance till's starting cash
 * is forced to 0 rather than refused — the switch, not the field, is the
 * owner's decision.
 */
export function validateDrawerInput(
  input: DrawerInput,
  siblings: readonly { id: string; name: string }[],
  selfId: string | null = null,
): DrawerInputVerdict {
  const name = input.name.trim();
  if (!name) return { ok: false, field: "name", reason: "Give the drawer a name, like Cashier 1." };
  if (name.length > DRAWER_NAME_MAX) {
    return { ok: false, field: "name", reason: `Keep the name under ${DRAWER_NAME_MAX} characters.` };
  }
  const clash = siblings.some((d) => d.id !== selfId && d.name.trim().toLowerCase() === name.toLowerCase());
  if (clash) return { ok: false, field: "name", reason: `There is already a drawer called ${name}.` };

  const startingCash = input.isZeroBalance ? 0 : input.startingCash;
  if (!Number.isFinite(startingCash) || startingCash < 0) {
    return { ok: false, field: "startingCash", reason: "Enter the starting cash as an amount, or 0." };
  }
  if (startingCash > MAX_DRAWER_CASH) {
    return { ok: false, field: "startingCash", reason: "That amount is too large for a drawer." };
  }
  return { ok: true, value: { name, startingCash, isZeroBalance: input.isZeroBalance } };
}

/** The open shift a drawer is held by — the subset the board needs. */
export interface DrawerHolder {
  shiftId: string;
  drawerId: string | null;
  staffUserId: string | null;
  staffName: string;
}

export type DrawerSlot =
  | { drawer: CashDrawer; state: "free" }
  | { drawer: CashDrawer; state: "mine"; shiftId: string }
  | { drawer: CashDrawer; state: "taken"; shiftId: string; heldBy: string };

/** Every till with who holds it right now, in the owner's order. */
export function drawerBoard(
  drawers: readonly CashDrawer[],
  openShifts: readonly DrawerHolder[],
  userId: string | null,
): DrawerSlot[] {
  return [...drawers]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((drawer): DrawerSlot => {
      const holder = openShifts.find((s) => s.drawerId === drawer.id);
      if (!holder) return { drawer, state: "free" };
      if (holder.staffUserId && holder.staffUserId === userId) {
        return { drawer, state: "mine", shiftId: holder.shiftId };
      }
      return { drawer, state: "taken", shiftId: holder.shiftId, heldBy: holder.staffName };
    });
}

/** The till a cashier lands on: the first free one, so clocking in is one tap. */
export function defaultDrawerChoice(board: readonly DrawerSlot[]): string | null {
  return board.find((slot) => slot.state === "free")?.drawer.id ?? null;
}

/** One short line describing a till's cash policy. */
export function describeDrawerPolicy(
  drawer: Pick<CashDrawer, "isZeroBalance" | "startingCash">,
  formatPeso: (n: number) => string,
): string {
  if (drawer.isZeroBalance) return "Zero balance · starts empty, hand over everything";
  if (drawer.startingCash > 0) return `Starts with ${formatPeso(drawer.startingCash)} float`;
  return "No standard float";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface CashMoveTotals {
  payIn: number;
  payOut: number;
  collected: number;
}

export const NO_CASH_MOVES: CashMoveTotals = { payIn: 0, payOut: 0, collected: 0 };

export function summarizeCashMoves(moves: readonly Pick<CashMove, "kind" | "amount">[]): CashMoveTotals {
  return moves.reduce<CashMoveTotals>(
    (totals, move) => ({
      payIn: round2(totals.payIn + (move.kind === "pay_in" ? move.amount : 0)),
      payOut: round2(totals.payOut + (move.kind === "pay_out" ? move.amount : 0)),
      collected: round2(totals.collected + (move.kind === "collect" ? move.amount : 0)),
    }),
    NO_CASH_MOVES,
  );
}

export const CASH_MOVE_COPY: Record<CashMoveKind, { label: string; verb: string; hint: string; sign: 1 | -1 }> = {
  collect: {
    label: "Cash pickup",
    verb: "Collect",
    hint: "Cash taken out to the owner or the safe",
    sign: -1,
  },
  pay_out: {
    label: "Pay out",
    verb: "Pay out",
    hint: "Cash spent from the drawer — ice, LPG, a rider",
    sign: -1,
  },
  pay_in: {
    label: "Pay in",
    verb: "Add cash",
    hint: "Cash added — more coins for change, a top-up",
    sign: 1,
  },
};

export interface CashMoveInput {
  kind: CashMoveKind;
  amount: number;
  reason: string;
}

export type CashMoveVerdict =
  | { ok: true; value: { kind: CashMoveKind; amount: number; reason: string | null } }
  | { ok: false; reason: string };

/**
 * Whether a cash movement can be recorded. Taking out more than the drawer
 * should hold is refused when the expectation is known: it would turn a
 * mistyped pickup into a phantom shortage at close.
 */
export function validateCashMove(input: CashMoveInput, expectedInDrawer: number | null): CashMoveVerdict {
  const amount = round2(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, reason: "Enter an amount above ₱0." };
  if (amount > MAX_DRAWER_CASH) return { ok: false, reason: "That amount is too large for a drawer." };

  const reason = input.reason.trim();
  if (reason.length > CASH_MOVE_REASON_MAX) {
    return { ok: false, reason: `Keep the note under ${CASH_MOVE_REASON_MAX} characters.` };
  }
  if (input.kind !== "collect" && !reason) {
    return { ok: false, reason: input.kind === "pay_out" ? "Say what the cash was spent on." : "Say why cash was added." };
  }
  const takesOut = CASH_MOVE_COPY[input.kind].sign < 0;
  if (takesOut && expectedInDrawer !== null && amount > round2(expectedInDrawer)) {
    return { ok: false, reason: "That is more than this drawer should be holding. Count it first." };
  }
  return { ok: true, value: { kind: input.kind, amount, reason: reason || null } };
}
