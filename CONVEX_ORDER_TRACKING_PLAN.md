# Convex Order Tracking & Queue System — Implementation Plan

> **Goal:** Replace Messenger-based ordering with a real-time number queuing system powered by Convex, reducing Supabase load and eliminating Facebook dependency.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                  App (Web + Mobile)                       │
├──────────────────┬───────────────────────────────────────┤
│    SUPABASE      │              CONVEX                   │
│  (Source of      │     (Real-Time Order Engine)           │
│   Truth)         │                                       │
│                  │  ┌─────────────────────────────────┐  │
│ • Tenants        │  │  Single Project, Multi-Tenant   │  │
│ • Menu Items     │  │  • orders                       │  │
│ • Categories     │  │  • queue_counters               │  │
│ • Branding       │  │  • order_status_history         │  │
│ • Auth / Users   │  │  • real-time subscriptions      │  │
│ • Order Types    │  │                                 │  │
│ • Payment Methods│  └─────────────────────────────────┘  │
│ • Form Fields    │                                       │
│ • Analytics      │                                       │
└──────────────────┴───────────────────────────────────────┘
```

**Recommendation:** Use a **single Convex project** with `tenant_id` field on all tables instead of separate projects per tenant. This means:
- ✅ One API key to manage (stored in `.env`)
- ✅ Simpler deployment and maintenance
- ✅ Convex handles multi-tenancy via query filters
- ✅ No per-tenant setup needed beyond the current Supabase tenant config

---

## Convex Schema Design

### `orders` table

| Field | Type | Description |
|---|---|---|
| `tenant_id` | `string` | Links to Supabase tenant |
| `queue_number` | `number` | Auto-incrementing daily queue number (e.g., #1, #2, #42) |
| `customer_name` | `string?` | Customer name from form |
| `customer_contact` | `string?` | Phone/email |
| `customer_data` | `object?` | Dynamic form fields (JSON) |
| `items` | `array` | `{ name, variation, addons[], qty, price, subtotal, special_instructions }` |
| `order_type` | `string?` | "Dine In", "Pickup", "Delivery" |
| `order_type_category` | `string?` | "dine_in" \| "pickup" \| "delivery" |
| `total` | `number` | Order total |
| `delivery_fee` | `number?` | If applicable |
| `payment_method_name` | `string?` | e.g., "GCash", "Cash" |
| `payment_method_details` | `string?` | Account details |
| `payment_method_qr_url` | `string?` | QR code image URL |
| `payment_status` | `string` | "pending" \| "paid" \| "verified" \| "failed" |
| `status` | `string` | "pending" \| "confirmed" \| "preparing" \| "ready" \| "delivered" \| "cancelled" |
| `status_updated_at` | `number` | Timestamp of last status change |
| `created_at` | `number` | Order creation timestamp |

### `queue_counters` table

| Field | Type | Description |
|---|---|---|
| `tenant_id` | `string` | Tenant identifier |
| `date` | `string` | Date string `YYYY-MM-DD` |
| `current_number` | `number` | Last assigned queue number for the day |

### `order_status_history` table (optional, for audit trail)

| Field | Type | Description |
|---|---|---|
| `order_id` | `Id<"orders">` | Reference to order |
| `tenant_id` | `string` | Tenant identifier |
| `from_status` | `string` | Previous status |
| `to_status` | `string` | New status |
| `changed_at` | `number` | Timestamp |
| `changed_by` | `string?` | Admin who changed it |

---

## Customer Flow (New)

```
Customer places order
        │
        ▼
┌──────────────────────┐
│  Convex mutation:    │
│  createOrder()       │
│  → assigns Queue #   │
│  → status: "pending" │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────────────┐
│  Order Confirmation Page     │
│  "Your order number is #42"  │
│  ┌────────────────────────┐  │
│  │  📋 Status: Pending    │  │  ← Real-time via Convex useQuery()
│  │  🕐 Estimated: 15 min  │  │
│  │                        │  │
│  │  [Track Live]          │  │
│  └────────────────────────┘  │
└──────────────────────────────┘
           │
           ▼
