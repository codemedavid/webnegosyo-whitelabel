# Convex Order Tracking & Queue System Design

**Date:** 2026-02-28
**Status:** Approved

## Overview

Convex becomes the primary order database for tenants with `app_enabled`. Each tenant gets their own Convex project for full data isolation. A new React Native admin app (webnegosyo-app) provides real-time order management and analytics dashboards.

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  Web Menu        │    │  Mobile App      │    │  WebNegosyo App  │
│  (Next.js)       │    │  (Customer RN)   │    │  (Admin RN)      │
└───────┬──────────┘    └───────┬──────────┘    └───────┬──────────┘
        │                       │                       │
        │  orders, events       │  orders, events       │  reads orders,
        │                       │                       │  analytics
        ▼                       ▼                       ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Tenant's Convex Project                        │
│  ┌─────────┐ ┌────────────┐ ┌──────────┐ ┌───────────────────┐  │
│  │ orders  │ │orderItems  │ │ events   │ │ dailyStats        │  │
│  └─────────┘ └────────────┘ └──────────┘ └───────────────────┘  │
│  ┌──────────────┐                                                │
│  │ tenantConfig │ (Lalamove creds, restaurant address)           │
│  └──────────────┘                                                │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                    Supabase (Shared)                              │
│  tenants, menu_items, categories, app_users, auth, branding      │
│  + convex_url, convex_deploy_key columns on tenants table        │
└──────────────────────────────────────────────────────────────────┘
```

### What stays in Supabase
- Tenants, menu items, categories, branding, feature flags
- User authentication (app_users, Supabase Auth)
- Payment methods, order types, customer form fields
- All config/management data

### What moves to Convex (per tenant)
- Orders and order items (primary database)
- Analytics events (upsell, bundle, item tracking)
- Daily aggregated stats
- Tenant config (Lalamove creds, restaurant address for auto-booking)

### Behavior by tenant type
- **Tenants WITH Convex (`app_enabled` + credentials):** All orders (web + mobile) go to Convex. Analytics events tracked in Convex. Admin uses webnegosyo-app.
- **Tenants WITHOUT Convex:** Everything continues as-is with Supabase. No changes.

## Convex Schema

### orders
```typescript
defineTable({
  customerName: v.string(),
  customerContact: v.string(),
  customerData: v.optional(v.any()),
  total: v.number(),
  status: v.union(
    v.literal("pending"), v.literal("confirmed"),
    v.literal("preparing"), v.literal("ready"),
    v.literal("delivered"), v.literal("cancelled")
  ),
  orderType: v.optional(v.string()),
  orderTypeId: v.optional(v.string()),
  source: v.union(v.literal("web"), v.literal("mobile")),
  itemCount: v.number(),
  paymentMethod: v.optional(v.string()),
  paymentMethodDetails: v.optional(v.string()),
  paymentStatus: v.optional(v.string()),
  deliveryFee: v.optional(v.number()),
  deliveryAddress: v.optional(v.string()),
  deliveryLatitude: v.optional(v.number()),
  deliveryLongitude: v.optional(v.number()),
  lalamoveQuotationId: v.optional(v.string()),
  lalamoveOrderId: v.optional(v.string()),
  lalamoveStatus: v.optional(v.string()),
  lalamoveDriverName: v.optional(v.string()),
  lalamoveDriverPhone: v.optional(v.string()),
  lalamoveTrackingUrl: v.optional(v.string()),
  hasUpsellItems: v.optional(v.boolean()),
  hasBundleItems: v.optional(v.boolean()),
})
  .index("by_status", ["status"])
  .index("by_created", ["_creationTime"])
  .index("by_status_created", ["status", "_creationTime"])
```

### orderItems
```typescript
defineTable({
  orderId: v.id("orders"),
  menuItemId: v.string(),
  menuItemName: v.string(),
  quantity: v.number(),
  price: v.number(),
  subtotal: v.number(),
  specialInstructions: v.optional(v.string()),
  variation: v.optional(v.string()),
  variationSelections: v.optional(v.array(
    v.object({
      typeName: v.string(),
      optionName: v.string(),
      priceAdjustment: v.number(),
    })
  )),
  addons: v.optional(v.array(
    v.object({
      name: v.string(),
      price: v.number(),
      quantity: v.optional(v.number()),
    })
  )),
  isUpsellItem: v.optional(v.boolean()),
  isBundleItem: v.optional(v.boolean()),
  bundleId: v.optional(v.string()),
})
  .index("by_order", ["orderId"])
```

### analyticsEvents
```typescript
defineTable({
  type: v.string(),
  metadata: v.optional(v.any()),
  sessionId: v.optional(v.string()),
})
  .index("by_type", ["type"])
  .index("by_type_time", ["type", "_creationTime"])
```

### dailyStats
```typescript
defineTable({
  date: v.string(),
  totalOrders: v.number(),
  totalRevenue: v.number(),
  avgOrderValue: v.number(),
  upsellConversionRate: v.optional(v.number()),
  topItems: v.optional(v.array(v.object({
    itemId: v.string(),
    name: v.string(),
    count: v.number(),
    revenue: v.number(),
  }))),
})
  .index("by_date", ["date"])
