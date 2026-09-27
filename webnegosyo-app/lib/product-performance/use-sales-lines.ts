/**
 * The sold lines of a window, from whichever backend serves this store, plus
 * the live menu to name and price their options.
 *
 * Platform stores read `analytics:getItemSales` — one windowed, paged read.
 * Convex stores have no such function, so they join the window's orders to
 * their items on the phone, the way the Performance screen always has. Both
 * hooks are always called; the route decides which one is skipped.
 */

import { useCallback, useMemo } from "react";
import type { FunctionReference } from "convex/server";

import { useRefRoute, useSafeQuery } from "../hooks";
import { filterOrdersToScope } from "../branch-scope";
import { useBranchScope } from "../use-branch-scope";
import { useCanBoundReports } from "../use-report-window";
import { LEGACY_ORDER_PAGE, WINDOWED_ORDER_LIMIT, ordersInWindowArgs } from "../report-window";
import { normalizeModifierGroups, type ModifierSource } from "../modifier-groups";
import { useProducts } from "../query/use-products";
import { useAuthStore } from "../../stores/auth-store";
import { coverageStartMs, joinLegacyLines, type LegacyItem, type LegacyOrder } from "./legacy-lines";
import type { CatalogProduct, SalesLine } from "./types";

const itemSalesRef = "analytics:getItemSales" as unknown as FunctionReference<"query">;
const getOrdersRef = "orders:getOrders" as unknown as FunctionReference<"query">;
const getAllOrderItemsRef = "orders:getAllOrderItems" as unknown as FunctionReference<"query">;

/** Convex's `getAllOrderItems` returns at most this many lines. */
const CONVEX_ITEM_CAP = 10000;

export interface SalesLinesRequest {
  startMs: number;
  endMs: number;
  menuItemId?: string;
}

export interface SalesLinesResult {
  lines: SalesLine[];
  /** True until the first answer lands. */
  isLoading: boolean;
  error: string | null;
  /** From when the lines are complete; later than `startMs` if a read hit its cap. */
  coveredFromMs: number;
  isMissingFunction: boolean;
  refetch: () => Promise<void>;
}

interface ItemSalesPayload {
  lines: SalesLine[];
  isTruncated: boolean;
}

export function useSalesLines(request: SalesLinesRequest | null): SalesLinesResult {
  const route = useRefRoute(String(itemSalesRef));
  const isPlatform = route === "platform";
  const canBound = useCanBoundReports();
  const scope = useBranchScope();

  const platformArgs =
    request && isPlatform
      ? {
          startMs: request.startMs,
          endMs: request.endMs,
          ...(request.menuItemId ? { menuItemId: request.menuItemId } : {}),
        }
      : "skip";
  const platform = useSafeQuery<ItemSalesPayload>(itemSalesRef, platformArgs);

  const legacyOrderArgs =
    request && route === "convex"
      ? ordersInWindowArgs({ startMs: request.startMs, endMs: request.endMs }, canBound)
      : "skip";
  const orders = useSafeQuery<LegacyOrder[]>(getOrdersRef, legacyOrderArgs);
  const scopedOrders = useMemo(
    () => (orders.data ? ([...filterOrdersToScope(scope, orders.data)] as LegacyOrder[]) : undefined),
    [scope, orders.data]
  );
  const items = useSafeQuery<LegacyItem[]>(
    getAllOrderItemsRef,
    scopedOrders && route === "convex" ? { orderIds: scopedOrders.map((order) => order._id) } : "skip"
  );

  const legacyLines = useMemo(
    () =>
      request && route === "convex"
        ? joinLegacyLines(scopedOrders, items.data, {
            window: { startMs: request.startMs, endMs: request.endMs },
            menuItemId: request.menuItemId,
          })
        : [],
    [request, route, scopedOrders, items.data]
  );

  const { refetch: refetchPlatform } = platform;
  const { refetch: refetchOrders } = orders;
  const { refetch: refetchItems } = items;
  const refetch = useCallback(async () => {
    await Promise.all([refetchPlatform(), refetchOrders(), refetchItems()]);
  }, [refetchPlatform, refetchOrders, refetchItems]);

  const requestedStart = request?.startMs ?? 0;

  if (isPlatform) {
    const lines = platform.data?.lines ?? [];
    return {
      lines,
      isLoading: request !== null && platform.data === undefined && !platform.error,
      error: platform.error,
      coveredFromMs: coverageStartMs(lines, platform.data?.isTruncated ?? false, requestedStart),
      isMissingFunction: platform.isMissingFunction,
      refetch,
    };
  }

  const orderLimit = canBound ? WINDOWED_ORDER_LIMIT : LEGACY_ORDER_PAGE;
  const isTruncated =
    (orders.data?.length ?? 0) >= orderLimit || (items.data?.length ?? 0) >= CONVEX_ITEM_CAP;
  const oldestOrderMs = (orders.data ?? []).reduce(
    (oldest, order) => Math.min(oldest, order.saleOccurredAt ?? order._creationTime),
    Number.POSITIVE_INFINITY
  );

  return {
    lines: legacyLines,
    isLoading: request !== null && (orders.data === undefined || items.data === undefined) && !orders.error && !items.error,
    error: orders.error ?? items.error,
    coveredFromMs: isTruncated && Number.isFinite(oldestOrderMs) ? Math.max(requestedStart, oldestOrderMs) : requestedStart,
    isMissingFunction: orders.isMissingFunction || items.isMissingFunction,
    refetch,
  };
}

/** The live menu as the performance arithmetic reads it, keyed by product id. */
export function usePerformanceCatalog(): ReadonlyMap<string, CatalogProduct> {
  const tenantId = useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
  const products = useProducts(tenantId);

  return useMemo(
    () =>
      new Map(
        (products.data ?? []).map((product) => [
          product.id,
          {
            id: product.id,
            name: product.name,
            imageUrl: product.image_url || null,
            // `listProducts` selects every column; the modifier ones are just
            // not on the `Product` type.
            groups: normalizeModifierGroups(product as unknown as ModifierSource),
          },
        ])
      ),
    [products.data]
  );
}
