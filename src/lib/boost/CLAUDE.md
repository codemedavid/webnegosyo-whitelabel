# Boost Sales: rules for this folder

<!-- Moved verbatim from the root CLAUDE.md on 2026-11-11. The root file's rules for every change
     (Platform Supabase First, verification, conventions) still apply here. -->

## Boost Sales (combos, upgrades, pairings, cart last call)

One merchant screen, `/[tenant]/admin/boost-sales` (sidebar: Menu → Boost Sales, never hidden), organised by the four moments a diner meets an offer. Every offer lives at exactly one moment:

| Moment | Offer | Stored in | Diner UI |
|---|---|---|---|
| On the menu | Combo | `bundles` + `bundle_slots` (+ `bundle_slot_price_overrides` = per-choice surcharges) | combo card via `bundle-adapter.ts` |
| On the item page | Upgrade (+ combos containing the item) | `upsell_pairs` `pair_type='upgrade'` | inline `ItemOffers` — never a takeover |
| Right after adding | Pairing | `upsell_pairs` `pair_type='complementary'`, one row per source × target | `AddedSheet` bottom sheet |
| In the cart | Last call | `tenants.checkout_upsell_*` + `menu_items.show_in_checkout_upsell` (picks; none = automatic) | inline `CartOffersSection` — checkout is never gated |

- **Engine** (`src/lib/boost/`, pure + tested in `tests/unit/boost/`): `menu-roles` (main/side/drink/dessert from category + item names, EN + Filipino), `basket-stats` (co-occurrence from real orders), `ideas` ("Ready to go" drafts; anchors on mains, or on drinks for cafés), `combo-draft` (editor "picks" ⇄ bundle slots), `pairing-groups` (rows ⇄ offers), `pricing` (charm prices, savings).
- **Server**: `workspace.ts` loads everything (order history only for `resolveOrderBackend === 'platform'`, paged past the 1000-row API cap); `writes.ts` + `src/app/actions/boost.ts` do every write and refresh Redis + storefront caches together. Client combo lines carry slot provenance and proposed surcharges; checkout verifies complete tenant-owned combos and allocates their authoritative total across dish lines. Boost performance reports combo orders; allocated dish revenue is not presented as a separate combo revenue metric.
- **Merchant UI** `src/components/admin/boost/`: journey rail, ideas (one tap + Undo), sections, and ONE editor sheet (`EditorShell`) with live previews that render the real diner components from `src/components/customer/offers/`.
- **Self-serve**: `setBoostEnabledAction` flips `menu_engineering_enabled` + `bundles_enabled` via the service role (the tenant-column guard trigger blocks the `authenticated` role). Without the flag the page is the welcome screen.
- **Theming**: diner offers never hard-code colours — `offer-theme.ts` (modal colours; the cart row uses `checkout_modal_*`).
- Analytics sources kept for report continuity: `inline_upgrade` (item page), `post_add` (after adding), `checkout_modal` (cart row).
- `/admin/bundles/new` and `/admin/bundles/[id]` redirect into the Boost Sales editor (`?new=combo`, `?edit=combo:<id>`). Pairing rules (`pairing_rules_enabled`) still feed the after-add moment as a fallback but have no admin UI.
- **AI generations** (`src/lib/boost/ai/`, `src/app/actions/boost-ai.ts`): `FREE_BOOST_AI_GENERATIONS` (3, lifetime per store) runs via OpenRouter (`src/lib/ai/openrouter.ts`, same models as the menu parser). The model sees short item refs (`i12`), never UUIDs; `proposals.ts` drops anything that fails validation. Runs + proposals live in `boost_ai_generations` / `boost_ai_proposals` — service-role writes only (the log IS the quota); `claim_boost_ai_generation` reserves a slot atomically and failed runs don't count; only `source='ai'` rows count (onboarding's launch combos are a `source='launch'` generation). Proposals go pending → approved → applied (never live without approval); apply reads the payload from the DB and goes through the same `ideaToWrite` mapping as one-tap ideas.
- **Picked together** (`pair-insights.ts` share/support/lift, `order-baskets.ts` reads baskets from the store's real backend — platform, tenant Supabase or Convex `orders:getAllOrderItemsInternal`, Redis-cached 10 min) renders on Boost Sales and Product Analytics.
