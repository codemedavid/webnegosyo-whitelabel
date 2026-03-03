# Real-Time Convex Order Management Design

## Goal

When customers order on the website and the tenant has Convex configured, orders go to Convex only. The mobile admin app receives real-time updates via Convex reactivity, plays notification sounds, shows in-app alerts, and sends Expo push notifications for backgrounded/killed app states.

## Data Flow

1. Customer checks out on website → `createOrderAction()` server action
2. Server action detects `convex_deployment_url` + `convex_deploy_key` → writes to Convex only (no Supabase)
3. Convex `createOrder` mutation inserts order + items
4. After insert, Convex internal action sends Expo push notification to registered admin devices
5. Mobile admin app: Convex `useQuery` auto-updates → app detects new order → sound + in-app alert

## Push Token Registration

- Mobile app requests Expo push permission at login
- Registers token in Convex `pushTokens` table: `tenantId`, `userId`, `token`, `platform`
- Token removed on logout
- `createOrder` mutation triggers internal action → queries `pushTokens` → calls Expo Push API

## In-App Alerts

- `useOrderAlerts` hook tracks previous order count vs current
- New order detected → play sound + show in-app banner with order details
- Active on dashboard and orders screens

## Convex Schema Addition

```
pushTokens: {
  tenantId: string,
  userId: string,
  token: string,
  platform: "ios" | "android",
}
  .index("by_tenant", ["tenantId"])
```

## Files Changed

**Convex template** (`convex-template/convex/`):
- `schema.ts` — add `pushTokens` table
- `orders.ts` — `createOrder` schedules notification action after insert
- New `notifications.ts` — push token CRUD + Expo Push API action

**Mobile admin app** (`webnegosyo-app/`):
- New `lib/notifications.ts` — Expo push permission + token registration
- New `hooks/useOrderAlerts.ts` — detect new orders, play sound, show alert
- `app/_layout.tsx` — register push token on auth
- `app/(main)/dashboard.tsx` + `orders.tsx` — integrate alert hook

**Web app** (`src/`):
- `src/lib/orders-service.ts` — ensure Convex-only path when configured
- `src/app/actions/orders.ts` — already routes to Convex, verify no dual-write
