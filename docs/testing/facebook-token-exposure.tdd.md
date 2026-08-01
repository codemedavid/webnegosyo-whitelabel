# Facebook access tokens readable with the public anon key

**Branch:** `feat/platform-supabase-order-parity`
**Checkpoints:** `9ac31a4` (RED) → `fb10496` (GREEN) → `047a8cf` (remaining reads + migration)
**Source:** no plan file; found while reviewing PR #26 against the production database.

## The defect

`public.facebook_pages` had RLS disabled and `SELECT` granted to `anon`, while
holding `page_access_token` and `user_access_token`. The anon key ships in the
browser bundle, so anyone could `GET /rest/v1/facebook_pages?select=*` and read
every tenant's Facebook page token — enough to post as the merchant's page and
read their conversations. `public.messenger_sessions` was the same, exposing
customer PSIDs and cart contents.

Confirmed against production before the fix:

| table | RLS | anon SELECT |
|---|---|---|
| `facebook_pages` | disabled | granted |
| `messenger_sessions` | disabled | granted |

The grant was not gratuitous. Every route that needed a token asked for it
through the SSR client, which runs as `anon` on an unauthenticated request such
as the Facebook webhook. Revoking the grant without moving those reads first
would have stopped orders and auto-replies reaching merchants.

## User journeys

- As a merchant, I want my Facebook page token to be unreadable by anyone
  holding the public anon key, so a stranger cannot post as my page.
- As a customer, I want my Messenger PSID and cart contents to be unreadable by
  the public, so my order is not visible to strangers.
- As a merchant, I want orders and auto-replies to keep reaching Messenger
  while this is fixed, so the fix costs me no sales.

## Task report

**1. Lock the code side (`9ac31a4` → `fb10496`).**
A scan-based guardrail asserts that any file projecting a token column imports
the service-role client. Written as a scan, not a list, so a new route cannot
reintroduce the hole.

- Validation: `npx jest tests/unit/facebook-token-reads-use-admin-client.test.ts`
- RED: 1 failed, 2 passed — 7 offenders: `src/actions/facebook.ts`,
  `auth/facebook/disconnect`, `facebook/pages`, `messenger/send-cart`,
  `messenger/send-order-public`, `messenger/send-order`, `webhook`.
- GREEN: 3 passed, after every token read moved into
  `src/lib/facebook/page-tokens.ts` on `createAdminClient()`.

The service role bypasses RLS, so that module owns scoping: each function
narrows to one already-identified page, and the tenant-scoped variants keep
their `tenant_id` filter — without it, naming another merchant's page id would
return their token. Callers that had `verifyTenantAdmin` still have it.

**2. Move the last anon reads and write the migration (`047a8cf`).**
The webhook's session upsert and send-cart's PSID check also ran as `anon`;
both now use the service-role client.

- Validation: `npx jest`, `npx tsc --noEmit`, `npm run build`
- Result: 377 suites / 4,654 tests passed; no application-code type errors;
  build exit 0.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | The scan finds real token readers, so the checks below cannot pass vacuously | `facebook-token-reads-use-admin-client.test.ts:finds the routes...` | unit | PASS |
| 2 | Every token read uses the service-role client, not the anon key | `...:reads every token through the service-role client` | unit | PASS |
| 3 | No token is ever read from the browser client | `...:never reads a token from the browser client` | unit | PASS |
| 4 | The rest of the app is unaffected by the refactor | `npx jest` (377 suites) | unit + component | PASS |

## Coverage and known gaps

The database half is **not verifiable by unit test** — it is a grant and policy
change. It is proven by the before/after probe against production
(`has_table_privilege('anon', ...)`), which must be re-run after the migration
is applied. The guardrail test covers the code invariant that keeps it safe.

Not fixed here, found along the way: the `*_write_admin` RLS policies on
`order_types` and `payment_methods` compare `au.tenant_id` to itself, which is
always true and lets any admin write any tenant's rows. The new
`facebook_pages` policy does not reproduce it, but those two tables still carry
the bug.

## Deploy order — required

The migration `20260815120000_facebook_pages_and_messenger_sessions_rls.sql` is
**deliberately not applied**. Production still runs the old code that reads
tokens through the anon-role SSR client; revoking the grant first would break
order delivery.

1. Merge and deploy this branch.
2. Apply the migration.
3. Re-probe: `anon_select` on `facebook_pages` should be false for the token
   columns, and `messenger_sessions` should reject `anon` entirely.
4. Rotate every stored Facebook token — they must be assumed disclosed for as
   long as the grant existed.
