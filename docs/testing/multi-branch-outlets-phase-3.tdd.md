# TDD evidence — Multi-branch outlets, Phase 3 (storefront selection)

**Branch**: `feat/platform-supabase-order-parity`
**Checkpoints**: `397fe5e` (RED) → `16d8706` (GREEN) → this commit
**Predecessors**: [Phase 1](./multi-branch-outlets-phase-1.tdd.md) · [Phase 2](./multi-branch-outlets-phase-2.tdd.md)

The customer-facing half. A tenant with the flag on and two or more active
branches now gets a branch chooser before the menu; everyone else gets exactly
the storefront they had yesterday.

## Source plan

The multi-branch spec supplied with `/ecc:plan` — sections **Storefront flow**,
**Deep links** (`?outlet=` form), and **State, persistence, and edge cases**.

Scope notes for this phase:

- Deep links ship as **`?outlet={slug}` only**. The `/b/{slug}` route form is
  Phase 4, and bare root-level slugs remain rejected (decision **B**). This is
  the safer of the two forms and the one the spec names for QR codes.
- **Promo banner** reuses the existing `flash_screen_*` tenant fields rather
  than adding new ones. A tenant that has never set them renders no gap.
- **Analytics outlet context** is Phase 5, with the order write-through.

## User journeys

1. As a **customer of a two-branch shop**, I want to pick a branch, so my order
   goes to the right kitchen.
2. As a **customer who allows location access**, I want the nearest branch
   surfaced first.
3. As a **customer who denies it, ignores the prompt, or has no GPS**, I want
   the branch list anyway, immediately.
4. As a **returning customer**, I want my branch remembered so I am not asked
   every visit.
5. As a **customer scanning a branch QR code**, I want to land on that branch's
   menu with no intro flow.
6. As a **customer whose usual branch has closed**, I want to be asked again
   rather than shown a dead branch.
7. As a **customer of a single-location shop**, I want to never see any of this.
8. As **every existing tenant**, I want the storefront byte-for-byte unchanged.

## Task report

### Task 1 — The selection decision, in one testable place

`src/lib/outlets/outlet-selection.ts` holds both persistence and the decision,
because together they answer one question: show the menu, or ask first?

```
RED   Cannot find module '../../src/lib/outlets/outlet-selection'
GREEN PASS tests/unit/outlets-selection.test.ts (38 tests)
```

**Guarantees**: every awkward state from the spec resolves deterministically —
flag off, zero branches, one branch, unknown link, deactivated branch, a branch
that stopped supporting the stored mode, and a branch switch with a full cart.

### Task 2 — Auto-detection can never block

`src/lib/outlets/geolocation.ts` wraps `getCurrentPosition` in a 4s timeout of
our own.

```
RED   Cannot find module '../../src/lib/outlets/geolocation'
GREEN PASS tests/unit/outlets-geolocation.test.ts (8 tests)
```

The wrapper exists because of one specific browser behaviour: a customer who
neither allows nor denies the permission prompt leaves `getCurrentPosition`
**pending forever**, and `positionOptions.timeout` does not reliably cover that
case. Test #33 pins it — a geolocation that never calls back still resolves.

**Guarantees**: granted, denied, unavailable, timed out, unsupported, throwing,
and NaN-coordinate cases all resolve, and a late answer after the timeout
cannot change the already-settled result.

### Task 3 — Wiring, gated at every step

`use-outlet-selection.ts` supplies browser inputs to the pure resolver;
`outlet-gate.tsx` returns `null` unless the flag is on **and** there are ≥2
active branches; `menu-server.tsx` runs the outlets query **only** when the flag
is on.

