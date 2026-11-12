# Customer app: order-status push notifications (P7)

Status: APPROVED + BUILT 2026-11-12. Owner: Accepted / Ready / Cancelled (+ Delivered for delivery),
ask after the first order, no Convex push, live test on sample-demo.
Migration 20261112150000 applied in three parts, all APPLIED + probed: `customer_app_push_1_tokens` +
`customer_app_push_3_claims_trigger` (RLS on, anon/authenticated 42501, trigger as written), then
`customer_app_push_2_token_functions` (owner-approved 2026-11-12; SECURITY DEFINER, search_path public,
EXECUTE service_role only: anon 42501; live on sample-demo's QA session: bad hash = bad_request, unknown
session = signed_out, malformed token = 23514, register twice = one row with the newer app_version on the
same session, remove = 1 removed, 0 left). `src/types/supabase.ts` regenerated.
Live (sample-demo, order #12 fb944d41, cancelled): trigger posted once (production answered 404: route not
deployed yet), local route claimed (order, confirmed), Expo refused the fake token (DeviceNotRegistered),
the token was pruned, replay = duplicate, Cancelled = no_devices. Simulator (Expo Go): card on the order
screen, iOS prompt, Allow hides it; simulated push shows a banner on Home, none on that order's screen,
tap opens the order from foreground and background.

Built differently from the draft below: the trigger posts to `/api/push/customer-order` (beside
notify-order; `/api/app/v1/*` requires a build's X-App-Id), and a push that arrives while the app is open
shows the system banner unless the customer is on that order's screen (no separate in-app banner).

## Why

Today a customer finds out their order is ready only by keeping the app open
on the tracking screen (it polls). Starbucks / ZUS send "Your order is
ready". This phase sends a push for each status change of an order placed
from the app.

## What can be built and proven before the accounts arrive

| Part | Needs an account? | Proven how, now |
|---|---|---|
| Token table, routes, trigger, sender, wording | No | Jest + PGlite + live on sample-demo |
| Expo's answer for a token | No (Expo's push API takes unauthenticated sends) | A fake token on sample-demo: Expo answers `DeviceNotRegistered` and the route prunes it |
| Tap a notification → the order screen | No | `xcrun simctl push` on the simulator (Expo Go) |
| The app getting a REAL token | **Yes**: an EAS project id (Expo org, P0) | Until then the app skips registration and logs why |
| A push reaching a real phone | **Yes**: P0 spike 3 (APNs key + Firebase) | Deferred to P0 |

## What changes

### Database (one migration, applied + probed like every other)

1. **`customer_device_tokens`**: one row per app install that allowed
   notifications.
   - Columns: `tenant_id`, `customer_id` (FK customers, ON DELETE CASCADE),
     `session_id` (FK customer_app_sessions, ON DELETE CASCADE), `expo_token`,
     `platform` (ios|android), `app_version`, `created_at`, `last_seen_at`.
   - Unique `(tenant_id, expo_token)`: re-registering the same install moves it
     to whoever is signed in now, so a shared phone never pushes the old
     account's orders.
   - Service role only (no anon / authenticated grants), like every other
     customer-app table.
   - Deleting the app account removes the tokens (cascade); signing out
     removes the session's token (cascade from the session row, or explicit
     delete when sessions are revoked rather than deleted).
2. **`customer_app_order_pushes`**: `(order_id, status)` primary key = the
   once-only claim, plus `outcome` (`sent`, `no_tokens`, `send_failed`,
   `not_app_order`, `status_not_pushed`…). Service role only. Same pattern as
   `messenger_order_updates`.
3. **Trigger `orders_customer_app_push`** on `public.orders`, after update of
   `status`, when the status really changed and `source = 'mobile'`. The
   function checks the order is in `customer_app_orders` (unique-index
   lookup on `tenant_id, backend, order_id`) and only then pg_net-posts
   `{order_id}` to `/api/app/v1/internal/order-push`. Exception guard: a
   broken queue never blocks an order write (same as the Messenger trigger).

