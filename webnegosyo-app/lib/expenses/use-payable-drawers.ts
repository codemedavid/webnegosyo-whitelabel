/**
 * The open drawers "+ Expense" may take from (`drawer-sources.ts`). Mounted
 * only while the sheet is open, so the Expenses screen reads no drawers until
 * someone adds an expense — and then always a fresh list (staleTime 0): a
 * shift closed on another tablet must not be offered.
 *
 * Which drawers: the chosen branch's (a branch account's own), or every open
 * drawer the account can see when no branch is chosen. RLS bounds the read.
 *
 * The balance stays unknown here: it needs the register's sales. The Drawer
 * screen's own "Pay expense" knows it and checks it.
 */

import { useCallback, useMemo } from "react";

import { useAuthStore } from "../../stores/auth-store";
import { resourceKey } from "../backends/query-keys";
import { canManageCash } from "../cash-drawers";
import { useResource } from "../query/use-resource";
import { listOpenShifts, loadOpenShift, type ShiftRecord } from "../shift-service";
import { payableDrawers, type DrawerSource } from "./drawer-sources";
import { useExpenseOutlet, useExpenseTenant } from "./use-expenses";

export const PAYABLE_DRAWERS_RESOURCE = "expense-payable-drawers";

interface OpenDrawers {
  openShifts: ShiftRecord[];
  myShift: ShiftRecord | null;
}

const NONE: readonly DrawerSource[] = [];

export function usePayableDrawers(): readonly DrawerSource[] {
  const tenantId = useExpenseTenant();
  const userId = useAuthStore((s) => s.userId);
  const role = useAuthStore((s) => s.role);
  const isOwner = useAuthStore((s) => s.isOwner);
  const permissions = useAuthStore((s) => s.permissions);
  const outletId = useExpenseOutlet();
  const managesCash = canManageCash({ role, isOwner, permissions });

  const fetcher = useCallback(async (): Promise<OpenDrawers> => {
    const [myShift, openShifts] = await Promise.all([
      loadOpenShift(tenantId as string, userId as string),
      // Only a cash manager may take from someone else's drawer: nobody else needs the list.
      managesCash ? listOpenShifts(tenantId as string, outletId ?? undefined) : Promise.resolve([]),
    ]);
    return { myShift, openShifts };
  }, [tenantId, userId, outletId, managesCash]);

  const read = useResource<OpenDrawers>(
    tenantId && userId ? resourceKey(PAYABLE_DRAWERS_RESOURCE, tenantId, userId, outletId, managesCash) : null,
    fetcher,
    { staleTime: 0 },
  );

  return useMemo(
    () => (read.data ? payableDrawers({ ...read.data, canManageCash: managesCash }) : NONE),
    [read.data, managesCash],
  );
}
