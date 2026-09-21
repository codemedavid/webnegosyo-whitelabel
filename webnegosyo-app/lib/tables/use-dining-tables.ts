/**
 * The floor, on the shared cache.
 *
 * Tables change rarely (a minute of staleness is fine); who is seated changes
 * every few minutes and from other devices, so seatings are re-read on focus
 * and on a short interval while the floor is in view. Orders — the other half
 * of a table's state — arrive through the realtime-backed order queue, so
 * they need nothing here. `table_seatings` is not on the realtime publication
 * this round; when it is, the interval goes.
 *
 * Keys carry the tenant id, so the tenant-switch teardown drops them.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useIsFocused } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/query-core";

import { useAuthStore } from "../../stores/auth-store";
import { resourceKey } from "../backends/query-keys";
import { invalidateResource, useResource } from "../query/use-resource";
import { useRefetchOnScreenFocus } from "../query/use-screen-focus";
import type { PositionMove } from "./floor-layout";
import type { DiningTable, TableSeating } from "./table-floor";
import type { TableDraftValue } from "./table-form";
import {
  archiveDiningTable,
  clearSeating,
  createDiningTable,
  DINING_TABLES_RESOURCE,
  fetchDiningTables,
  fetchOpenSeatings,
  fetchOutletSlug,
  saveTablePositions,
  seatParty,
  TABLE_SEATINGS_RESOURCE,
  updateDiningTable,
  updatePartySize,
} from "./tables-service";

const TABLES_STALE_MS = 60_000;
const SEATINGS_STALE_MS = 10_000;
/** How often the floor re-reads seatings while it is on screen. */
export const SEATINGS_POLL_MS = 20_000;

const NO_TABLES: DiningTable[] = [];
const NO_SEATINGS: TableSeating[] = [];

