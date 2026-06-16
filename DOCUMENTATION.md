# WebNegosyo Platform Documentation

A multi-tenant restaurant ordering SaaS platform. Merchants get white-labeled online menus; customers order via the web, and orders are sent to the merchant's Facebook Messenger.

---

## Table of Contents

1. [Platform Overview](#platform-overview)
2. [Multi-Tenancy](#multi-tenancy)
3. [User Roles](#user-roles)
4. [Menu System](#menu-system)
5. [Cart & Checkout Flow](#cart--checkout-flow)
6. [Menu Engineering (BCG Matrix)](#menu-engineering-bcg-matrix)
7. [Upsell System](#upsell-system)
8. [Bundle System](#bundle-system)
9. [Order Management](#order-management)
10. [Tenant Branding](#tenant-branding)
11. [Feature Flags](#feature-flags)
12. [Integrations](#integrations)
13. [Mobile Apps](#mobile-apps)
14. [Tech Stack](#tech-stack)

---

## Platform Overview

WebNegosyo is a platform where restaurant owners (merchants) can create their own branded online menu without any technical knowledge. Each merchant gets a unique storefront URL, full branding control, and order notifications delivered straight to their Facebook Messenger.

**How it works:**

1. A superadmin creates a new tenant (merchant) on the platform.
2. The merchant gets a branded menu page (e.g., `merchant.webnegosyo.com` or a custom domain).
3. Customers browse the menu, add items to cart, and submit orders.
4. The order is sent to the merchant's Facebook Messenger as a formatted message.
5. The merchant fulfills the order.

---

## Multi-Tenancy

Every piece of data in the system is scoped to a tenant. The platform resolves which tenant a request belongs to using three methods, checked in this priority order:

| Priority | Method | Example |
|----------|--------|---------|
| 1 | Custom domain | `www.juansrestaurant.com` |
| 2 | Subdomain | `juans.webnegosyo.com` |
| 3 | Path-based | `webnegosyo.com/juans/menu` |

**Reserved subdomains** (`www`, `superadmin`, `app`, `admin`) are never treated as tenant slugs.

### How Tenant Resolution Works

1. A request comes in to the middleware.
2. The system checks if the domain matches any tenant's custom domain.
3. If not, it checks if there's a subdomain that matches a tenant slug.
4. The middleware rewrites the request internally to path-based routing (`/[tenant]/...`).
5. All downstream pages and API routes receive the tenant slug as a route parameter.

Tenant lookups are cached in memory (5-minute TTL, max 1,000 entries) to minimize database calls.

---

## User Roles

The platform has three distinct roles:

### Superadmin

Full platform control. There is only one superadmin dashboard at `/superadmin/`.

**Capabilities:**
- Create, edit, and manage all tenants
- Enable/disable feature flags per tenant
- View platform-wide analytics (total orders, active tenants, adoption metrics)
- Manage leads and checkout leads (sales pipeline)
- Configure platform-level payment methods
- Deploy Convex backends for tenants
- Access AI menu parsing tools

**Dashboard pages:**
- Overview with platform stats
- Tenant list with search and filtering
- Individual tenant settings (branding, features, integrations)
- Lead management with pipeline stages (new, contacted, qualified, converted, lost)
- Checkout lead tracking with payment status
- Platform analytics

### Tenant Admin

Each merchant has one or more admins who manage their storefront at `/[tenant]/admin/`.

**Capabilities:**
- Manage menu items (create, edit, delete, reorder)
- Manage categories
- Configure bundles
- Set up upsell pairs and pairing rules
- Classify items using the BCG matrix (if enabled)
- View and manage orders (if enabled)
- Configure order types (dine-in, pickup, delivery)
- Set up payment methods
- Customize hero section and branding
- View product analytics

### Customer

The public-facing user who browses the menu and places orders. No account required.

**Flow:**
- Browse menu at `/{tenant}/menu`
- View item details at `/{tenant}/menu/item/{itemId}`
- Add items to cart
- Checkout at `/{tenant}/checkout`
- Receive order confirmation with Messenger redirect

---

## Menu System

### Categories

Menu items are organized into categories. Each category has a name, optional icon, and display order. Categories determine the navigation structure of the menu page.

### Menu Items

Each item belongs to a category and has:

- **Basic info:** name, description, price, image
- **Variations:** support for two formats
  - **Legacy format:** flat list of variations (e.g., Small, Medium, Large)
  - **Grouped format:** variation types with options (e.g., Size → Small/Medium/Large, Spice Level → Mild/Medium/Hot)
- **Add-ons:** optional extras with their own prices
- **BCG classification:** star, plowhorse, puzzle, dog, or unclassified (when menu engineering is enabled)
- **Badge text:** overlay label like "NEW", "POPULAR", "BEST SELLER"
- **Availability:** active/inactive toggle

### Menu Layouts

Tenants can choose from 6 page layouts:
- `default` — standard vertical scroll
- `sidebar` — category sidebar with content area
- `magazine` — editorial-style layout
- `grid-focus` — emphasis on the grid view
- `list` — compact list view
- `mosaic` — masonry-style grid

### Card Templates

14 card design templates are available:
`classic`, `minimal`, `modern`, `elegant`, `compact`, `bold`, `glass`, `polaroid`, `brutalist`, `magazine`, `zen`, `neon`, `storefront`

Tenants can set different card templates for desktop and mobile.

---

## Cart & Checkout Flow

### Cart

The cart is client-side, stored in localStorage and scoped per tenant (`restaurant_cart_{tenantSlug}`).

**Features:**
- Supports regular items and bundle items
- Handles both legacy and grouped variation formats
- Generates unique cart item IDs based on item + selected variations + addons
- Maximum 99 quantity per line item
- Debounced Messenger sync (5-second delay)

**Price calculation:**
```
Item subtotal = (base price + variation modifiers + addon prices) × quantity
Cart total = sum of all item subtotals + bundle subtotals + delivery fee + service charge
```

### Checkout Flow

The checkout is a multi-step process:

```
Select Order Type → Fill Customer Form → (Delivery Address) → Select Payment → (Upsell) → Submit Order
```

**Step 1 — Order Type**
Customer selects from available order types (dine-in, pickup, delivery). Each order type can have different form fields and payment methods.

**Step 2 — Customer Form**
Dynamic form fields configured per order type: name, phone, email, address, notes, etc.

**Step 3 — Delivery Address** *(delivery orders only)*
If Mapbox is enabled, an address autocomplete field appears. If Lalamove is enabled, a delivery fee quotation is fetched in real time.

**Step 4 — Payment Method**
Customer selects from available payment methods. Some methods display QR codes or bank details that the customer can copy.

**Step 5 — Upsell** *(if enabled)*
The checkout upsell modal appears as a last chance to add items before placing the order.

**Step 6 — Order Submission**
The order is created in the database, a formatted message is generated, and the customer is redirected to Messenger to send it to the merchant.

**Messenger redirect modes:**
- **Webhook:** `m.me/{pageId}/?ref={orderId}&text={message}`
- **Direct:** `messenger.com/t/{pageId}?message={message}`

---

## Menu Engineering (BCG Matrix)

Menu engineering is a restaurant industry framework for optimizing menu profitability. When enabled, it gives merchants tools to classify and optimize their menu items.

### BCG Matrix Classifications

Items are classified into four quadrants based on popularity and profitability:

```
                    High Popularity
                         │
           ┌─────────────┼─────────────┐
           │             │             │
           │   PLOWHORSE │    STAR     │
           │  High profit│ High profit │
           │  Low popular│ High popular│
           │             │             │
High ──────┼─────────────┼─────────────┼────── Low
Profit     │             │             │  Profit
           │     DOG     │   PUZZLE    │
           │  Low profit │  Low profit │
           │  Low popular│ High popular│
           │             │             │
           └─────────────┼─────────────┘
                         │
                    Low Popularity
```

| Classification | Strategy |
|----------------|----------|
| **Star** | Showcase prominently. These are your best items — high demand and high profit. |
| **Plowhorse** | Push with upsells. High profit but customers don't order them often enough. |
| **Puzzle** | Optimize pricing or reduce costs. Popular but not profitable enough. |
| **Dog** | Consider removing, repositioning, or bundling. Low on both dimensions. |

### Admin Interface

The menu engineering dashboard (`/[tenant]/admin/menu-engineering`) provides:
- A visual 2×2 BCG quadrant chart
- Per-item classification dropdowns
- Bulk classification updates
- Badge text configuration (overlay labels on menu cards)
- Upsell pair management (covered in the next section)

### How It Powers Other Features

BCG classifications feed into the upsell and bundle systems:
- **Auto-generated upsell pairs:** plowhorses → stars, stars → stars, puzzles → plowhorses
- **Checkout upsell priority:** star items are prioritized in checkout suggestions
- **Bundle recommendations:** dogs can be bundled with stars to increase their sell-through

---

## Upsell System

The upsell system has three phases, each triggered at a different point in the customer journey. An **upsell orchestrator** manages frequency to prevent overwhelming customers (max 2 mid-flow prompts per session).

### Phase 1 — "Make it a Meal?" (Inline Upgrade)

**When:** On the product detail page, before adding to cart.

Displays a side-by-side comparison between the current item and an upgrade option:
- Left card: "Ala Carte" (current item)
- Right card: "Meal" (upgrade/bundle)
- Price difference badge showing the extra cost
- Default selects Ala Carte; tapping the upgrade switches selection

**Configuration:**
- Upsell pair type: `upgrade`
- Display style: `inline` (on-page) or `modal`
- Custom labels: `source_label`, `target_label`, `upgrade_header`

### Phase 2 — "Perfect with..." (Pair Suggestion)

**When:** After adding an item to cart.

A full-screen page showing complementary items:
- Header: "Perfect with [item name]"
- Responsive grid of suggestion cards (2 cols mobile, 3 tablet, 4 desktop)
- "Add" buttons with green "Added!" confirmation state
- "Continue" button to go back to menu

**How suggestions are resolved (priority order):**
1. Item-level manual pairs (highest priority, max 4)
2. Pairing rules — tag-based and category-based rules (if enabled)
3. Category-level manual pairs (fallback)

**Pairing rules** allow admins to define broader suggestion logic:
- "When customer adds any item tagged `coffee`, suggest items tagged `pastry`"
- "When customer adds from Mains category, suggest from Drinks category"

### Phase 3 — "Before you go..." (Checkout Upsell)

**When:** After tapping "Checkout" from the cart, before the checkout form.

A full-screen takeover with last-chance suggestions:
- **4-tier priority waterfall:**
  1. Manually flagged items (`show_in_checkout_upsell = true`)
  2. Complementary pairs based on cart contents
  3. BCG star items
  4. Any available items
- Running cart total display
- Responsive grid of suggestion cards with "Add to Cart" buttons
- "No thanks, checkout" ghost button
- Customizable branding (7 color fields for the modal)

**Tenant settings:**
- `checkout_upsell_title` — headline text
- `checkout_upsell_subtitle` — secondary text
- `checkout_upsell_max_items` — number of suggestions (1–8)

### Upsell Orchestrator

Prevents upsell fatigue by tracking prompts per session:

| Upsell Type | Budget Cost | Limit |
|-------------|-------------|-------|
| Inline upgrade | 1 | Max 2 total mid-flow |
| Post-add bundle | 1 | Max 2 total mid-flow |
| Post-add pair suggestion | 1 | Max 2 total mid-flow |
| Checkout modal | 0 | Always shown if enabled |

If a customer dismisses a mid-flow upsell, no further mid-flow upsells are shown for that session.

### Analytics

All upsell interactions are tracked:
- `upsell_shown` — upsell was displayed
- `upsell_clicked` / `upsell_added` — customer added a suggested item
- `upsell_dismissed` — customer declined

Each event includes the `source` (`inline_upgrade`, `pair_suggestion`, `checkout_modal`) for attribution.

---

## Bundle System

Bundles let merchants group items together at a discounted price (e.g., "Meal Deal: Burger + Fries + Drink").

### Bundle Structure

A bundle has:
- **Name, description, image**
- **Pricing type:**
  - `fixed` — one flat price regardless of item choices (e.g., P199 Meal Deal)
  - `discount` — percentage off the combined individual prices (e.g., 15% off)
- **Slots** — each slot represents a pick from a category

**Slot model:**
```
Bundle: "Lunch Combo"
├── Slot 1: "Choose your Main" (pick 1 from Mains category)
├── Slot 2: "Choose your Side" (pick 1 from Sides category)
└── Slot 3: "Choose your Drink" (pick 1 from Drinks category)
```

Each slot can:
- Restrict choices to specific items (`included_item_ids`)
- Apply per-item price adjustments (`price_overrides`) for premium upgrades
- Allow item customization (variations and addons) during bundle selection

### Visibility Controls

Two independent toggles per bundle:
- `show_on_menu` — displays the bundle in a dedicated "Bundles" section above menu categories
- `show_as_upsell` — shows the bundle as a suggestion when a customer adds an item that belongs to it

### Pricing Calculation

```
Fixed pricing:
  Base = fixed_price
  Extras = price overrides + variation modifiers + addons
  Total = (base + extras) × quantity

Discount pricing:
  Original = sum of individual slot item prices
  Base = original × (1 - discount_percent / 100)
  Extras = price overrides + variation modifiers + addons
  Total = (base + extras) × quantity
  Savings = original - base
```

### Customer Experience

**On menu:** Bundles section with savings badges and 2×2 thumbnail grids of included items.

**Customization flow:** When a customer selects a bundle, a modal guides them through each slot to pick their items and customize variations/addons.

**As upsell:** When adding a single item that belongs to a bundle, the system can suggest "Complete the bundle and save X%".

---

## Order Management

When `enable_order_management` is enabled for a tenant, admins get a real-time order dashboard.

### Real-Time Updates

Two backends support real-time order tracking:

1. **Supabase Realtime** — WebSocket subscription on the `orders` table for INSERT and UPDATE events. Used as the default.
2. **Convex** — If the tenant has a `convex_deployment_url`, the system uses Convex for real-time order queue, dashboard stats, and status management.

### Notifications

When a new order comes in:
- A two-tone chime plays via the Web Audio API
- A browser notification appears (with `requireInteraction: true`)
- A toast notification slides in
- A green pulse dot indicates the live connection is active

### Order Lifecycle

Orders flow through statuses managed by the admin:
- New → Confirmed → Preparing → Ready → Completed
- Orders can also be cancelled at any stage

---

## Tenant Branding

Each tenant has 40+ customizable color fields that are applied as CSS variables across the storefront. This allows complete visual customization without any code changes.

### Color Categories

| Category | Fields |
|----------|--------|
| **Layout** | Background, header, header font |
| **Cards** | Card background, border, title, price, description |
| **Modals** | Background, title, price, description |
| **Buttons** | Primary color/text, secondary color/text |
| **Text** | Primary, secondary, muted |
| **Menu** | Header text, category header, active category, cart badge |
| **Checkout modal** | Background, title, button, and 4 more |
| **Utilities** | Border, success, warning, error, link, shadow |

### Additional Customization

- **Card template** — one of 14 visual styles for menu item cards
- **Page layout** — one of 6 layout options for the menu page
- **Mobile overrides** — separate card template and layout for mobile devices
- **Mobile grid columns** — 1 or 2 cards per row on mobile
- **Hero section** — customizable hero with title, description, colors, and a visual designer
- **Announcement bar** — optional top banner with custom text and colors
- **Promotion banners** — image-based promotional slides
- **Currency display** — option to hide the currency symbol

---

## Feature Flags

All feature flags are per-tenant boolean columns on the `tenants` table. Superadmins toggle them from the tenant settings page.

| Flag | Description | Dependencies |
|------|-------------|--------------|
| `menu_engineering_enabled` | BCG classification, badges, upsell pairs | None |
| `checkout_upsell_enabled` | Checkout upsell modal | Requires `menu_engineering_enabled` |
| `bundles_enabled` | Bundle system (menu + upsell) | None |
| `pairing_rules_enabled` | Tag-based pairing rules for suggestions | None |
| `hero_section_enabled` | Hero section on menu page | None |
| `flash_screen_feature_enabled` | Splash screen capability | None |
| `flash_screen_is_active` | Splash screen currently active | Requires above |
| `mapbox_enabled` | Address autocomplete on checkout | Requires Mapbox token |
| `lalamove_enabled` | Lalamove delivery integration | Requires API credentials |
| `enable_order_management` | Admin order management | None |
| `email_notifications_enabled` | Email order notifications to admin | Requires `admin_email` |
| `app_enabled` | Mobile app availability | None |
| `hide_currency_symbol` | Hide currency symbol in prices | None |

---

## Integrations

### Facebook Messenger

The core order delivery mechanism. When a customer submits an order, a formatted message is generated and the customer is redirected to Messenger to send it to the merchant.

- **Webhook:** `/api/webhook` receives Messenger events
- **OAuth:** `/api/auth/facebook/` handles Page connection
- **Message sending:** `/api/messenger/` formats and sends order messages

### Cloudinary

All menu item and bundle images are hosted on Cloudinary with automatic optimization.

### Mapbox

When enabled, provides address autocomplete on the checkout page for delivery orders.

### Lalamove

Delivery service integration supporting 7 markets (PH, SG, HK, TH, TW, MY, VN):
- Real-time delivery fee quotation
- Order booking and tracking
- Cancellation support

### Convex (Real-Time Backend)

Optional per-tenant real-time backend:
- Real-time order queue and dashboard stats
- Analytics event tracking and aggregation
- Push notifications to merchant mobile app
- Daily stats aggregation via cron job

### Upstash Redis

Server-side caching for webhook responses and complementary pair lookups (5-minute TTL).

### Sentry

Error tracking and session replay across server, edge, and client environments.

### AI Menu Parsing

Superadmin tool that sends raw menu text (e.g., from a photo transcript) to OpenRouter (Llama 3.3 70B Instruct) for structured extraction of categories, items, variations, and addons.

---

## Mobile Apps

The platform includes two mobile applications built with Expo / React Native:

### Customer App (`mobile/`)

A white-labeled mobile app that each merchant can publish under their own brand. Each tenant gets a unique build with their name, icon, splash screen, and brand colors.

**Key features:**
- Full menu browsing with category navigation
- Item detail with variation/addon selection
- Cart and multi-step checkout
- Order confirmation and status tracking
- Tenant-specific theming

**Build pipeline:** A script fetches tenant data, generates branded icons via Sharp, and triggers an EAS Build. A GitHub Actions workflow automates this process.

### Merchant Admin App

> *Documentation for the merchant admin app (`webnegosyo-app/`) is coming soon. It provides real-time order management, push notifications, and analytics for merchants on mobile.*

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 15 (App Router, Turbopack) |
| **Language** | TypeScript (strict mode) |
| **Database** | Supabase PostgreSQL (Row-Level Security) |
| **Real-time** | Convex (optional per-tenant) + Supabase Realtime |
| **Auth** | Supabase Auth (`@supabase/ssr`) |
| **Styling** | Tailwind CSS 4, Shadcn UI, Radix primitives |
| **State** | React Context (cart), TanStack React Query (server state) |
| **Forms** | React Hook Form + Zod validation |
| **Mobile** | Expo SDK 54, React Native, Expo Router |
| **Caching** | Upstash Redis, in-memory caches |
| **Images** | Cloudinary |
| **Monitoring** | Sentry |
| **CI/CD** | GitHub Actions |
