# Merchant notifications (the app's bell): rules for this folder

<!-- Moved verbatim from the root CLAUDE.md on 2026-11-11. The root file's rules for every change
     (Platform Supabase First, verification, conventions) still apply here. -->

## Merchant notifications (the app's bell)

Header bell (Home + Manage, `components/notifications/NotificationBell.tsx`) with an unread count, list at `(main)/notifications`. First kind: low / out of stock.

- **Source**: `stock_alerts` (raised by `stock-alerts-service.ts`, gated by `low_stock_alerts_enabled`) → statement triggers write `merchant_notifications` (snapshot of item/unit/branch/qty; a new alert = `stock_low`/`stock_out`, an open low alert updated to `out` = escalation `stock_out`) → statement trigger pg_net-POSTs the ids to `/api/push/notify-merchant` → claims `push_claimed_at` once → Expo push on Android channel `stock-alerts` (never the order ringtone). One stock_alerts statement = one push call per device.
- **Who**: `app_user_may_read_merchant_notifications` = owner, full-access admins, staff with `menu` (who can open Stock), branch accounts only their branch (NULL outlet = everyone). The push recipient rule (`merchant-notification-push.ts`) and the app's `canSeeMerchantNotifications` mirror it — change all three together. Text is worded in BOTH `merchant-notification-push.ts` and the app's `merchant-notifications.ts`; `tests/unit/merchant-notification-parity.test.ts` fails when the wording or the store-wide visibility rule drifts.
- **Unread** = not resolved, newer than `merchant_notification_seen.seen_at`, counted once per ingredient shelf (low + its escalation = 1). Opening the list stores the newest notice's SERVER `created_at` as `seen_at` (`nextSeenAt`), never the phone clock. The push route gives its claim back when nothing was sent (no automatic retry — pg_net fires once). Service-role writes only on `merchant_notifications`.
- **Push taps**: `routeFromPushData` (`lib/merchant-notifications/push-route.ts`) is the app's one router — announcements, then stock alerts (single item → ingredient page, batch → list). A new kind needs: the `kind` check constraint, a trigger/writer, wording on both sides, a route.