```

### tenantConfig
```typescript
defineTable({
  key: v.string(),
  value: v.string(),
})
  .index("by_key", ["key"])
```

## Convex Functions

### Mutations
- `createOrder` — creates order + order items in a transaction
- `updateOrderStatus` — updates status, triggers Lalamove auto-booking on "confirmed" for delivery orders
- `trackEvent` — records analytics event
- `upsertDailyStats` — updates daily aggregation

### Queries
- `getOrders` — paginated, filterable by status, date range
- `getOrderById` — single order with items
- `getRealtimeQueue` — pending/confirmed/preparing orders (live dashboard)
- `getDashboardStats` — today's totals, counts by status
- `getUpsellAnalytics` — conversion rates: shown → clicked → converted
- `getBundleAnalytics` — bundle performance metrics
- `getTrends` — daily/weekly/monthly revenue and order volume
- `getTopItems` — most ordered items with revenue

### Actions
- `bookLalamove` — calls Lalamove API when order confirmed with delivery
- `aggregateDailyStats` — cron job, runs daily to compute stats

## Tenant Provisioning Flow

1. Human creates a Convex project in Convex dashboard
2. Superadmin navigates to tenant settings, enters:
   - `convex_deployment_url` (e.g., `https://tenant-name.convex.cloud`)
   - `convex_deploy_key` (admin/deploy key)
3. On save, server action:
   - Validates credentials by pinging the Convex deployment
   - Stores credentials in tenants table (encrypted)
   - Pushes the Convex schema + functions to the tenant's project via Convex deploy API
   - Syncs tenant config (Lalamove creds, restaurant address) to `tenantConfig` table
   - Sets `app_enabled = true`
   - Stores `convex_schema_version` for tracking
4. Schema version tracking allows bulk-updating all tenant Convex projects when the shared schema changes

## Lalamove Auto-Booking

When `updateOrderStatus` is called with status = "confirmed" and order has delivery type:
1. Convex action reads Lalamove credentials from `tenantConfig`
2. Calls Lalamove API to place delivery order (using stored quotation ID)
3. Updates order with `lalamoveOrderId`, `lalamoveTrackingUrl`, `lalamoveStatus`
4. Lalamove webhook updates flow through a Next.js API route → Convex mutation

## Analytics Event Tracking

### Events tracked
| Event | Trigger | Key Metadata |
|---|---|---|
| `item_viewed` | Product detail opened | itemId, categoryId, bcgClass |
| `add_to_cart` | Item added to cart | itemId, quantity, variation, price, source |
| `upsell_shown` | Checkout interstitial displayed | itemIds[], upsellType |
| `upsell_clicked` | Upsell item tapped | itemId, upsellType |
| `upsell_converted` | Upsell added from interstitial | itemId, upsellType, addedPrice |
| `bundle_viewed` | Bundle shown | bundleId |
| `bundle_added` | Bundle added to cart | bundleId, totalPrice |
| `checkout_started` | Checkout page loaded | cartTotal, itemCount |
| `checkout_completed` | Order placed | orderId, total, itemCount, hasUpsell |

### Implementation
- `useAnalytics` hook shared between web and mobile
- Gets tenant's Convex client, exposes `trackEvent(type, metadata)`
- Batches events (sends every 5s or on page unload)
- No-op fallback if tenant doesn't have Convex

## WebNegosyo Admin App (React Native)

**Location:** `webnegosyo-app/` at project root

**Stack:** Expo SDK 54, React Native, Expo Router, Convex React Native client, Supabase Auth

### Auth Flow
1. Admin logs in via Supabase Auth (email/password)
2. App fetches admin's `tenant_id` from `app_users`
3. App fetches `convex_deployment_url` for that tenant from Supabase
4. Convex client connects to tenant's Convex project
5. All data from Convex via real-time subscriptions

### Screens
- **Dashboard** — live stats: today's orders, revenue, avg order value, order queue
- **Orders** — real-time list, status management (pending → confirmed → preparing → ready → delivered), order details with items/variations/addons
- **Analytics** — upsell conversion funnel, bundle performance, item popularity
- **Trends** — charts for revenue, volume, top items (daily/weekly/monthly)
- **Settings** — notification preferences, Lalamove toggle

## Database Changes (Supabase)

New columns on `tenants` table:
- `convex_deployment_url` (text, nullable)
- `convex_deploy_key` (text, nullable, encrypted)
- `convex_schema_version` (integer, default 0)

## Order Flow Changes

### Before (current)
Web/Mobile → Supabase orders table → Realtime subscription → Admin web dashboard

### After (for Convex-enabled tenants)
Web/Mobile → Tenant's Convex → Real-time subscription → WebNegosyo admin app
                                                       → Web admin (reads Convex)

### Fallback
Tenants without Convex continue using Supabase for everything. Zero changes to existing behavior.
