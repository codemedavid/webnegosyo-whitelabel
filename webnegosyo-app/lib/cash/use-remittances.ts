/**
 * Remittance reads on the shared cache, and the refresh a screen runs after a
 * transition. Keys carry the tenant; one refresh updates the inbox, the Home
 * strips and the Reports door together.
 */

import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { resourceKey } from "../backends/query-keys";
import { invalidateResource, useResource, type ResourceResult } from "../query/use-resource";
import { listOpenShifts, type ShiftRecord } from "../shift-service";
import { listRemittances, type Remittance } from "./remittances";
import { liveCashDb } from "./use-cash-rules";

export const REMITTANCES_RESOURCE = "cash-remittances";
const OPEN_SHIFTS_RESOURCE = "cash-open-shifts";
/** Accepted history the inbox keeps in view; open ones of any age always come. */
const HISTORY_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_MS = 15_000;

/** A fixed instant per mount (start of the UTC day), so the key does not change every render. */
function useSinceIso(): string {
  const [since] = useState(() => {
    const now = Date.now();
    return new Date(Math.floor((now - HISTORY_DAYS * DAY_MS) / DAY_MS) * DAY_MS).toISOString();
  });
  return since;
}

/** The inbox (cashierUserId undefined) or one cashier's own remittances. */
export function useRemittances(
  tenantId: string | null,
  isEnabled: boolean,
  cashierUserId?: string | null,
): ResourceResult<Remittance[]> {
  const sinceIso = useSinceIso();
  const mine = cashierUserId ?? undefined;
  const fetcher = useCallback(
    () => listRemittances(liveCashDb, tenantId as string, { sinceIso, cashierUserId: mine }),
    [tenantId, sinceIso, mine],
  );
  return useResource(
    isEnabled && tenantId && cashierUserId !== null ? resourceKey(REMITTANCES_RESOURCE, tenantId, sinceIso, mine ?? "all") : null,
    fetcher,
    { staleTime: STALE_MS },
  );
}

/** Every open shift the caller may read, for the forgotten-shift line. */
export function useOpenShifts(tenantId: string | null, isEnabled: boolean): ResourceResult<ShiftRecord[]> {
  const fetcher = useCallback(() => listOpenShifts(tenantId as string, undefined), [tenantId]);
  return useResource(isEnabled && tenantId ? resourceKey(OPEN_SHIFTS_RESOURCE, tenantId) : null, fetcher, { staleTime: STALE_MS });
}

/** After accept / dispute / resolve / force close: the inbox and both strips. */
export function useRemittanceRefresh(tenantId: string | null): () => Promise<void> {
  const client = useQueryClient();
  return useMemo(
    () => async () => {
      if (!tenantId) return;
      await Promise.all([
        invalidateResource(client, REMITTANCES_RESOURCE, tenantId),
        invalidateResource(client, OPEN_SHIFTS_RESOURCE, tenantId),
      ]);
    },
    [client, tenantId],
  );
}
