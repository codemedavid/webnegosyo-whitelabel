/**
 * Everything the Drawer screen knows about the store's cash right now: the
 * tills of this register's branch, who holds each, my own open shift, and
 * the cash moves on every open drawer.
 *
 * Re-read on focus — shifts are opened, collected from and closed on other
 * tablets, and coming back to the Drawer is exactly when this is stale.
 */

import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";

import { useAuthStore } from "../stores/auth-store";
import { useBranchContextStore } from "../stores/branch-context-store";
import { resolveRegisterOutlet } from "./register-outlet";
import { listCashMoves, listDrawers } from "./cash-drawer-service";
import { listOpenShifts, loadOpenShift, type ShiftRecord } from "./shift-service";
import type { CashDrawer, CashMove } from "./cash-drawers";

export interface CashFloor {
  isLoaded: boolean;
  /** Why the tills or open drawers could not be read; my own shift may still show. */
  error: string | null;
  /** The register's branch; null = the unbranched store. */
  outletId: string | null;
  /** A multi-branch store with no branch chosen: no till can be picked yet. */
  needsBranch: boolean;
  drawers: CashDrawer[];
  /** Every open shift in this branch, mine included. */
  openShifts: ShiftRecord[];
  myShift: ShiftRecord | null;
  /** Moves on every open shift above. Null while unread or unreadable. */
  moves: CashMove[] | null;
  reload: () => Promise<void>;
}

const EMPTY: Omit<CashFloor, "reload"> = {
  isLoaded: false,
  error: null,
  outletId: null,
  needsBranch: false,
  drawers: [],
  openShifts: [],
  myShift: null,
  moves: null,
};

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Check your connection and pull to refresh.";
}

export function useCashFloor(): CashFloor {
  const tenantId = useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
  const userId = useAuthStore((s) => s.userId);
  const selectedOutletId = useBranchContextStore((s) => s.selectedOutletId);
  const selectedOutletName = useBranchContextStore((s) => s.selectedOutletName);
  const knownOutletIds = useBranchContextStore((s) => s.knownOutletIds);
  const [state, setState] = useState(EMPTY);

  const reload = useCallback(async () => {
    if (!tenantId || !userId) {
      setState({ ...EMPTY, isLoaded: true });
      return;
    }
    // Switching branch on the context bar changes which tills this register sees.
    const selection = { selectedOutletId, selectedOutletName, knownOutletIds };
    const outlet = resolveRegisterOutlet(useAuthStore.getState(), selection);
    const outletId = outlet?.id ?? null;
    const needsBranch = (selection.knownOutletIds?.length ?? 0) > 0 && !outlet;

    // My shift is read on its own: a failure reading the tills must never hide
    // the drawer I am holding.
    const myShift = await loadOpenShift(tenantId, userId);
    if (needsBranch) {
      setState({ ...EMPTY, isLoaded: true, needsBranch, myShift });
      return;
    }

    try {
      const [drawers, openShifts] = await Promise.all([
        listDrawers(tenantId, outletId),
        listOpenShifts(tenantId, outletId),
      ]);
      const shiftIds = [...new Set([...openShifts.map((s) => s.id), ...(myShift ? [myShift.id] : [])])];
      let moves: CashMove[] | null = null;
      let error: string | null = null;
      try {
        moves = await listCashMoves(tenantId, shiftIds);
      } catch (moveError) {
        error = message(moveError);
      }
      setState({ isLoaded: true, error, outletId, needsBranch, drawers, openShifts, myShift, moves });
    } catch (floorError) {
      console.warn("[cash-floor] tills unavailable", floorError);
      setState({ ...EMPTY, isLoaded: true, error: message(floorError), outletId, myShift });
    }
  }, [tenantId, userId, selectedOutletId, selectedOutletName, knownOutletIds]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return { ...state, reload };
}
