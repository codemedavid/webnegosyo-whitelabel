# Merchant admin app: rules for this folder

<!-- Moved verbatim from the root CLAUDE.md on 2026-11-11. The root file's rules for every change
     (Platform Supabase First, verification, conventions) still apply here. -->

## Merchant admin app (`webnegosyo-app/`)

**Merchant Admin App** (`webnegosyo-app/`):
- Expo SDK 54 / React Native with Expo Router (Tab navigation)
- Single app (`com.webnegosyo.admin`) shared by all merchants, tenant resolved via Supabase `app_users` lookup after login
- Screens: dashboard (live order queue + daily stats), orders list, order detail, analytics (upsell/bundle), trends (revenue charts)
- Uses Convex for real-time order data, Supabase for auth
- Push notifications via `expo-notifications` + custom ringtone sound on new orders
- `useOrderAlerts` hook for in-app new order alerts
- **Reports tab = customer-first dashboard** (`app/(main)/reports.tsx`, `components/reports/`): revenue split into regulars / first-timers / unnamed, three levers (customers, came back, spend per order), "You know N% of your buyers", one-tap "Bring them back" moves (SMS presets via `newCampaignFromPresetHref`, Rewards), favourites by segment, best customers, then a "Dig deeper" list (`REPORTS_SECTIONS`). Numbers come from `overview.dashboard` on `POST /api/customers/hub-overview` (`src/lib/customer-dashboard.ts`, pure). The split is per ORDER (first ever order = first-timer, later = regular) — a per-customer "before the window" rule read 0% regulars on every store with recent named history. On for every platform store; Convex stores need `customer_hub_enabled` (`isCustomerHubOn`, mirrored in the app session). Guest list + Rewards hang under Reports (`REPORTS_DOORS`); the old `customer-hub` screen is gone.

## Receipt payment lines

The receipt engine (`webnegosyo-app/lib/receipt-layout.ts`, mirrored in `src/lib/receipt-layout.ts`; `tests/unit/receipt-layout-parity.test.ts` fails if the code drifts) prints discounts from `discount_data`/`customerData.discount`, and cash/change/ref from the caller OR the register's stored `customerData.pos` (stored cash only while cash − change still equals the total, so an edited order never reprints stale change). `amountPaid` (absent = say nothing) adds Paid / Balance due / Amount due; a fully paid cash sale adds nothing more. Classic output is unchanged for inputs without these fields.