### Server

4. **`POST /api/app/v1/me/push-token`** (signed-in session): register or
   refresh `{ token, platform, appVersion }`. Token shape checked
   (`ExponentPushToken[…]`), at most 5 installs per customer (oldest dropped),
   rate limited. **`DELETE`**: this install turns notifications off.
5. **`POST /api/app/v1/internal/order-push`** (called by the trigger,
   unauthenticated like `/api/push/notify-order`): trusts only the id.
   - Re-reads the order with the service role.
   - Finds its `customer_app_orders` row.
   - Claims `(order, status)`; a replay is silent.
   - Picks the wording (decision 1) and sends to that customer's tokens at
     that store through the existing `expo-delivery.ts`, which reads tickets
     AND receipts and prunes `DeviceNotRegistered` tokens.
   - Also updates `customer_app_orders.last_status`.
   - Pure decision code (`src/lib/app-api/push/`) with injected side effects,
     like `messenger/order-update.ts`.
6. **Payload**: title = store name, body = the status line, `data = { kind:
   'order', orderId }`, Android channel `orders`, sound default. No price, no
   items, no name in the text (lock screens are public).
7. **Sign-out** (`DELETE /auth/session`) and account delete remove that
   install's token in the same call.

### App (`customer-app/`)

8. Add `expo-notifications` (+ its config plugin, Android channel `orders`).
   `app.config.ts` reads `EAS_PROJECT_ID`; with none set (today) the app does
   not ask for a token.
9. **When it asks** (decision 2): the system prompt is preceded by a short
   in-app card ("Get a ping when your order is ready"). A "Not now" is
   remembered on the device; the app asks again only from Account.
10. **Account → Notifications**: the switch hidden after the simulator run
    becomes real: on = permission + registered token, off = `DELETE`. If the
    OS permission was refused, the row says so and opens Settings.
11. **Tap routing**: a tap on an order push opens `/order/[id]` (cold start
    and warm). A push received while the app is open refreshes that order's
    query and shows a quiet in-app banner, not a system alert.
12. The tracking screen keeps polling (a push can be late or blocked).

### Tests

- Unit: token schema, install cap, decide (which status → which words, per
  order kind), claim/replay, prune on `DeviceNotRegistered`, payload has no
  personal data, tap routing, permission-card state.
- PGlite: the migration as anon / authenticated (refused) / service role,
  trigger fires only for app orders and only on a real status change.
- Live (sample-demo): register a fake token through the API, change a
  throwaway app order's status, see one pg_net call, one claim row, Expo's
  `DeviceNotRegistered`, the token pruned. Then cancel the order and delete
  the throwaway rows.
- Simulator: `xcrun simctl push` an order payload → tap → order screen.

## Not in P7

- Marketing / announcement pushes from App Studio (needs its own consent
  wording and limits; later phase).
- Payment pushes (P6).
- Store-editable wording (fixed wording v1; App Studio can own it later).

## Decisions for the owner

1. **Which status changes push?** Recommended: Accepted, Ready, Cancelled for
   every order, plus "Delivered" for delivery orders only. "Preparing" is
   skipped (it comes seconds after Accepted on most stores and reads as
   noise). Ready wording follows the order kind: pickup "ready for pickup",
   dine-in "on its way to your table", delivery "out for delivery / rider is
   on the way".
2. **When to ask for permission?** Recommended: right after the first order is
   placed (on its tracking screen), never at app launch. Apple and Google both
   show the system prompt once; asking with a reason first gets more yeses.
3. **Convex stores?** Recommended: no push for Convex stores in P7 (their
   statuses change inside Convex, which our trigger can't see; dormant Convex
   stores are already moving to platform). The app keeps polling there.
4. **Live test on sample-demo** with a throwaway order that is cancelled
   afterwards (same as P4b). Recommended: yes.
