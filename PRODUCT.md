# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Four confirmed audiences, all of which future design decisions must serve. They are not ranked; each owns different surfaces.

- **Filipino restaurant merchants** — owners of small and independent F&B businesses, increasingly multi-branch. They run menu, orders, inventory, branches, staff, and payment methods, usually from a phone, often mid-service and under time pressure. Primary users of the tenant admin (web) and the merchant admin app (`webnegosyo-app/`).
- **Diners** — end customers browsing a merchant's white-labeled menu, almost entirely on mobile web, and checking out into the merchant's Facebook Messenger. They have no account and no training; a single confusing step loses the order.
- **Counter and POS staff** — cashiers and branch staff working the register. High-frequency, repetitive, shared-device usage where speed and error rate matter more than expression. Staff are branch-scoped and permission-limited, not owners.
- **Platform superadmin** — the WebNegosyo team, provisioning tenants, branding, integrations, and platform-wide analytics.

## Product Purpose

WebNegosyo is a multi-tenant restaurant ordering SaaS. A merchant signs up and gets a white-labeled online menu on their own subdomain or custom domain; diners order from it; the order lands in the merchant's Facebook Messenger and in the merchant's admin queue. Around that core it has grown into the merchant's operating system: menu engineering and upsells, bundles, inventory and COGS, multi-branch management, branch-scoped staff, a POS register with order editing, delivery pricing, and payment-proof collection.

Success is a merchant taking real orders through their own branded storefront without the platform's name being the thing the diner sees, and running the day's operations without leaving the product.

## Positioning

Ordering flows into Facebook Messenger rather than into a separate app the diner must install or an account they must create. In the Philippine market Messenger is already where the merchant and the customer talk, so the product meets that behavior instead of replacing it. Each merchant is white-labeled to their own domain and identity, not listed inside a marketplace that owns the customer relationship — the merchant keeps the customer.

## Operating Context

- Tenant resolution runs on every request: custom domain > subdomain > path. Reserved subdomains: `www`, `superadmin`, `app`, `admin`.
- The merchant's real working scene is a phone, one-handed, during service, often on unreliable mobile data.
- Diners arrive by a link shared in Messenger or on a Facebook page. Mobile web is the dominant context; there is no install step.
- Multi-branch merchants operate a hierarchy: owner sees the portfolio, branch admins and staff are scoped to one outlet.
- The POS register is a distinct scene from the admin app: standing, repetitive, interruption-heavy, frequently a shared device.
- Two order backends exist per tenant (Convex or platform Supabase); the merchant never sees which.

## Capabilities and Constraints

- **Confirmed capabilities:** white-labeled menus with per-tenant branding; cart and checkout to Messenger; tenant admin dashboard; menu engineering (BCG classification, upsell pairs, bundles, checkout interstitials); real-time order queue; inventory with stock ledger, COGS, and daily variance reporting; multi-branch outlets with branch-scoped staff and permissions; POS register with in-place order editing; payment methods with optional payment-proof capture; delivery pricing (Lalamove and distance-based); scheduled and advance orders; analytics for merchants and for the platform.
- **Feature flags are per-tenant.** Almost every capability above is gated by a boolean on the `tenants` table. No design may assume a feature is present; every surface must hold together with the feature absent.
- **Multi-tenancy is absolute.** Every table carries `tenant_id` under RLS. Nothing may leak across tenants.
- **Graceful degradation is a product requirement, not an optimization.** Convex, analytics, Mapbox, and Lalamove all no-op silently when unconfigured, and the affected surface must still be coherent.
- **Accessibility standard:** none has been formally established. Recorded as an open decision.
- **Undecided:** whether the merchant admin app and the tenant admin web dashboard should converge on one interaction model or stay deliberately distinct.

## Brand Commitments

- **The Branding Studio is the binding house style.** `src/components/admin/branding-studio/` is the reference the platform's own surfaces follow. Future design work on WebNegosyo-owned UI conforms to it rather than proposing a competing look.
- **Tenant branding governs customer-facing storefronts.** Each tenant has 40+ color fields, mobile overrides, and a choice of card, cart, and checkout templates. Storefront design must remain a neutral substrate that any merchant's palette sits correctly on top of.
- **Product name:** WebNegosyo. The merchant admin app ships as `com.webnegosyo.admin`; the customer app is white-labeled per merchant and does not carry the platform name.
- The platform name is deliberately absent from the diner-facing experience.

## Evidence on Hand

- The live production platform at `www.webnegosyo.com` with real merchant tenants.
- Real menu imagery for existing tenants, hosted on ImageKit (~2,094 images restored from a prior Cloudinary migration; one legacy Cloudinary cloud's images remain lost and must be re-uploaded manually).
- A shipped, App Store–reviewed merchant iOS app, including a demo tenant ("Webnegosyo Coffee") used for App Review.
- **Absences future work must not fabricate:** there are no published testimonials, case studies, named customer logos, press coverage, pricing page, benchmarks, or uptime claims in this repository. Do not invent them.
- No labour-cost or ad-spend data exists, so prime cost and CAC are deliberately absent from branch analytics.

## Product Principles

1. **The merchant's brand is the one the diner sees.** Platform identity belongs to merchant-facing surfaces only; the storefront defers.
2. **Design for mid-service, not for a demo.** The real user is holding a phone with one hand while something is cooking. Speed, legibility, and forgiveness beat density and expression.
3. **Every feature is optional.** Feature flags mean a surface must read as complete, not broken, when a capability is switched off.
4. **Meet the market where it already is.** Messenger, mobile web, no installs, no accounts for diners.
5. **Operate surfaces earn their keep in precision.** In admin, POS, and inventory, scanability and consistency outrank visual ambition; personality lives in exact detail, not in decoration.

## Accessibility & Inclusion

No product-specific standard has been established. Two known real constraints stand regardless: mobile-first at small viewport sizes, and outdoor or poorly-lit service environments where contrast is a functional requirement rather than a compliance checkbox. Whether to commit to WCAG 2.2 AA is an open decision.