export interface DiningTablesResult {
  tables: DiningTable[];
  seatings: TableSeating[];
  /** True until both first responses, success or failure. */
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useDiningTables(): DiningTablesResult {
  const tenantId = useAuthStore((s) => s.tenantId);
  const isFocused = useIsFocused();

  const tablesFetcher = useCallback(() => fetchDiningTables(tenantId as string), [tenantId]);
  const seatingsFetcher = useCallback(() => fetchOpenSeatings(tenantId as string), [tenantId]);

  const tables = useResource<DiningTable[]>(
    tenantId ? resourceKey(DINING_TABLES_RESOURCE, tenantId) : null,
    tablesFetcher,
    // The floor plan itself is snapshotted so a dine-in sale can still pick a
    // table offline; open seatings are live state and deliberately are not.
    { staleTime: TABLES_STALE_MS, offlineSnapshot: true },
  );
  const seatings = useResource<TableSeating[]>(
    tenantId ? resourceKey(TABLE_SEATINGS_RESOURCE, tenantId) : null,
    seatingsFetcher,
    { staleTime: SEATINGS_STALE_MS },
  );

  useRefetchOnScreenFocus({
    enabled: tenantId !== null,
    staleMs: SEATINGS_STALE_MS,
    dataUpdatedAt: seatings.dataUpdatedAt,
    isFetching: seatings.isRefetching,
    refetch: seatings.refetch,
  });

  const { refetch: refetchSeatings } = seatings;
  useEffect(() => {
    if (!tenantId || !isFocused) return;
    const timer = setInterval(() => {
      void refetchSeatings();
    }, SEATINGS_POLL_MS);
    return () => clearInterval(timer);
  }, [tenantId, isFocused, refetchSeatings]);

  const refetch = useCallback(async () => {
    await Promise.all([tables.refetch(), seatings.refetch()]);
  }, [tables.refetch, seatings.refetch]);

  return {
    tables: tables.data ?? NO_TABLES,
    seatings: seatings.data ?? NO_SEATINGS,
    isLoading: tables.isLoading || seatings.isLoading,
    error: tables.error ?? seatings.error,
    refetch,
  };
}

/** Re-read the floor after a write — a table added or moved, a party seated or cleared. */
export function invalidateTables(client: QueryClient, tenantId: string): Promise<void> {
  return Promise.all([
    invalidateResource(client, DINING_TABLES_RESOURCE, tenantId),
    invalidateResource(client, TABLE_SEATINGS_RESOURCE, tenantId),
  ]).then(() => undefined);
}

// ============================================
// Writes
// ============================================

export interface TableWrites {
  /** True while any write is in flight; the sheets show it on their button. */
  isSaving: boolean;
  seat: (tableId: string, partySize: number, note: string) => Promise<void>;
  setPartySize: (seatingId: string, partySize: number) => Promise<void>;
  clear: (seatingId: string) => Promise<void>;
  create: (input: { outletId: string | null; value: TableDraftValue; posX: number; posY: number; sortOrder: number }) => Promise<void>;
  update: (tableId: string, value: TableDraftValue) => Promise<void>;
  archive: (tableId: string) => Promise<void>;
  savePositions: (moves: readonly PositionMove[]) => Promise<void>;
}

/**
 * Every write the floor makes, each followed by a re-read of the floor so
 * the node changes on this device the moment the row lands. Errors are
 * thrown to the caller, worded by the service, for the screen to show.
 */
export function useTableWrites(): TableWrites {
  const tenantId = useAuthStore((s) => s.tenantId);
  const userId = useAuthStore((s) => s.userId);
  const client = useQueryClient();
  const [inFlight, setInFlight] = useState(0);

  const run = useCallback(
    async (write: (tenant: string) => Promise<unknown>) => {
      if (!tenantId) throw new Error("Sign in to change the floor.");
      setInFlight((count) => count + 1);
      try {
        await write(tenantId);
        await invalidateTables(client, tenantId);
      } finally {
        setInFlight((count) => count - 1);
      }
    },
    [client, tenantId],
  );

  // Memoised so the object keeps one identity between writes. A fresh object
  // every render is a trap for any caller that puts it in a dependency array:
  // an effect keyed on it re-runs constantly. `isSaving` still moves the
  // identity when a write starts or ends, which is what the buttons need.
  return useMemo(
    () => ({
      isSaving: inFlight > 0,
      seat: (tableId: string, partySize: number, note: string) =>
        run((tenant) => seatParty({ tenantId: tenant, tableId, partySize, note: note || null, userId })),
      setPartySize: (seatingId: string, partySize: number) =>
        run((tenant) => updatePartySize(tenant, seatingId, partySize)),
      clear: (seatingId: string) => run((tenant) => clearSeating(tenant, seatingId, userId)),
      create: (input: Parameters<TableWrites["create"]>[0]) =>
        run((tenant) => createDiningTable({ tenantId: tenant, ...input })),
      update: (tableId: string, value: TableDraftValue) =>
        run((tenant) => updateDiningTable(tenant, tableId, value)),
      archive: (tableId: string) => run((tenant) => archiveDiningTable(tenant, tableId)),
      savePositions: (moves: readonly PositionMove[]) =>
        moves.length === 0 ? Promise.resolve() : run((tenant) => saveTablePositions(tenant, moves)),
    }),
    [inFlight, run, userId],
  );
}

const OUTLET_SLUG_RESOURCE = "outlet-slug";
const OUTLET_SLUG_STALE_MS = 5 * 60_000;

/** The branch's URL slug for a table's QR; null for an unbranched table. */
export function useOutletSlug(outletId: string | null): string | null {
  const tenantId = useAuthStore((s) => s.tenantId);
  const fetcher = useCallback(
    () => fetchOutletSlug(tenantId as string, outletId as string),
    [tenantId, outletId],
  );
  const resource = useResource<string | null>(
    tenantId && outletId ? resourceKey(OUTLET_SLUG_RESOURCE, tenantId, outletId) : null,
    fetcher,
    { staleTime: OUTLET_SLUG_STALE_MS },
  );
  return resource.data ?? null;
}
