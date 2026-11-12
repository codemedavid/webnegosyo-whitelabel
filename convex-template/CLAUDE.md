# Convex backend (per-store, legacy): rules for this folder

<!-- Moved verbatim from the root CLAUDE.md on 2026-11-11. The root file's rules for every change
     (Platform Supabase First, verification, conventions) still apply here. -->

## Convex (Real-Time Backend)

Convex serves as a secondary real-time backend alongside Supabase. Each tenant optionally has a `convex_deployment_url`.

- **Template**: `convex-template/convex/` — deployable per-tenant Convex backend
- **Schema**: `orders`, `orderItems`, `analyticsEvents`, `dailyStats`, `tenantConfig`, `pushTokens`
- **Orders**: Real-time order queue (`getRealtimeQueue`), dashboard stats, status management. Web admin falls back to Supabase Realtime if no Convex URL is set.
- **Analytics**: `trackEvent` mutation, `getUpsellAnalytics`, `getBundleAnalytics`, `getTopItems`, `getTrends` queries
- **Notifications**: `sendOrderNotification` pushes to Expo Push API on new orders
- **Lalamove**: `bookLalamove` action calls Lalamove v3 REST API directly from Convex
- **Cron**: Daily stats aggregation at 23:59 UTC via `statsAggregator.aggregateToday`
- **Web wrapper**: `src/components/admin/convex-orders-wrapper.tsx` wraps `ConvexProvider` per tenant
- **Client hook**: `src/hooks/use-analytics.ts` buffers events and flushes to Convex every 5 seconds
- **Graceful degradation**: If `convex_deployment_url` is null, analytics and Convex features no-op silently
