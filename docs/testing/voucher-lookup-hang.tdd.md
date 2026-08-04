# TDD evidence — the register's voucher spinner that never stopped

## Source plan

No `*.plan.md`. Derived from a merchant screenshot: the POS "Add discount"
sheet mid-edit of a placed order, code `PWD` typed, the Apply button showing a
spinner — *"its just loading for now so lets fix it"*.

## What the investigation found

Three separate defects stack up behind that one spinner. Each alone can produce
it; all three are fixed.

| # | Defect | Effect |
|---|---|---|
| 1 | `lookupVouchers` had **no deadline** at all | A request that opens and never answers — a counter behind a captive portal, a dead uplink — spins forever. Every other failure already answered; "never" was the one case with no ending. |
| 2 | `DiscountSheet` cleared the spinner on the line *after* the await | A thrown lookup skips it. The spinner also disables Apply, so the register is stuck on that code until the app is killed. |
| 3 | The default host was the **apex domain**, which 307-redirects to `www` | Verified live: `https://webnegosyo.com/api/vouchers/lookup` → `307` → `https://www.webnegosyo.com/...` (`401` there, i.e. the route is alive and just wants a token). Doubles the round trip, on the request shape phone networking stacks replay least reliably: POST, with a body and an `Authorization` header. |

A fourth thing surfaced while fixing #3 and is worth recording separately.

### Every `expo-constants` mock in this app was inert

`jest.mock("expo-constants", () => ({ default: {...} }))` with no
`__esModule: true` does not survive the TypeScript default-import interop —
`Constants` binds to the whole mock object, so `Constants.expoConfig` is
`undefined` and the code under test silently takes its fallback.

Four suites were asserting a URL they believed came from the mock. They passed
because **the fallback string happened to be identical to the mocked one**.
Changing the fallback is what exposed it. Mocks fixed in
`voucher-service`, `tenant-logo`, `product-image-upload`, `pos-stock-notify`;
four other suites already had the flag.

## User journeys

1. As a cashier, I want a code that cannot be checked to *say so*, so that I am
   not left watching a spinner with a customer in front of me.
2. As a cashier, I want to retry a code after the connection drops, without
   restarting the app.
3. As a merchant, I want the register to reach the web app on the first
   attempt, not after a redirect.

## Task report

### 1. A deadline on the lookup

- Command: `npx jest lib/voucher-service.test.ts`
- RED (compile-time): `TS2554: Expected 2 arguments, but got 3.` ×4 — the
  options parameter carrying the deadline did not exist.
- GREEN: `Tests: 14 passed, 14 total`
- Guarantees: a request that never answers resolves to `[]` after the deadline;
  the socket is aborted rather than left running; the **session read counts
  against the same deadline** (a client mid token-refresh with no signal hangs
  there, not in `fetch` — a deadline that starts afterwards never fires); a
  server that answers promptly is not made to wait it out.
- Design note: aborted **and** raced, copying the reasoning
  `inventory-movement-service.ts` already documents — React Native's `fetch` has
  not always propagated an abort as a rejection, and relying on the abort alone
  is how a spinner outlives the timeout meant to end it. 8s, deliberately far
  below the 20s the stock write allows itself: that one may have landed and must
  not be re-sent lightly; a lookup only reads.
- Checkpoints: RED `7f104d7`, GREEN `68b35f5`.

### 2. A spinner that cannot outlive its call

- Command: `npx jest components/pos/DiscountSheet.test.tsx`
- RED: `Tests: 2 failed, 12 passed` — runtime. `findByText("Apply")` timed out
  because the button was still an `ActivityIndicator`.
- GREEN: `Tests: 14 passed, 14 total`
- Guarantees: a lookup that rejects still stops the spinner and shows a reason;
  the code stays retryable, and the retry succeeds once the connection returns.
- `lookupVouchers` is written not to throw and is now bounded too. This is the
  belt to that braces — the sheet must not depend on a promise a module three
  files away happens to keep today.