`multi_branch_enabled` was added to `TENANT_STOREFRONT_SELECT`. Without it the
flag would read `undefined` on the storefront and the feature would be silently
dead — the exact failure recorded in this repo's
`branding-mobile-overrides-select-gap` and `web-multi-select-modifier-groups`
history.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | The stored choice is scoped per tenant | `outlets-selection.test.ts:scopes the key to the tenant` | unit | PASS |
| 2 | A selection round-trips | `…:round-trips a selection` | unit | PASS |
| 3 | A selection survives to the last millisecond of its 7 days | `…:still returns a selection just before it expires` | unit | PASS |
| 4 | An expired selection is dropped and deleted | `…:drops a selection once it expires`, `…:clears the expired entry` | unit | PASS |
| 5 | Corrupt JSON, wrong shape, bad mode, non-object, and null all read as "no selection" | `…` ×5 | unit | PASS |
| 6 | Storage that throws (Safari private mode) never breaks the page | `…:never throws when storage itself is unavailable` | unit | PASS |
| 7 | Flag off does nothing and clears leftovers | `…:does nothing when the flag is off`, `…:tells the caller to clear storage` | unit | PASS |
| 8 | Zero branches skips the flow | `…:skips the picker for a tenant with no branches yet` | unit | PASS |
| 9 | One branch auto-selects instead of asking | `…:auto-selects the only branch` | unit | PASS |
| 10 | One active branch among inactive ones counts as single-branch | `…:treats one active branch…` | unit | PASS |
| 11 | `?outlet=` beats the stored choice | `…:overrides a different stored selection` | unit | PASS |
| 12 | Link slugs match case-insensitively | `…:matches the slug case-insensitively` | unit | PASS |
| 13 | An unknown or deactivated link falls back to the picker, never an error | `…:falls back to the picker for an unknown slug`, `…:ignores a link to a branch that has been switched off` | unit | PASS |
| 14 | A valid stored choice skips the picker | `…:reuses a valid stored selection` | unit | PASS |
| 15 | A deactivated or deleted stored branch re-prompts and is cleared | `…:re-prompts when…` ×2, `…:clears the dead stored selection` | unit | PASS |
| 16 | A branch that stopped supporting the stored mode re-prompts | `…:re-prompts when the stored branch stopped supporting the stored mode` | unit | PASS |
| 17 | Pickup still works at a branch that stopped delivering | `…:honours a stored pickup choice…` | unit | PASS |
| 18 | The picker offers only active branches, in merchant order | `…:offers only active branches`, `…:orders the choices…` | unit | PASS |
| 19 | Equal sort_order breaks by name, so the list never shuffles | `…:breaks a sort_order tie by name` | unit | PASS |
| 20 | The outlets array handed in is never mutated | `…:does not mutate the outlets array` | unit | PASS |
| 21 | Switching branches with a non-empty cart requires confirmation | `…:flags that the cart must be confirmed` | unit | PASS |
| 22 | No cart prompt when the branch is unchanged or the cart is empty | `…` ×2 | unit | PASS |
| 23 | Granted location returns coordinates | `outlets-geolocation.test.ts:returns the coordinates` | unit | PASS |
| 24 | Denial is distinguished from unavailability | `…:reports a denial`, `…:reports an unavailable position` | unit | PASS |
| 25 | A browser that never answers times out at 4s | `…:gives up on a browser that never answers` | unit | PASS |
| 26 | A late answer cannot change the settled result | `…:ignores a late answer` | unit | PASS |
| 27 | Missing or throwing geolocation resolves cleanly | `…:resolves immediately when the browser has no geolocation`, `…:treats a throwing geolocation API as unavailable` | unit | PASS |
| 28 | NaN coordinates are rejected, not ranked against | `…:rejects nonsense coordinates` | unit | PASS |

## Coverage

```
npx jest --coverage --collectCoverageFrom="src/lib/outlets/**/*.ts" --testPathPatterns="outlets-"

 geolocation.ts                 |     100 |      100 |     100 |     100
 in-memory-outlet-repository.ts |     100 |      100 |     100 |     100
 multi-branch-flag.ts           |     100 |      100 |     100 |     100
 nearest-outlet.ts              |     100 |      100 |     100 |     100
 outlet-form.ts                 |     100 |      100 |     100 |     100
 outlet-repository.ts           |     100 |    97.82 |     100 |     100
 outlet-selection.ts            |     100 |      100 |     100 |     100
 reserved-slugs.ts              |     100 |      100 |     100 |     100
 supabase-outlet-repository.ts  |       0 |        0 |       0 |       0

Tests: 218 passed (7 suites)
```

Every logic module is at 100% statements and lines. `supabase-outlet-repository.ts`
still needs a live database (unchanged from Phases 1–2).

## Regression proof — and one real regression caught

Full suite: `252 passed`, `Tests: 8 skipped, 3066 passed, 3074 total` — up from
3024 in Phase 2.

**The suite caught a defect mid-phase.** After wiring the outlets query into
`getMenuData`, `tests/menu-ssr.test.ts` failed with
`TypeError: Cannot read properties of undefined (reading 'error')`. Two separate
problems, both fixed:

