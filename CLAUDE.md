# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Multi-tenant restaurant ordering SaaS platform ("WebNegosyo"). Merchants create white-labeled online menus; customers order via the web and orders are sent to the merchant's Facebook Messenger. Built with Next.js 15 App Router, Supabase, and TypeScript.

## Commands

```bash
npm run dev              # Dev server (Turbopack)
npm run build            # Production build (runs validate-env.mjs prebuild)
npm run lint             # ESLint
npm run test             # Jest unit tests
npm run test:watch       # Jest watch mode
npm run test:coverage    # Coverage report
npm run test -- --testPathPattern="cart-utils"  # Run a single test file
```

Tests live in `tests/unit/` with fixtures in `tests/fixtures/`. Jest uses jsdom environment with `@/` path alias mapped to `src/`.

## Architecture

### Multi-Tenancy

The entire app is multi-tenant. Tenant resolution happens in `src/middleware.ts` using `src/lib/tenant.ts`:
- **Priority**: Custom domain > Subdomain > Path-based routing
- Subdomains use `PLATFORM_ROOT_DOMAIN` env var. Local dev uses `<tenant>.localhost`.
- Reserved subdomains: `www`, `superadmin`, `app`, `admin`
- In-memory caches (5 min TTL, max 1000 entries) for domain lookups and tenant existence checks
- Middleware rewrites subdomain/custom domain requests to path-based routes (`/[tenant]/...`)

### Route Structure

- `src/app/[tenant]/menu/` — Customer menu (SSR + ISR)
- `src/app/[tenant]/menu/item/[itemId]/` — Product detail page
- `src/app/[tenant]/cart/`, `checkout/` — Shopping cart flow
- `src/app/[tenant]/admin/` — Tenant admin dashboard (protected)
- `src/app/[tenant]/login/` — Tenant admin login
- `src/app/superadmin/` — Platform admin (protected, requires `superadmin` role)
- `src/app/api/` — API routes (webhooks, messenger, facebook OAuth, AI parsing)

### Authentication & Authorization

Uses Supabase Auth with `@supabase/ssr` (NOT the deprecated `auth-helpers-nextjs`). Three roles: `superadmin`, `admin` (tenant), `customer` (public).

**Critical**: Supabase client cookies must use ONLY `getAll`/`setAll` pattern. Never use individual `get`/`set`/`remove` cookie methods — they are deprecated and will break session handling.

Supabase client factories:
- `src/lib/supabase/server.ts` — Server Components/Actions (async, uses `cookies()`)
- `src/lib/supabase/client.ts` — Browser client (synchronous)
- `src/lib/supabase/admin.ts` — Service role client (bypasses RLS)

### Data Layer

- **Database**: Supabase PostgreSQL with Row-Level Security (RLS). Every table has `tenant_id`.
- **Types**: `src/types/database.ts` — Full DB type definitions used with `createClient<Database>()`
- **Migrations**: `supabase/migrations/` (28 SQL files)
- **Queries**: `src/lib/queries/` for reusable data fetching

### State Management

- **Server state**: TanStack React Query (5 min stale, 10 min GC)
- **Cart**: React Context (`src/hooks/useCart.tsx`) with localStorage persistence and debounced Messenger sync
- **Client state**: Zustand available but Context preferred for cart

### Variation System (Backward Compatible)

Menu items support two variation formats:
- **Legacy**: Flat `Variation[]` (e.g., small/medium/large)
- **New**: Grouped `VariationType[]` with `VariationOption[]` (e.g., Size group + Spice Level group)

Cart utilities in `src/lib/cart-utils.ts` handle both formats.

### Key Integrations

- **Facebook Messenger**: Webhook at `/api/webhook`, OAuth at `/api/auth/facebook/`, sends orders/carts via `/api/messenger/`
- **Cloudinary**: Image uploads (`src/lib/cloudinary-utils.ts`)
- **Mapbox**: Address autocomplete and geocoding
- **Lalamove**: Delivery service (`src/lib/lalamove-service.ts`)
- **Upstash Redis**: Caching for webhooks (`src/lib/redis-cache.ts`)

### Component Organization

- `src/components/ui/` — Shadcn/ui primitives (Radix-based)
- `src/components/customer/` — Customer-facing (product cards, cart, checkout)
- `src/components/admin/` — Tenant admin (menu mgmt, orders, settings)
- `src/components/superadmin/` — Platform admin
- `src/components/shared/` — Cross-cutting (navigation, forms, modals)

### Tenant Branding

Tenants have 40+ customizable color fields applied via CSS variables (`src/lib/branding-utils.ts`). Card templates: classic, minimal, modern, elegant, compact, bold.

## Code Conventions

- TypeScript strict mode. Prefer interfaces over types. Avoid enums (use maps).
- Functional/declarative patterns. No classes.
- Named exports for components. Lowercase-with-dashes for directories.
- Descriptive variable names with auxiliary verbs (`isLoading`, `hasError`).
- Minimize `'use client'`, `useEffect`, `setState` — favor Server Components.
- Wrap client components in Suspense with fallback.
- Use `@/` path alias for all imports from `src/`.
- Validate with Zod schemas. Forms use React Hook Form + `@hookform/resolvers`.
- Styling: Tailwind CSS 4, mobile-first. Use Shadcn UI and Radix primitives.
- Run `npm run lint` before considering a task complete (Vercel deployment will fail on lint errors).