- Checkpoints: RED `test: add reproducer for a spinner stranded by a failed voucher lookup`, GREEN `fix: clear the discount spinner even when the lookup throws`.

### 3. The canonical host, in one place

- Command: `npx jest lib/web-app-url.test.ts`
- RED (compile-time): `TS2307: Cannot find module './web-app-url'`
- GREEN: `Tests: 4 passed, 4 total`
- Six modules each carried a private copy of `getWebAppUrl()` and all six
  defaulted to the redirecting apex domain. Now one module owns it.
- `app.config.ts` no longer defaults `extra.webAppUrl` at all — it passes the
  env var through or leaves it empty. Defaulting there would shadow the shared
  fallback and put the apex domain straight back in front of every server call.
- Guarantees: the default is the canonical host; a configured host still wins;
  a missing `expoConfig` falls back rather than crashing every server-mediated
  feature; a trailing slash cannot produce `//api/...`.
- Checkpoints: RED `b608aa6`, GREEN `8dbe124`.

## Test specification

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | A lookup that never answers gives up rather than spinning | `lib/voucher-service.test.ts:gives up on a request that never answers…` | unit | PASS | `npx jest lib/voucher-service.test.ts` |
| 2 | The abandoned request's socket is released | `…:releases the socket rather than leaving the request running` | unit | PASS | same |
| 3 | A hung session read is bounded by the same deadline | `…:counts the session read against the same deadline` | unit | PASS | same |
| 4 | A prompt server is not made to wait out the deadline | `…:answers immediately when the server does…` | unit | PASS | same |
| 5 | A thrown lookup still ends the spinner and explains itself | `components/pos/DiscountSheet.test.tsx:stops the spinner and gives the cashier a way forward` | component | PASS | `npx jest components/pos/DiscountSheet.test.tsx` |
| 6 | The code is retryable after a dropped connection | `…:leaves the code retryable rather than swallowing the sale` | component | PASS | same |
| 7 | The default host does not redirect | `lib/web-app-url.test.ts:defaults to the canonical host…` | unit | PASS | `npx jest lib/web-app-url.test.ts` |
| 8 | A configured host still wins | `…:prefers the host the build was configured with` | unit | PASS | same |
| 9 | A missing app config does not crash server calls | `…:falls back when the app config is missing entirely` | unit | PASS | same |
| 10 | A trailing slash cannot produce `//api/...` | `…:never leaves a trailing slash…` | unit | PASS | same |

## Coverage and known gaps

- `npx jest --silent -w 2` (merchant app) → **161 suites, 2552 tests, all passing**
- `npx tsc --noEmit -p tsconfig.json` → clean

Known gaps:

- **Not proven against the live hang.** The screenshot's spinner is explained by
  any of the three defects and all three are now closed, but nobody has
  reproduced the original on a handset and watched it recover. The most likely
  single culprit is #3 — the 307 is confirmed live by `curl`, and a redirected
  POST-with-body is exactly what a phone stack mishandles.
- **Requires a new build.** All three fixes are in the app bundle. A merchant on
  the current build still sees the spinner.
- **`EXPO_PUBLIC_WEB_APP_URL` should be checked in EAS.** If a build sets it to
  the apex domain explicitly, the configured value wins and the redirect
  returns.
- The `__esModule` fix restores real coverage to four suites that were quietly
  testing their own fallbacks. Their assertions were never wrong, but they were
  not proving what they appeared to prove.

## Merge evidence

| Stage | Commit |
|---|---|
| RED — lookup with no deadline | `7f104d7` |
| GREEN — deadline added | `68b35f5` |
| RED — spinner stranded by a throw | `test: add reproducer for a spinner stranded by a failed voucher lookup` |
| GREEN — spinner cleared in `finally` | `fix: clear the discount spinner even when the lookup throws` |
| RED — redirecting default host | `b608aa6` |
| GREEN — canonical host, one copy | `8dbe124` |
