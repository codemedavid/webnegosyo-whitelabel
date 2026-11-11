// The bell's data: one cached read per account, shared by every bell and the
// list screen. App foregrounding refetches through the query client's
// AppState binding; a stock push arriving while the app is open refetches via
// `useStockAlertPushRefresh`.

import { useCallback, useEffect, useRef, useState } from "react";
import { useIsFocused } from "@react-navigation/native";
import * as Notifications from "expo-notifications";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../../stores/auth-store";
import { resourceKey } from "../backends/query-keys";
import { invalidateResource, useResource } from "../query/use-resource";
import { canOpenMerchantBell, nextSeenAt, unreadCount } from "./merchant-notifications";
import {
  loadMerchantNotificationInbox,
  markMerchantNotificationsSeen,
  type MerchantNotificationInbox,
} from "./service";

export const MERCHANT_NOTIFICATIONS_RESOURCE = "merchant-notifications";

/** Long enough that hopping between screens does not re-read; pushes refresh sooner. */
const INBOX_STALE_MS = 60_000;

export interface MerchantNotificationsState {
  isVisible: boolean;
  inbox: MerchantNotificationInbox | undefined;
  unread: number;
  isLoading: boolean;
  isRefetching: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useMerchantNotifications(): MerchantNotificationsState {
  const tenantId = useAuthStore((s) => s.tenantId);
  const userId = useAuthStore((s) => s.userId);
  const isVisible = useAuthStore((s) =>
    canOpenMerchantBell({
      isAuthenticated: s.isAuthenticated,
      isDemo: s.isDemo,
      isOwner: s.isOwner,
      isSuperadmin: s.isSuperadmin,
      impersonatedTenantId: s.impersonatedTenantId,
      permissions: s.permissions,
    })
  );

  const key = isVisible && tenantId && userId ? resourceKey(MERCHANT_NOTIFICATIONS_RESOURCE, tenantId, userId) : null;
  const fetcher = useCallback(
    () => loadMerchantNotificationInbox(tenantId ?? "", userId ?? ""),
    [tenantId, userId]
  );
  const result = useResource(key, fetcher, { staleTime: INBOX_STALE_MS });

  return {
    isVisible,
    inbox: result.data,
    unread: result.data ? unreadCount(result.data.items, result.data.seenAt) : 0,
    isLoading: result.isLoading,
    isRefetching: result.isRefetching,
    error: result.error,
    refetch: result.refetch,
  };
}

function isStockAlertPush(notification: Notifications.Notification): boolean {
  const data = notification.request.content.data as { type?: unknown } | undefined;
  return data?.type === "stock_alert";
}

/** Mount once: a stock push that lands while the app is open bumps the badge. */
export function useStockAlertPushRefresh(): void {
  const queryClient = useQueryClient();
  const tenantId = useAuthStore((s) => s.tenantId);
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((notification) => {
      if (!isStockAlertPush(notification)) return;
      void invalidateResource(queryClient, MERCHANT_NOTIFICATIONS_RESOURCE, tenantId);
    });
    return () => sub.remove();
  }, [queryClient, tenantId]);
}

/**
 * Marks the list seen once per visit, after the inbox has loaded, and
 * remembers the previous "seen" time so new rows stay marked while the screen
 * is open. Returns that time: `""` = never opened before, null = not yet known.
 */
export function useMarkSeenOnVisit(inbox: MerchantNotificationInbox | undefined): string | null {
  const queryClient = useQueryClient();
  const tenantId = useAuthStore((s) => s.tenantId);
  const userId = useAuthStore((s) => s.userId);
  const isFocused = useIsFocused();
  const hasMarkedThisVisit = useRef(false);
  const [highlightSince, setHighlightSince] = useState<string | null>(null);

  useEffect(() => {
    if (!isFocused) {
      hasMarkedThisVisit.current = false;
      return;
    }
    if (hasMarkedThisVisit.current || !inbox || !tenantId || !userId) return;
    hasMarkedThisVisit.current = true;
    setHighlightSince(inbox.seenAt ?? "");

    const seenAt = nextSeenAt(inbox.items, inbox.seenAt);
    if (seenAt === null) return;
    markMerchantNotificationsSeen(tenantId, userId, seenAt)
      .then(() => invalidateResource(queryClient, MERCHANT_NOTIFICATIONS_RESOURCE, tenantId))
      .catch((error: unknown) => {
        // The badge simply stays until the next visit; nothing to show the merchant.
        console.warn("[notifications] mark seen failed", error);
      });
  }, [isFocused, inbox, tenantId, userId, queryClient]);

  return highlightSince;
}
