import React from "react";
import { router } from "expo-router";
import { IconButton } from "../IconButton";
import { NOTIFICATIONS_ROUTE } from "../../lib/merchant-notifications/push-route";
import { useMerchantNotifications } from "../../lib/merchant-notifications/use-merchant-notifications";

/**
 * The header bell: opens the notifications list, with an unread count.
 * Renders nothing for accounts that may not read notifications (cashiers
 * without Stock access, the demo, a superadmin borrowing a store), so callers
 * can drop it into any header unconditionally.
 */
export function NotificationBell() {
  const { isVisible, unread } = useMerchantNotifications();
  if (!isVisible) return null;

  const label = unread > 0 ? `Notifications, ${unread} unread` : "Notifications";
  return (
    <IconButton
      icon="bell"
      label={label}
      badge={unread}
      testID="notification-bell"
      onPress={() => router.push(NOTIFICATIONS_ROUTE)}
    />
  );
}
