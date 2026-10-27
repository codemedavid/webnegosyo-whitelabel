/**
 * The reads behind the Shift sales screen.
 *
 * - `useShiftDetail`: the shift row (header, window, blind flag) — platform
 *   Supabase for every store, since `staff_shifts` lives there.
 * - `useServerShiftSales`: the report function, platform stores only, on the
 *   shared cache. A failed refresh THROWS so TanStack keeps the last figures
 *   on screen (with a notice) instead of swapping them for an error.
 * - `useDeviceShiftOrders`: the orders the tablet counts from when the server
 *   cannot answer, or for the "My drawer" lens. Off the platform it asks the
 *   Drawer's exact read (`limit: 200`, same snapshot) so the backend shares
 *   one subscription; on the platform a bounded window.
 *
 * Every key carries the tenant (the tenant-switch teardown finds them).
 */

import { useCallback } from "react";
import type { FunctionReference } from "convex/server";

import { useAuthStore } from "../../stores/auth-store";
import { resourceKey } from "../backends/query-keys";
import { useSafeQuery } from "../hooks";
import { useOfflineOrderList } from "../offline/use-offline-orders";
import { useResource } from "../query/use-resource";
import { useRefetchOnScreenFocus } from "../query/use-screen-focus";
import { fetchShiftById, type ShiftDetail } from "../shift-service";
import { DEVICE_PAGE_LIMIT, DEVICE_WINDOW_LIMIT, deviceOrdersCover, type DeviceSalesOrder } from "./shift-sales-fallback";
import { fetchPeriodSales, fetchShiftSales, type ShiftSalesFetch } from "./shift-sales";
import type { ServerSalesRead, ShiftSalesTarget } from "./shift-sales-state";

export const SHIFT_SALES_RESOURCE = "shift-sales";
const SHIFT_SALES_STALE_MS = 30_000;
/** The Drawer's snapshot of the same read, so an offline tablet still has its orders. */
const DRAWER_SNAPSHOT = "drawer:getOrders";

const getOrdersRef = "orders:getOrders" as unknown as FunctionReference<"query">;

function useTenantId(): string | null {
  return useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
}

export function useShiftDetail(shiftId: string | null) {
  const tenantId = useTenantId();
  const fetcher = useCallback(() => fetchShiftById(tenantId as string, shiftId as string), [tenantId, shiftId]);
  return useResource<ShiftDetail | null>(
    tenantId && shiftId ? resourceKey(SHIFT_SALES_RESOURCE, tenantId, "shift", shiftId) : null,
    fetcher,
    { staleTime: SHIFT_SALES_STALE_MS },
  );
}

/** A passing failure is thrown so the cache keeps the last good figures. */
function settle(result: ShiftSalesFetch): ShiftSalesFetch {
  if (!result.ok && result.kind === "failed") throw new Error(result.message);
  return result;
}

export interface ServerShiftSales {
  read: ServerSalesRead;
  /** Set when the figures shown are the last good ones and the refresh failed. */
  staleNotice: string | null;
  refetch: () => Promise<void>;
  isRefetching: boolean;
}

function targetParams(target: ShiftSalesTarget): unknown[] {
  return target.kind === "shift" ? ["report", target.shiftId] : ["period", target.fromMs, target.toMs, target.outletId ?? "all"];
}

export function useServerShiftSales(target: ShiftSalesTarget | null, isEnabled: boolean): ServerShiftSales {
  const tenantId = useTenantId();
  const targetKey = target ? JSON.stringify(targetParams(target)) : "";
  const fetcher = useCallback(async () => {
    if (!target) throw new Error("No shift chosen.");
    if (target.kind === "shift") return settle(await fetchShiftSales(target.shiftId));
    return settle(
      await fetchPeriodSales({
        tenantId: tenantId as string,
        from: new Date(target.fromMs).toISOString(),
        to: new Date(target.toMs).toISOString(),
        outletId: target.outletId,
      }),
    );
    // The target's identity changes every render; its params decide the read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, targetKey]);
  const isReading = isEnabled && tenantId !== null && target !== null;
  const result = useResource<ShiftSalesFetch>(
    isReading && target ? resourceKey(SHIFT_SALES_RESOURCE, tenantId, ...targetParams(target)) : null,
    fetcher,
    { staleTime: SHIFT_SALES_STALE_MS },
  );
  useRefetchOnScreenFocus({
    enabled: isReading,
    staleMs: SHIFT_SALES_STALE_MS,
    dataUpdatedAt: result.dataUpdatedAt,
    isFetching: result.isRefetching,
    refetch: result.refetch,
  });

  const read: ServerSalesRead = !isReading
    ? { status: "skipped" }
    : result.data
      ? { status: "done", fetch: result.data }
      : result.error
        ? { status: "error", message: result.error }
        : { status: "loading" };
  return {
    read,
    staleNotice: result.data && result.error ? "Couldn't refresh. These are the last figures read." : null,
    refetch: result.refetch,
    isRefetching: result.isRefetching,
  };
}

export interface DeviceShiftOrders {
  /** Undefined while loading. */
  orders: DeviceSalesOrder[] | undefined;
  /** False when the read stopped short of the window's start (see deviceOrdersCover). */
  isComplete: boolean;
  error: string | null;
  isOffline: boolean;
  savedAt: number | null;
  refetch: () => Promise<void>;
}

export function useDeviceShiftOrders(window: { fromMs: number; toMs: number } | null, isEnabled: boolean): DeviceShiftOrders {
  const orderBackend = useAuthStore((s) => s.orderBackend);
  const isWindowRead = orderBackend === "platform";
  const args =
    !isEnabled || !window
      ? "skip"
      : isWindowRead
        ? { startMs: window.fromMs, endMs: window.toMs, limit: DEVICE_WINDOW_LIMIT }
        : { limit: DEVICE_PAGE_LIMIT };
  const raw = useSafeQuery<DeviceSalesOrder[]>(getOrdersRef, args);
  const merged = useOfflineOrderList(raw, { snapshotName: isEnabled && !isWindowRead ? DRAWER_SNAPSHOT : null });
  const orders = isEnabled ? (merged.data as DeviceSalesOrder[] | undefined) : undefined;
  return {
    orders,
    isComplete: orders && window ? deviceOrdersCover({ orders, isWindowRead, fromMs: window.fromMs }) : true,
    error: isEnabled ? raw.error : null,
    isOffline: merged.isOffline,
    savedAt: merged.savedAt ?? null,
    refetch: merged.refetch,
  };
}