┌──────────────────────────────┐
│  Tracking Page (/track/:id)  │
│  Real-time status updates:   │
│                              │
│  ✅ Order Received    3:01pm │
│  ✅ Confirmed         3:02pm │
│  🔄 Preparing...      3:05pm │
│  ○  Ready                    │
│  ○  Complete                 │
└──────────────────────────────┘
```

**No Messenger. No Facebook. Just a clean tracking page.**

---

## Admin Flow (New)

```
┌─────────────────────────────────────────────┐
│  Admin Dashboard — Live Orders              │
│                                             │
│  🔴 3 Pending  🟡 2 Preparing  🟢 1 Ready  │
│                                             │
│  ┌─────────────────────────────────────────┐│
│  │ #42 • Juan Dela Cruz • ₱385            ││
│  │ 2x Chicken Adobo, 1x Rice              ││
│  │ Dine In • GCash                         ││
│  │                                         ││
│  │ [Confirm] [Prepare] [Ready] [Cancel]    ││
│  └─────────────────────────────────────────┘│
│                                             │
│  ┌─────────────────────────────────────────┐│
│  │ #41 • Maria Santos • ₱220              ││
│  │ 1x Sinigang, 2x Rice                   ││
│  │ Pickup • Cash                           ││
│  │ Status: Preparing 🟡                    ││
│  │                                         ││
│  │ [Ready] [Cancel]                        ││
│  └─────────────────────────────────────────┘│
│                                             │
│  🔔 Sound notification on new orders       │
└─────────────────────────────────────────────┘
```

---

## Convex Functions to Build

### Mutations (Write Operations)

| Function | Purpose |
|---|---|
| `orders.create` | Create order, auto-assign queue number |
| `orders.updateStatus` | Update order status (admin) |
| `orders.cancel` | Cancel an order |
| `queueCounters.getNext` | Atomically increment and return next queue number for tenant + date |

### Queries (Read Operations — Auto Real-Time)

| Function | Purpose |
|---|---|
| `orders.getByTenant` | All active orders for admin dashboard (real-time) |
| `orders.getById` | Single order tracking (real-time) |
| `orders.getByQueueNumber` | Lookup by queue # for customer tracking |
| `orders.getStats` | Order counts by status for admin header |
| `orders.getHistory` | Past orders with pagination |

---

## Files to Create / Modify

### New Files (Convex)

| File | Purpose |
|---|---|
| `convex/schema.ts` | Convex schema definition |
| `convex/orders.ts` | Order mutations & queries |
| `convex/queueCounters.ts` | Queue number management |
| `convex/tsconfig.json` | Convex TypeScript config |

### New Files (App)

| File | Purpose |
|---|---|
| `src/lib/convex.ts` | Convex client initialization |
| `src/providers/convex-provider.tsx` | ConvexProvider wrapper |
| `src/app/[tenant]/track/[orderId]/page.tsx` | Customer order tracking page |
| `src/components/customer/order-tracking.tsx` | Real-time tracking UI component |
| `src/components/admin/live-orders-dashboard.tsx` | Admin real-time order management |
| `mobile/lib/convex.ts` | Convex client for mobile |
| `mobile/providers/convex-provider.tsx` | Mobile ConvexProvider |
| `mobile/app/(main)/track-order.tsx` | Mobile tracking screen |

### Files to Modify

| File | Change |
|---|---|
| `src/hooks/useCart.tsx` | Change checkout submission to POST to Convex instead of Supabase |
| `src/app/[tenant]/checkout/page.tsx` | Redirect to tracking page after order (not Messenger) |
| `mobile/app/(main)/checkout.tsx` | Same — redirect to tracking instead of Messenger |
| `mobile/stores/order-store.ts` | Store `queue_number` and `convex_order_id` instead of `messengerUrl` |
| `src/components/shared/sidebar.tsx` | Add "Live Orders" link to admin sidebar |
| `src/app/layout.tsx` | Wrap with ConvexProvider |
| `mobile/app/(main)/_layout.tsx` | Wrap with ConvexProvider |
| `.env.local` | Add `NEXT_PUBLIC_CONVEX_URL` |
| `package.json` | Add `convex` dependency |

### Files to Eventually Remove (Post-Migration)

| File | Reason |
|---|---|
| `src/lib/cart-utils.ts` → messenger functions | No longer needed |
| `src/app/api/messenger/send-order/route.ts` | Replaced by Convex |
| `src/app/api/messenger/send-order-public/route.ts` | Replaced by Convex |
| `src/app/api/messenger/send-cart/route.ts` | Replaced by Convex |
| `src/lib/facebook-api.ts` | No longer needed |
| `src/hooks/use-realtime-orders.ts` | Replaced by Convex real-time |
| `mobile/lib/messenger-linking.ts` | Replaced by in-app tracking |
| `mobile/app/(main)/order-confirmation.tsx` | Replaced by tracking screen |

---

## Tenant Setup Required

For each new tenant, the admin only needs:

1. **Nothing extra** (if using single Convex project — recommended)
   - The `NEXT_PUBLIC_CONVEX_URL` is shared across all tenants
   - Orders are filtered by `tenant_id` automatically

2. **Optional:** Add a toggle in tenant settings: `enable_queue_tracking: boolean`
   - Allows gradual rollout — some tenants can still use Messenger while others migrate
   - Default: `true` for new tenants

---

## Implementation Phases

### Phase 1: Foundation (Day 1)
- [ ] Install Convex (`npm install convex`)
- [ ] Initialize Convex project (`npx convex dev`)
- [ ] Create schema (`convex/schema.ts`)
- [ ] Create order mutations & queries (`convex/orders.ts`)
- [ ] Create queue counter logic (`convex/queueCounters.ts`)
- [ ] Add ConvexProvider to web and mobile apps

### Phase 2: Customer Tracking (Day 1-2)
- [ ] Build order tracking page (`/[tenant]/track/[orderId]`)
- [ ] Real-time status updates with animated progress
- [ ] Mobile tracking screen
- [ ] Modify checkout flow to redirect to tracking page
- [ ] Display queue number on confirmation

### Phase 3: Admin Dashboard (Day 2)
- [ ] Build live orders dashboard with real-time updates
- [ ] One-click status updates (Pending → Confirmed → Preparing → Ready)
- [ ] Sound notifications for new orders
- [ ] Order filtering and search
- [ ] Add to admin sidebar navigation

### Phase 4: Cleanup & Migration (Day 3)
- [ ] Add `enable_queue_tracking` toggle to tenant settings
- [ ] Gradually deprecate Messenger integration
- [ ] Remove dead Messenger code
- [ ] Update mobile order confirmation flow
- [ ] Testing across all tenants

---

## Environment Variables

```env
# Add to .env.local
NEXT_PUBLIC_CONVEX_URL=https://your-project.convex.cloud

# Add to mobile/.env (or app.config.ts)
EXPO_PUBLIC_CONVEX_URL=https://your-project.convex.cloud
```

---

## Key Benefits Summary

| Before (Messenger) | After (Convex + Queue) |
|---|---|
| Depends on Facebook API | No external dependencies |
| Webhook complexity | Simple mutations |
| No real-time tracking | Native real-time via WebSocket |
| Customer must have Messenger | Works in any browser / app |
| Hard to track order status | Full status pipeline with history |
| Adds load to Supabase | Zero Supabase load for orders |
| No queue numbers | Clean queue numbering system |
| Manual messenger setup per tenant | Zero per-tenant setup |

---

## Risk & Considerations

1. **Convex free tier** — 1M function calls/month, which should be plenty for starting out
2. **Data backup** — Convex handles this, but consider periodic export to Supabase for analytics
3. **Offline support** — Convex client handles reconnection automatically
4. **Migration** — Existing orders in Supabase stay there; new orders go to Convex. No data migration needed.
5. **Supabase orders table** — Keep it for historical analytics, but stop writing to it for new orders once Convex is live

---

*Created: February 21, 2026*
*Status: Planning*
