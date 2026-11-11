# Tenant branding, card templates and page layouts: rules for this folder

<!-- Moved verbatim from the root CLAUDE.md on 2026-11-11. The root file's rules for every change
     (Platform Supabase First, verification, conventions) still apply here. -->

## Tenant Branding

Tenants have 40+ customizable color fields applied via CSS variables (`src/lib/branding-utils.ts`). Card templates: classic, minimal, modern, elegant, bold, glass, polaroid, brutalist, magazine, zen, neon, storefront (fixed designs), plus the **flexible** set — showcase, atelier, kiosk, sticker, menuboard, arch, bistro — built on `card-templates/flex/card-kit.tsx` and tuned by six `card_*` knob columns (`src/lib/card-style.ts`; NULL/`auto` = template default, per-device via `mobile_overrides`). A new flexible design is flagged `isFlexible` in `CARD_TEMPLATES` and composes the kit. Page layouts add storefront, kiosk, rails, lookbook — scroll-based catalogs sharing `layouts/layout-parts.tsx` + `useCategoryScrollSpy`. The Studio pickers and the SmartMenu MCP (`get_branding` `designCatalog`, `src/lib/mcp/design-catalog.ts`) derive from `CARD_TEMPLATES` / `PAGE_LAYOUTS`, so registering a design there is the only edit. The `compact` card was retired 2026-09-24 (stores moved to `menuboard`).

Dev gotcha (fixed 2026-10-04): `next.config.ts` used to mark `/_next/static` `immutable` in dev too, and dev chunk names don't change, so browsers kept stale CSS/JS after edits. The header is now production-only; a browser that cached a chunk before the fix needs one hard refresh.
