# Customer app: rules for this folder

<!-- Moved verbatim from the root CLAUDE.md on 2026-11-11. The root file's rules for every change
     (Platform Supabase First, verification, conventions) still apply here. -->

## Customer app (`mobile/`)

**Customer App** (`mobile/`):
- Expo SDK 54 / React Native 0.81.5 with Expo Router (Stack navigation)
- White-labeled per tenant — each merchant gets their own branded build (name, icon, splash, colors)
- Screens: home, menu (category sidebar + grid), item detail, cart, checkout, order confirmation, order status
- State: Zustand stores (cart, order, app, customer history) + React Query for server data
- Theme: `theme/provider.tsx` applies tenant branding via ported `src/lib/branding-utils.ts`
- Build: `scripts/build-tenant.ts` fetches tenant → generates icons via Sharp → EAS Build
- CI: `.github/workflows/build-tenant.yml` (workflow_dispatch)
