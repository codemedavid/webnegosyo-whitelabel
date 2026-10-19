# Branding Studio: Order tracking + Loyalty card editors

Status: BUILT (2026-10-19, owner approved "Ok lets work on this"). Migration applied + probed; uncommitted on the branch.
Branch: `feat/studio-tracking-loyalty` (worktree `.claude/worktrees/studio-tracking-loyalty`, from origin/main 2daf9f1e).

## Why

The order-tracking page (`/[tenant]/order/[orderId]`) and the loyalty stamp card have
no settings at all. Every colour is worked out from the global brand palette by
`buildTrackingTheme` (18 `--trk-*` variables), so an owner cannot change the hero, the
stamps, the timeline or the card without changing their whole store. A few parts are
hard-coded white (`status-hero.tsx` bars and chips, `pickup-qr-card.tsx` greys/greens,
the stamp card's white chips), so they could not be themed even with settings.

The same `buildTrackingTheme` paints the stamp card in three places: the tracking page,
checkout (`checkout-loyalty-progress.tsx`) and the `/[tenant]/loyalty` wallet page.

## What the owner gets

Two new Studio screens, both at the end of the journey bar:
Welcome › Menu › Item › Cart › Checkout › **Order status** › **Loyalty card**.

### Order status screen
| Section | Settings |
|---|---|
| Page | background, background glow (on/off + colour), card background, card border, text, muted text, corner style (rounded / soft / square) |
| Header | background, text, "Live" badge colour |
| Status banner | style (gradient / solid / soft tint / outline), colour, second gradient colour, text, progress-bar track + fill, cancelled colour |
| Ring-me button | background, text, border; "armed" colour |
| Timeline | done, current, upcoming colours; show/hide |
| Order summary | total colour, line text |
| Pickup code | card background, border, text (replaces the hard-coded greys/greens) |
| Ready alert | background, text, button |
| Layout | loyalty card above / below the status banner |
| Wording | status headlines + descriptions (received, preparing, ready, completed, cancelled), ring-me button, back-to-menu |

### Loyalty card screen (one look everywhere: tracking, checkout, /loyalty page)
| Section | Settings |
|---|---|
| Card | background, border, text, muted text, header band style (brand / soft / plain) + colours |
| Stamps | shape (circle / rounded square), earned fill, earned mark (logo / check), empty border, next-stamp highlight, number badge |
| Rewards | reward badge colour, reward-ready colour, progress bar (points programs) |
| Buttons | join/claim button background + text, wallet buttons style |
| Celebration | confetti on/off |
| Wording | card title, join prompt, claim button, "reward ready" line |

Every colour left blank keeps today's look (follows the brand), so no live store changes
when this ships. Readability floor: the same "Hard to read… Fix" check the other screens
have, applied to every text/background pair here.

### Preview (what makes it editable, not just configurable)
- The Studio previews the REAL tracking page with a sample order — no real order or token
  needed (`/[tenant]/order/studio-preview?brandingPreview=1`, sample data only, nothing read
  from orders).
- "Show" bar to switch the sample: Received / Preparing / Ready / Completed / Cancelled,
  Scheduled, Pickup code, Ring-me armed, Ready alert; loyalty: Join prompt / Collecting /
  Reward ready / Points program / Wallet page.
- Uses the store's real loyalty offer when it has one, else a sample 8-stamp card, so a
  store without loyalty can still design it.
- Tap-to-edit: every part tagged with `data-branding-scope` so tapping the hero, a stamp,
  the timeline, etc. opens just its settings; wording editable in place (double-click).

## How it's built

- **Storage**: ONE new jsonb column `tenants.tracking_style` (nullable), edited as Studio
  virtual fields `tracking_style.<key>` through the existing `createJsonColumnFields`
  (same as `section_schemes`). Strict zod schema of known keys (hex colours / enums /
  booleans) in `saveBrandingAction`. Not a privileged column. Wording goes into the
  existing `storefront_labels` with two new screens (`tracking`, `loyalty`).
- **Theme**: `buildTrackingTheme(branding, style)` — the one place colours are worked
  out; owner values override, blanks fall back to today's derivation; contrast floor
  applied. New variables for the parts that had none (header, hero 2nd colour, timeline
  states, stamps, loyalty band, pickup card, alert). Hard-coded whites/greys replaced by
  variables.
- **Reads**: add `tracking_style` to `tenant-storefront-select.ts`; tracking page,
  checkout loyalty panel and `/loyalty` page pass it in. Preview: client merges drafts via
  `useBrandingPreviewTenant` and rebuilds the theme.
- **DB**: migration `2026101912xxxx_tenants_tracking_style.sql`, applied to the platform
  project via MCP and probed (column exists, anon storefront read OK, authenticated admin
  write OK, other-tenant write refused), types regenerated via MCP.

## Tests (TDD)
- `tracking-theme` unit: blanks = today's exact output (no visual change for live stores);
  each override reaches its variable; contrast floor.
- Contract test: every `var(--trk-*)` read is defined (same idea as the PDP contract test);
  no hard-coded colours left in tracking/loyalty components.
- Consumer test: every `tracking_style` key changes something a component reads
  (mutation-checked, like `product-detail-field-consumers`).
- Labels consumer test extended to the new screens.
- Schema test: unknown keys / bad colours refused.
- Browser QA in the Studio (phone + desktop): drive every field and check the preview DOM,
  plus a real order's tracking page on a platform store.

## Not included
- Customer mobile app (`mobile/`) order status screen — web only.
- Apple/Google Wallet pass colours (separate pipeline with its own sync).
- Named versions / per-device (phone vs desktop) values for these screens — one look on
  both, like labels.
