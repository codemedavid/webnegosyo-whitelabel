/**
 * React bindings for the register's offline download (`offline-pack-store.ts`).
 *
 * - `useOfflinePackAutoSync` (mounted once, in `OfflineSalesSync`) saves the
 *   register for offline use without anyone opening it: on the first chance
 *   of a session (so a login is enough), every time the connection comes back,
 *   and on a return to the app once the copy has aged.
 * - `useOfflinePack` is the register's status line and its "Save now" button.
 *
 * After a complete download the menu's thumbnails are put in the image cache
 * too, best effort, so an offline grid shows its photos. Nothing waits on them.
 */

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { AppState, Image, type AppStateStatus } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/query-core";
import { useAuthStore } from "../../stores/auth-store";
import { useBranchScope } from "../use-branch-scope";
import { hasLiveOrderBackend } from "../order-backend";
import { isTabAllowed } from "../staff-permissions";
import { posCatalogKey } from "../query/use-pos-catalog";
import { isOffline } from "./connectivity";
import { useConnectivity } from "./use-connectivity";
import { offlinePackKey, shouldRefreshOfflinePack, type OfflinePackTrigger } from "./offline-pack";
import {
  getOfflinePackState,
  lastOfflinePackAttempt,
  loadOfflinePackManifest,
  runOfflinePackDownload,
  subscribeOfflinePack,
  type OfflinePackState,
} from "./offline-pack-store";
import { registerPackThumbnails, type RegisterPackScope } from "./register-pack";

/** Photos fetched at once while warming the image cache. */
const THUMBNAIL_BATCH = 4;

const IDLE_STATE: OfflinePackState = {
  isLoaded: false,
  isDownloading: false,
  manifest: null,
  lastFailed: [],
};

/** Photos already warmed this launch, so a refresh does not fetch them again. */
const warmedThumbnails = new Set<string>();

async function warmThumbnails(urls: readonly string[]): Promise<void> {
  const pending = urls.filter((url) => !warmedThumbnails.has(url));
  for (let start = 0; start < pending.length; start += THUMBNAIL_BATCH) {
    const batch = pending.slice(start, start + THUMBNAIL_BATCH);
    const results = await Promise.all(batch.map((url) => Image.prefetch(url).catch(() => false)));
    batch.forEach((url, index) => {
      if (results[index]) warmedThumbnails.add(url);
    });
  }
}

async function downloadRegisterPack(client: QueryClient, scope: RegisterPackScope): Promise<void> {
  const result = await runOfflinePackDownload({ client, scope });
  if (!result.isComplete) return;
  const menu = client.getQueryData(posCatalogKey(scope.tenantId, scope.outletId));
  await warmThumbnails(registerPackThumbnails(menu));
}

/**
 * What the register would save for this session, or null when this account has
 * no register (no POS permission, or no order backend to sell into).
 * Scoped exactly as the register reads: its branch, and the impersonated store
 * for payment methods.
 */
export function useRegisterPackScope(): RegisterPackScope | null {
  const tenantId = useAuthStore((s) => s.tenantId);
  const paymentTenantId = useAuthStore((s) => s.impersonatedTenantId ?? s.tenantId);
  const role = useAuthStore((s) => s.role);
  const isOwner = useAuthStore((s) => s.isOwner);
  const permissions = useAuthStore((s) => s.permissions);
  const convexUrl = useAuthStore((s) => s.convexUrl);
  const orderBackend = useAuthStore((s) => s.orderBackend);
  const branchScope = useBranchScope();
  const outletId = branchScope.kind === "branch" ? branchScope.outletId : null;

  return useMemo(() => {
    if (!tenantId || !paymentTenantId) return null;
    if (!hasLiveOrderBackend({ convexUrl, orderBackend })) return null;
    if (!isTabAllowed({ role, isOwner, permissions }, "pos")) return null;
    return { tenantId, paymentTenantId, outletId };
  }, [tenantId, paymentTenantId, outletId, convexUrl, orderBackend, role, isOwner, permissions]);
}

export interface OfflinePackView extends OfflinePackState {
  /** Save (or refresh) the offline copy now. */
  download: () => void;
}

export function useOfflinePack(scope: RegisterPackScope | null): OfflinePackView {
  const client = useQueryClient();
  const packKey = scope ? offlinePackKey(scope.tenantId, scope.outletId) : null;
  const read = useCallback(() => (packKey ? getOfflinePackState(packKey) : IDLE_STATE), [packKey]);
  const state = useSyncExternalStore(subscribeOfflinePack, read, read);

  useEffect(() => {
    if (packKey) void loadOfflinePackManifest(packKey);
  }, [packKey]);

  const download = useCallback(() => {
    if (scope) void downloadRegisterPack(client, scope);
  }, [client, scope]);

  return { ...state, download };
}

export function useOfflinePackAutoSync(): void {
  const client = useQueryClient();
  const scope = useRegisterPackScope();
  const { status } = useConnectivity();
  const previousStatus = useRef(status);

  const trigger = useCallback(
    (reason: OfflinePackTrigger) => {
      if (!scope || isOffline()) return;
      const packKey = offlinePackKey(scope.tenantId, scope.outletId);
      const decision = { reason, lastAttemptAt: lastOfflinePackAttempt(packKey), now: Date.now() };
      if (!shouldRefreshOfflinePack(decision)) return;
      void downloadRegisterPack(client, scope);
    },
    [client, scope],
  );

  // A new session, sign-in or branch: save that register once.
  useEffect(() => {
    trigger("start");
  }, [trigger]);

  // Back online: the copy may have missed changes made while this till was away.
  useEffect(() => {
    const wasOffline = previousStatus.current === "offline";
    previousStatus.current = status;
    if (wasOffline && status === "online") trigger("reconnect");
  }, [status, trigger]);

  useEffect(() => {
    const onChange = (next: AppStateStatus) => {
      if (next === "active") trigger("foreground");
    };
    const subscription = AppState.addEventListener("change", onChange);
    return () => subscription.remove();
  }, [trigger]);
}
