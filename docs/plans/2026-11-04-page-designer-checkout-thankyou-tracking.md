# Page Designer — Checkout, Thank-you & Tracking

**Date:** 2026-11-04 · **Status:** APPROVED 2026-11-04 — building on `feat/page-designer`.

## Goal

Owners design the customer **Checkout**, **Thank-you** and **Order tracking** pages in the same editor as
the Hero / Welcome Builder: sections → columns → widgets, drag to reorder, edit every piece of wording,
add their own text, images, buttons and banners — with desktop / tablet / phone views. A store that never
opens the designer looks exactly as it does today.

## What the research found (5 subagents, 2026-11-04)

- **Engine is ready to host new pages.** The Welcome Builder proved the pattern: a `BuilderSurface`
  (`src/components/hero-builder/editor/surface.ts`) + a runtime provider for live data
  (`renderer/welcome-runtime.tsx`, sample data in the editor) + a publish rule that refuses a design with
  no way forward (`welcome-builder/entry.ts`: `entryProblem` / `withGuaranteedEntry`).
- **No "locked" widget exists yet.** `removeNode` only protects a section's last column. Needed for
  Place Order, Payment, Order status.
- **Text widgets** are plain strings with `**bold**`, `*italic*`, `[link](url)`; only `{store}` is a token.
  Content is not per-device (style and `hidden` are).
- **Checkout** (`useCheckout.ts` owns ALL logic; templates are pure presentation): every section reads only
  the hook's return value, so each can render as a block. Voucher and Senior/PWD fields are buried inside
  `OrderSummaryLines` and must be lifted out. Only 7 checkout labels are editable; ~30 important strings are
  hard-coded (subtitles, schedule copy, Subtotal/Delivery/Free, CTA footer).
- **Thank-you** (`CheckoutConfirmation`, `checkout-shared.tsx:133`) is shared by every checkout design but
  for most stores is on screen only for a moment: `resolveTrackingRedirect` sends the customer to the
  tracking page as soon as the order is saved (not for Messenger handoff, kiosk, or a failed save).
  One editable label (`confirmation.title`).
- **Tracking** (`TrackingDashboard`) is a fixed JSX list of ~10 parts, already themed by `tracking_style`
  (`--trk-*` vars, contract test) with a Studio sample-order preview. Payload is a narrow, privacy-safe
  allowlist; refreshed by a 10 s poll.
- **Customer mobile app** (`mobile/`) renders its own native screens and reads none of this. Out of scope.

## Design

### 1. One new widget kind: `page-block` (system block)

Instead of ~25 new widget kinds (each touching 9 files), ONE kind carries `content.block` — an id from a
per-page **block registry** (`src/lib/page-designer/blocks.ts`):

```ts
interface PageBlockDef {
  id: 'checkout.payment' | 'tracking.status' | …
  page: 'checkout' | 'confirmation' | 'tracking'
  label: string                      // "Payment methods"
  required: 'always' | ((ctx) => boolean)  // locked; publish + render guarantee
  texts: Record<string, { label: string; labelKey?: StorefrontLabelKey; fallback: string; maxLength: number }>
  options?: zod schema               // e.g. summary: show items?, compact?
}
```

- The block's renderer comes from the page's runtime context (real hook state on the storefront, a
  SAMPLE in the editor/thumbnails — the welcome-runtime pattern).
- **Wording:** each block lists its text slots. Owner's text is stored on the widget
  (`content.texts[slot]`); blank falls back to the existing `storefront_labels` value, then the built-in
  default. So existing label edits keep working and nothing has to be migrated.
- Blocks paint only from the page's theme tokens (`--co-*`, `--trk-*`); the tracking contract test stays.

### 2. Locked blocks

- `required` blocks show a lock in the layers panel and cannot be deleted (guard in `removeNode` +
  `use-hero-builder`). They can be moved, restyled and re-worded.
- **Publish refuses** a design missing a required block on any device (generalised `entryProblem`).
- **Render guarantee**: if a stored design still lacks one (hand edit, new required block added later), the
  page appends it (generalised `withGuaranteedEntry`). A customer can never get stuck.

### 3. New engine features (shared by all builders)

- **Tokens** in text/heading/button: `{store}`, `{name}` (first name), `{order_number}`, `{order_type}`,
  `{total}`, `{eta}` — plain string replace from the runtime, never HTML.
- **Show when** (tracking + thank-you): a section/widget may be limited to order states, e.g. "only while
  Preparing" → "Your food is on the grill 🔥". Validated list of known statuses.
- Free widgets reuse the Hero Builder set (heading, text, image, button, divider, spacer, gallery, list,
  slideshow, icon…). **Embed is never offered on these pages; custom HTML is not offered on checkout**
  (customer data on the page).

### 4. Blocks per page

| Page | Locked (required) | Optional system blocks |
|---|---|---|
| **Checkout** | Customer details (when required fields exist), Payment methods (when any), Order summary + total, Place order button; Order type (when asked), Schedule (when advance orders on), Voucher (owner, 2026-11-05: a design must never stop customers entering a code), Senior/PWD |  Loyalty progress, SMS opt-in, Minimum-order notice, Store-closed banner |
| **Thank-you** | Status message (success / not-confirmed variants), Save-failure notice, Messenger handoff (when Messenger on), Track order button, Kiosk return (kiosk only) | Order summary, Customer info, Payment instructions, Scheduled-for, Order message, Loyalty card |
| **Tracking** | Order status (hero + progress) | Header, Timeline, Ready-time, Ring me, Items, Totals, Pickup QR, Loyalty card, Wallet buttons, Order details, Back to menu |

