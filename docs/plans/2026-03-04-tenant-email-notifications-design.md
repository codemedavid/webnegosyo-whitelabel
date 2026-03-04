# Tenant Email Notifications via PostHog

**Date:** 2026-03-04
**Status:** Approved

## Problem

Tenants currently receive order notifications only via Facebook Messenger, browser notifications (web admin), and push notifications (mobile app). There is no email notification channel. Tenants want to receive order details via email.

## Solution

Add an optional `admin_email` field per tenant. Use PostHog's server-side Node SDK to capture `order_created` events with full order details. PostHog Workflows (configured in PostHog dashboard) trigger email delivery to the tenant's email address.

## Architecture

### Data Flow

```
Customer places order
  → createOrderAction (server action)
    → Order inserted into DB (Supabase or Convex)
    → If email_notifications_enabled && admin_email:
        posthog.capture('order_created', { ...orderDetails })
          → PostHog receives event
            → PostHog Workflow triggers
              → Email sent to person.properties.email (tenant's admin_email)
```

### Approach: Server-Side PostHog Capture

- Install `posthog-node` (server SDK only, no client-side JS)
- Singleton client in `src/lib/posthog.ts`
- Async fire-and-forget capture (does not block order response)
- Graceful degradation: if POSTHOG env vars missing, no-op silently

### Why PostHog (not Resend/SendGrid directly)

- User preference for PostHog's native email + workflow automation
- PostHog acts as both event router and email sender
- Workflow configuration (template, frequency, conditions) managed in PostHog UI
- Future benefit: can add more automation triggers without code changes

## Database Changes

Add to `tenants` table:
- `admin_email` (text, nullable) - optional email address for order notifications
- `email_notifications_enabled` (boolean, default false) - feature flag toggle

## New Files

- `src/lib/posthog.ts` - PostHog client singleton + `captureOrderCreated()` helper function

## Modified Files

- `src/types/database.ts` - Add `admin_email` and `email_notifications_enabled` to Tenant interface
- `src/app/actions/orders.ts` - Add PostHog capture after successful order creation (both Supabase and Convex paths)
- `src/components/superadmin/tenant-form.tsx` - Add "Email Notifications" card section with email input + toggle

## PostHog Event Schema

**Event:** `order_created`

**Distinct ID:** `tenant_{tenantId}`

**Person Properties ($set):**
- `email` - tenant's admin_email (used by workflow for email delivery)
- `name` - tenant name

**Event Properties:**
- `tenant_name` - restaurant name
- `tenant_slug` - URL slug
- `order_id` - order identifier
- `customer_name` - customer name
- `customer_contact` - customer contact info
- `items` - array of { name, quantity, variation, addons, subtotal }
- `order_total` - total amount
- `delivery_fee` - delivery fee (if any)
- `order_type` - dine-in/pickup/delivery
- `payment_method` - payment method name
- `delivery_address` - delivery address (if applicable)

## PostHog Dashboard Setup (Manual, One-Time)

1. **Verify email domain** - add 4 DNS records in PostHog channel setup
2. **Create workflow** - trigger: `order_created` event
3. **Add email dispatch** - recipient: `{{ person.properties.email }}`
4. **Design email template** - use `{{ event.properties.* }}` for order details
5. **Set frequency** to "Every time" (send on every order)

## Environment Variables

- `POSTHOG_API_KEY` - PostHog project API key
- `POSTHOG_HOST` - PostHog instance host (default: https://us.i.posthog.com)

## Graceful Degradation

If `POSTHOG_API_KEY` or `POSTHOG_HOST` are not set, the PostHog client returns a no-op stub. Order creation is never blocked by PostHog failures. This follows the same pattern as Convex analytics graceful degradation.