1. **Product code was fragile.** It read `outletsResult.error` unguarded. If the
   fourth `Promise.all` entry is ever absent, that throws — and a throw in
   `getMenuData` blanks the entire menu. That is precisely the failure mode
   commit `38b4ede` ("stop a failed dish load from rendering as an empty menu")
   fixed for the dish query. Now optional-chained: a missing or failed branch
   query degrades to "no branches".
2. **The test mocks were stale.** Two of them stubbed `Promise.all` with three
   entries; the real call now makes four. Updated to match reality rather than
   deleted.

Types: 0 errors under `src/`. 24 test-file errors — the same pre-existing set as
Phases 1–2. (One new error was briefly introduced by my own geolocation test,
where TypeScript narrowed a closure-assigned variable to `never`; fixed in the
test by holding the callback in an object.)

Lint: clean on all nine changed/added files.

For a tenant with `multi_branch_enabled` false:

| Surface | Behaviour |
|---|---|
| `getMenuData` | `outletsQuery` short-circuits to `Promise.resolve` — **no branch query is issued** |
| `OutletGate` | Returns `null` before any hook runs |
| Rendered menu | Unchanged; the gate is a sibling, not a wrapper |
| localStorage | Nothing written; any leftover key is cleared |

## Known gaps

1. **No component test** for `outlet-splash.tsx` / `outlet-gate.tsx`. All
   decision logic lives in the two 100%-covered pure modules; the components are
   presentation and wiring. Covered by the manual checklist.
2. **`/b/{slug}` deep links** are Phase 4; only `?outlet=` works today.
3. **`requiresCartConfirmation` is computed but not yet acted on.** The resolver
   reports it (tests #21–22); the confirmation dialog and cart re-validation are
   Phase 6. Until then a deep link that changes branch does not clear the cart —
   which is the current, safe behaviour, since all branches share one menu.
4. **Orders do not record `outlet_id` yet** — Phase 5. The column exists and is
   nullable, so nothing is inconsistent in the meantime.
5. **`supabase-outlet-repository.ts` untested** (see Coverage).

## Manual QA checklist

Requires the migration (applied) and a tenant with the flag on and ≥2 branches.

**Flag off (regression — run first, on a real existing tenant)**
- [ ] Menu renders exactly as before; no splash, no flicker.
- [ ] DevTools → Network: no request for branches.
- [ ] DevTools → Application → Local Storage: no `selected_outlet_*` key.

**One branch only**
- [ ] With the flag on and a single active branch, the menu loads directly — no picker.

**Two or more branches**
- [ ] First visit shows the branch chooser over the menu.
- [ ] Allow location → branches reorder nearest-first with distances.
- [ ] **Deny** location → the list is usable immediately, in merchant order.
- [ ] **Ignore** the permission prompt entirely → the list is usable within ~4s.
- [ ] Pick a branch → the existing menu appears, unchanged.
- [ ] Reload → not asked again.
- [ ] Switch to Delivery at a branch with a small radius from far away → that branch is disabled with an "outside delivery area" note.
- [ ] All branches out of delivery range → the explanatory line appears and pickup is still reachable.

**Deep links**
- [ ] `/{tenant}/menu?outlet={slug}` → straight to the menu, no chooser.
- [ ] `?outlet=NONSENSE` → chooser with "that branch link is no longer available", not a 404 or blank page.
- [ ] `?outlet=` pointing at a branch you then hide in admin → chooser reappears.

**Persistence**
- [ ] Hide the branch you selected, reload the storefront → asked to choose again.
- [ ] Safari private mode → the flow still works (asked each visit).

## Merge evidence

- **RED** `397fe5e` — both suites failed to resolve their modules (compile-time
  RED). `Test Suites: 2 failed, Tests: 0 total`.
- **GREEN** `16d8706` — `Test Suites: 2 passed, Tests: 42 passed`. Full suite
  `3066 passed` after fixing the `menu-ssr` regression described above.
- **Refactor/coverage** — this commit: four tests added to close the last
  branches in `outlet-selection.ts`, taking it to 100%.

**Concurrent-session note.** As in Phases 1–2, another Claude Code session
shares this working tree. All three checkpoints are reachable from `HEAD` on
`feat/platform-supabase-order-parity`, and only the listed paths were staged.
