# TDD Evidence — Scan-to-Confirm Pickup

**Source plan**: none on disk. Journeys were derived during the `/ecc:plan` run
that preceded this work and are restated below.

**Branch**: `feat/android-sms-followups`
**Date**: 2026-08-04

## User journeys

1. As a **customer collecting a pickup order**, I want a code on my order page,
   so staff can confirm I am the right person without me reciting an order
   number.
2. As **counter staff**, I want to scan that code with the app I already use,
   so I can see whose order it is and what is in it before handing it over.
3. As **counter staff**, I want confirming to take a deliberate gesture, so a
   thumb brushing the screen never marks an order collected.
4. As **counter staff**, I want a forged, cancelled, or other-store code to be
   refused with a reason, so I never hand food to the wrong person.
5. As a **merchant**, I want a delivery or dine-in order to show no such code,
   so nobody confirms a collection that never happened.

## Design decisions worth recording

- **Verification is server-side.** The QR carries the order's existing HMAC
  tracking token; `API_SECRET` stays on the web server. The app forwards the
  triple to the pre-existing `GET /api/orders/track`, which verifies
  timing-safely, resolves Convex-vs-Supabase itself, and returns the order for
  staff to eyeball. This is stronger than the cart-handoff QR, which is
  deliberately unauthenticated.
- **Collection is stored as `delivered`.** A new `picked_up` status would touch
  the Convex validators, `src/types/database.ts`, the app's `OrderStatus`, the
  web stepper, and every rollup, for a cosmetic gain. The UI says "pickup"; the
  store says delivered.
- **Order type is resolved, not string-matched.** `orders.order_type` is a
  snapshot written as `type ?? name ?? ''`, so it degrades to a merchant-
  editable label. The `order_type_id` FK is the authority; an unresolvable
  label yields `null` and the QR stays hidden (fail closed).
- **No migration, no schema change.**

## Task report

| Task | Summary | Validation run | RED | GREEN |
|---|---|---|---|---|
| Pickup payload in both codecs | Added `QrPickupPayloadV1` + encode/decode to the web codec and its RN mirror, plus a discriminator guard so the two kinds never rely on a checksum collision to stay apart | `npx jest tests/unit/qr-pickup-codec.test.ts`; `npx jest lib/qr-pickup-codec.test.ts` | 7 failed — `encodePickupQr is not a function` | 8 + 8 passed |
| Order-type resolution & QR gating | `resolveOrderTypeKind` / `shouldShowPickupQr` | `npx jest tests/unit/pickup-qr-gating.test.ts` | suite failed — `Cannot find module '@/lib/pickup-qr-gating'` | 11 passed |
| Tracking service carries the kind | `orderTypeKind` added to `TrackingData` on both the Convex and Supabase fetch paths, resolved via `order_types.type` | `npx tsc --noEmit`, `npm run lint` | n/a (plumbing behind the tested predicate) | clean |
| Customer-facing QR card | `PickupQrCard` mounted on the tracking page behind `shouldShowPickupQr` | `npx tsc --noEmit`, `npx eslint` | n/a | clean |
| Ticket verification | `verifyPickupTicket` maps each HTTP outcome to an actionable result | `npx jest lib/pickup/verify.test.ts` | suite failed — module not found | 13 passed |
| Confirmation guards | `evaluatePickupTicket` — store check first, then cancelled / already-collected / not-ready | `npx jest lib/pickup/guards.test.ts` | suite failed — module not found | 8 passed |
| Two-kind scan dispatch | `classifyScannedQr` — only `not_pickup` falls through to the handoff decoder | `npx jest lib/pickup/dispatch.test.ts` | suite failed — module not found | 5 passed |
| Slide control extraction | `SlideAction` + `isSlideComplete`, replacing the private copy in `scan.tsx` | `npx jest` (full app suite) | n/a (behaviour-preserving refactor) | 2258 passed, unchanged |
| Scan screen pickup branch | verify → confirm panel → slide → `updateOrderStatus` | `npx tsc --noEmit`, `npx jest`, `npx eslint` | n/a | clean, 2263 passed |

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | A pickup ticket round-trips through encode/decode with its fields intact | `tests/unit/qr-pickup-codec.test.ts:round-trips a pickup ticket` | unit | PASS |
| 2 | Rewriting a field while keeping the checksum is rejected | `…:reports checksum when any field is tampered with` | unit | PASS |
| 3 | A cart-handoff QR is not mistaken for a pickup ticket | `…:rejects a cart-handoff payload as not a pickup ticket` | unit | PASS |
| 4 | A pickup ticket is not mistaken for a cart order (would create an empty order) | `…:does not decode a pickup ticket as a cart-handoff order` | unit | PASS |
| 5 | The live cart-handoff flow decodes exactly as before | `…:leaves the existing cart-handoff decode path unchanged` | regression | PASS |
| 6 | The RN codec encodes byte-identically to the web codec | `webnegosyo-app/lib/qr-pickup-codec.test.ts:encodes byte-identically` | cross-runtime | PASS |
| 7 | The joined order-type row beats the renameable snapshot label | `tests/unit/pickup-qr-gating.test.ts:prefers the joined order_types.type` | unit | PASS |
| 8 | An unmappable label yields null rather than a guess | `…:returns null for a renamed label it cannot map` | unit | PASS |
| 9 | The QR is hidden on delivery, dine-in, delivered, cancelled, and unresolved orders | `…:hides the QR …` (4 cases) | unit | PASS |
| 10 | A rejected token is reported as invalid, never as a valid order | `webnegosyo-app/lib/pickup/verify.test.ts:reports an invalid token` | unit | PASS |
| 11 | A network failure is distinguishable from a rejected token | `…:reports offline when the request cannot be made` | unit | PASS |
| 12 | A 200 response that is not an order does not produce a confirm button | `…:rejects a 200 response that is not an order` | unit | PASS |
| 13 | A missing `webAppUrl` reports a config problem and makes no request | `…:reports a configuration problem when no web app url is set` | unit | PASS |
| 14 | A ticket from another store is blocked before anything is said about the order | `webnegosyo-app/lib/pickup/guards.test.ts:checks the store before the status` | unit | PASS |
| 15 | A superadmin with no store in scope cannot confirm | `…:blocks when the session has no store in scope` | unit | PASS |
| 16 | A cancelled order is blocked | `…:blocks a cancelled order` | unit | PASS |
| 17 | A double scan reads as "already collected", not as an error | `…:reports an already-collected order as done` | unit | PASS |
| 18 | A not-yet-ready order warns but remains confirmable | `…:allows confirming an order that is still being prepared` | unit | PASS |
| 19 | A damaged code reports "damaged", not "wrong kind" | `webnegosyo-app/lib/pickup/dispatch.test.ts:reports a damaged code as unreadable` | unit | PASS |
| 20 | The confirm gesture never fires before the track is measured | `webnegosyo-app/lib/slide-gesture.test.ts:never completes before the track has been measured` | unit | PASS |
| 21 | A small accidental drag does not confirm | `…:does not complete on a small accidental drag` | unit | PASS |