Branch picker, payment-details dialog, QR dialog and the "order is ready" overlay stay in the page shell
(not blocks) — they are flows, not layout.

### 5. Storage (platform Supabase first)

Migration `2026110412xxxx_page_designs.sql` — follows `welcome_design`:
`checkout_design`, `confirmation_design`, `tracking_design` (TEXT, v5 JSON) + `*_design_enabled`
(boolean, default false). Tenant-admin writable via existing RLS; NOT in the privileged guard.
Update together: `TENANT_STOREFRONT_SELECT`, generated types (Supabase MCP), publish/unpublish actions
(copy `actions/welcome-builder.ts`: `store_setup`, schema, 600 KB cap, affected-row check, cache +
`/checkout` + `/order/*` revalidation). Apply AND probe on platform (admin own tenant = 1 row, other
tenant = 0, anon read of the published design).

### 6. Storefront

- **Checkout:** when `checkout_design_enabled`, a new `custom` checkout template renders the design with a
  `CheckoutRuntimeProvider` fed by `useCheckout()`. Shell, guards, preflight, `checkoutCompleteRef`, DOM
  hooks (`data-payment-methods`, `data-advance-order`) untouched. Builder chunk lazy-loaded only for stores
  that use it. Wizard (steps) stays a separate template; "page breaks" = later.
- **Thank-you:** `CheckoutConfirmation` becomes a default design; a custom design replaces it.
  Owner option **"Show the thank-you page before tracking"** (default off = today's instant redirect).
- **Tracking:** `TrackingDashboard`'s fixed JSX becomes a block list driven by a design; with no design the
  *default design* reproduces today's layout exactly (incl. `loyalty_position`, `show_timeline`) — pinned
  by a snapshot test. One `TrackingBlockContext` fed by the live client AND the Studio sample preview.
  No new payload fields (privacy allowlist unchanged); no `Date.now()` in render.

### 7. Merchant UI

`/[tenant]/admin/page-designer/[page]` (full-screen, same editor), sidebar Store Setup → **Page Designer**
with Checkout · Thank-you · Tracking tabs. `ADMIN_SECTION_PERMISSIONS['page-designer'] = 'store_setup'`.
Preview frames use sample data (sample cart; the existing tracking sample order); tracking/thank-you get a
**state switcher** (Received / Preparing / Ready / Done / Cancelled) to edit "show when" text.
4 starter templates per page, every one publishable as-is (test). "Reset to standard" restores the default.

## Phases

| Phase | Work | Done when |
|---|---|---|
| P1 Engine | `page-block` kind, block registry, locks, required/guarantee, tokens, show-when, surfaces | engine tests green |
| P2 Tracking | dashboard → blocks + default design (pixel-identical), surface, preview, templates | live tracking page identical on a real platform order; custom design renders + polls |
| P3 Thank-you | confirmation → blocks, surface, "show before tracking" | Messenger / kiosk / failed-save flows still pass |
| P4 Checkout | extract voucher + Senior/PWD, `custom` template, surface, templates | real order placed end-to-end on a platform store with a custom design |
| P5 Ship | migration applied + probed, types, lint, full tests, code + security review | owner OK to merge/deploy |

Order chosen because customers spend the most time on tracking and checkout carries the most risk.

## Tests

- Engine: lock cannot be removed; publish refuses missing required block per device; guarantee appends;
  tokens replace text only; show-when filters; `ALL_WIDGET_KINDS` loops include `page-block`.
- Registry contract: every block has a renderer + sample + text fallbacks; label keys exist.
- Tracking: default design ≡ today's dashboard (snapshot); contract test passes with new files.
- Checkout: custom template still calls the hook's handler only; required blocks present for each
  config (delivery/pickup, advance orders, proof, gov claims); place order works (RTL).
- Templates publishable; publish actions (permission, size, zero-row refusal); migration SQL runner per role.

## Out of scope (v1)

Customer mobile app, cart page, wizard-style steps in a custom checkout, map/rider blocks (need new payload).

## Owner decisions (2026-11-04)

1. Build order Tracking → Thank-you → Checkout. ✔
2. Thank-you keeps the instant jump by default, with an owner setting: **Skip it** (instant), **Show it, then
   move on** (countdown, 3–60 s) or **Keep it on screen** (until Track order is tapped) —
   `tenants.confirmation_redirect` + `confirmation_redirect_seconds`. Owner noted they "still see the thank-you
   page most of the time" — investigate why. ✔
3. Sandboxed custom HTML allowed on tracking and thank-you; never on checkout; embed never. ✔

## As built (engine)

- Unpublished = the existing code path, untouched; the "standard design" is only the editor's starting point.
- One route `/[tenant]/admin/page-designer/<tracking|thank-you|checkout>` with page tabs; permission `store_setup`.
