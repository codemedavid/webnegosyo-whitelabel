/**
 * "Take from a cashier's drawer": which open drawers a person may pay an
 * expense from, and the drawer mode the Add-expense sheet runs in for one.
 *
 * The database decides (`record_drawer_expense` keeps the drawer's own rule):
 * your own open shift, or — for a cash manager (`cash_manage`: owner, full
 * access or the key) — any open drawer of a branch you reach. This only mirrors that
 * rule so the sheet never offers a drawer the save would be refused from.
 */

import type { ShiftRecord } from "../shift-service";
import type { AddExpenseMode } from "./add-expense-form";

export type DrawerMode = Extract<AddExpenseMode, { kind: "drawer" }>;

/** One open drawer the sheet may take from. */
export interface DrawerSource {
  shiftId: string;
  /** The till's name at clock-in; null = a personal drawer (no tills set up). */
  drawerName: string | null;
  staffName: string;
  isMine: boolean;
  /** What it should hold now, in centavos; null = not known on this screen (never blocks). */
  availableCents: number | null;
}

export interface PayableDrawersInput {
  /** Every open shift this phone reads (its branch), mine included. */
  openShifts: readonly ShiftRecord[];
  myShift: ShiftRecord | null;
  canManageCash: boolean;
}

function toSource(shift: ShiftRecord, isMine: boolean): DrawerSource {
  return {
    shiftId: shift.id,
    drawerName: shift.drawerName?.trim() || null,
    staffName: shift.staffName.trim() || "Staff",
    isMine,
    availableCents: null,
  };
}

/** Mine first, then the others; only open shifts; others only for a cash manager. */
export function payableDrawers({ openShifts, myShift, canManageCash }: PayableDrawersInput): DrawerSource[] {
  const mine = myShift && myShift.status === "open" ? [toSource(myShift, true)] : [];
  if (!canManageCash) return mine;
  const others = openShifts
    .filter((shift) => shift.status === "open" && shift.id !== myShift?.id)
    .map((shift) => toSource(shift, false))
    .sort(byTillThenHolder);
  return [...mine, ...others];
}

/** Tills by name ("Cashier 1" before "Cashier 2"), then personal drawers by who holds them. */
function byTillThenHolder(a: DrawerSource, b: DrawerSource): number {
  if (a.drawerName && b.drawerName) {
    return a.drawerName.localeCompare(b.drawerName, undefined, { numeric: true }) || a.staffName.localeCompare(b.staffName);
  }
  if (a.drawerName || b.drawerName) return a.drawerName ? -1 : 1;
  return a.staffName.localeCompare(b.staffName);
}

/** "Cashier 1 · Ana", "Your drawer", "Ana's drawer" (a personal drawer). */
export function drawerSourceLabel(source: DrawerSource): string {
  if (source.isMine) return source.drawerName ? `${source.drawerName} · You` : "Your drawer";
  return source.drawerName ? `${source.drawerName} · ${source.staffName}` : `${source.staffName}'s drawer`;
}

/** The sheet's drawer mode for one source: the chip reads "Cashier 1 drawer · Ana's shift". */
export function drawerModeFor(source: DrawerSource): DrawerMode {
  if (source.isMine) {
    return { kind: "drawer", shiftId: source.shiftId, drawerName: source.drawerName ?? "My", availableCents: source.availableCents };
  }
  return {
    kind: "drawer",
    shiftId: source.shiftId,
    drawerName: source.drawerName ?? `${source.staffName}'s`,
    availableCents: source.availableCents,
    shiftLabel: source.drawerName ? `${source.staffName}'s shift` : null,
  };
}

/** The drawer screen's floor row → a source with what it should hold, less what this phone still owes it. */
export function floorDrawerSource(
  shift: ShiftRecord,
  input: { isMine: boolean; expectedInDrawer: number | null; pendingCents: number },
): DrawerSource {
  const availableCents = input.expectedInDrawer === null ? null : Math.round(input.expectedInDrawer * 100) - input.pendingCents;
  return { ...toSource(shift, input.isMine), availableCents };
}