## Coverage

```
# web — npx jest tests/unit/qr-pickup-codec.test.ts tests/unit/pickup-qr-gating.test.ts \
#   --coverage --collectCoverageFrom='src/lib/{pickup-qr-gating,qr-order-codec}.ts'
 pickup-qr-gating.ts |     100 |      100 |     100 |     100
 qr-order-codec.ts   |   92.69 |    74.19 |     100 |   92.69

# app — npx jest lib/pickup lib/slide-gesture --coverage
 slide-gesture.ts |     100 |      100 |     100 |     100
 guards.ts        |     100 |      100 |     100 |     100
 dispatch.ts      |    90.9 |     100 |     100 |    90.9
 verify.ts        |   94.28 |   75.75 |      80 |   96.42
```

All new modules clear the 80% line threshold.

## Full-suite results

- `webnegosyo-app`: **140 suites, 2263 tests, all passing**; `npx tsc --noEmit` clean.
- web: `npx tsc --noEmit` reports **no errors in any touched file** (pre-existing
  errors elsewhere in `tests/` and `sms/` are untouched and predate this work).
- `npm run lint`: no findings in any file changed here.

## Known gaps

- **No end-to-end run against a live tenant.** The flow has not been exercised
  on a real handset against a real order — that is the remaining verification
  step before this ships.
- `verify.ts:57` (the `defaultWebAppUrl` fallback) is uncovered; it reads
  `expo-constants`, which is mocked in tests, and every test injects its URL.
- **The customer mobile app (`mobile/`) shows no pickup QR** — web tracking page
  only. It has no QR library; adding one is a follow-up.
- **Web admin has no scanner** (no camera flow exists there today).
- **Replay is possible by design**: the tracking token is deterministic per
  order, so a photographed code still scans. The defenses are that staff see
  the customer name before swiping, and a collected order rescans as "already
  collected".

## Merge evidence

Checkpoint commits on `feat/android-sms-followups`, oldest first:

```
5facda4 test: add reproducer for the pickup-ticket QR codec            (RED)
826726b feat: add the pickup-ticket QR payload kind to both codecs     (GREEN)
3e4c107 test: add reproducer for pickup QR gating …                    (RED)
4664c2d feat: resolve order-type kind and gate the pickup QR           (GREEN)
6f9e054 feat: show a scan-to-collect QR on pickup order tracking
5a0a4f2 test: add reproducers for pickup ticket verification and guards (RED)
bb96340 feat: verify scanned pickup tickets and gate confirmation      (GREEN)
871ad01 refactor: extract the slide-to-confirm control for reuse
d066805 test: add reproducer for dispatching between the two QR kinds  (RED)
c8d9507 feat: confirm pickup by scanning the customer's collection code (GREEN)
```

If these are squashed, this file is the surviving record of what was verified.
