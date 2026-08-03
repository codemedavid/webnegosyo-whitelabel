# TDD Evidence — Customer Management, Phase 4 (attach a guest at the POS)

**Source plan**: inline plan agreed in-session (no `*.plan.md` artifact).
**Prior phases**: [Phase 1](./customer-management-phase-1.tdd.md) (data layer),
[Phase 3](./customer-management-phase-3.tdd.md) (capture gap).
**Scope**: picking a known guest for a counter sale, and quick-creating one from
the register. Phase 2 (the customer management screen) is **not** covered — see
"Why Phase 2 was skipped" below.

## Why Phase 2 was skipped

Phase 2's central task is reworking `webnegosyo-app/app/(main)/customers.tsx`.
That file has **uncommitted in-flight changes from a concurrent session**
(`git status` shows it modified, importing untracked new components
`components/sms/{GuestRow,CampaignCard,ReachBar}` and `components/Icon.tsx`).
Editing it would have collided with work this session does not own.

Phase 4 was unblocked by Phase 3 and touches a disjoint file set, so it was done
instead. Phase 2 remains outstanding and should be picked up once the other
session's `customers.tsx` rework has landed.

## User journeys

1. As a cashier, I want to attach a regular to the sale I am ringing up, so
   their spend and visits actually count towards their profile.
2. As a cashier, I want to save the number a new guest just read out to me
   without leaving the tender screen, so I do not lose the sale to admin.
3. As a cashier, I want to say a sale is a walk-in in one tap, because most of
   them are.
4. As a merchant, I never want one sale's guest to be credited with the next
   customer's order.

## Task report

### Task 1 — What an attachment writes onto the sale

Added `webnegosyo-app/lib/customers/pos-attachment.ts`. The register writes the
guest's **contact**, not their id: the contact is what the capture path resolves
against, so identity is decided in exactly one place and is the same answer for a
counter sale and a web checkout. A till that asserted a customer id could mislink
a sale, and would need its own answer for Convex versus platform tenants.

- **RED**: `npx jest lib/customers/pos-attachment.test.ts` →
  `TS2307: Cannot find module './pos-attachment'`.
- **GREEN**: → `Tests: 13 passed, 13 total`.

### Task 2 — The guest must not outlive the sale

Extended the same module with `clearedSaleCustomer()`. The register's store has
no test harness (jest roots are `lib/`, `theme/`, `plugins/`), so rather than
leave the rule untested inside Zustand, it lives as a pure function the store
spreads into `reset`, `beginEdit` and `endEdit`.

This also fixes a pre-existing leak: `endEdit` never cleared `customerName` at
all, so leaving edit mode carried the edited order's customer into the next
counter sale.

- **RED**: `npx jest lib/customers/pos-attachment.test.ts` →
  `TS2305: Module './pos-attachment' has no exported member 'clearedSaleCustomer'`.
- **GREEN**: → `Tests: 15 passed, 15 total`.

### Task 3 — Quick-creating a guest from the search box

Added `draftFromSearch` to `lib/customers/validation.ts`. At a counter the number
comes first and the name later, if at all — so a phone-shaped query is routed to
the phone field. Putting it in the name field would fail validation and read as
the app rejecting a perfectly good number.

- **RED**: `npx jest lib/customers/validation.test.ts` →
  `TS2305: Module './validation' has no exported member 'draftFromSearch'`.
- **GREEN**: → `Tests: 30 passed, 30 total`.

### Task 4 — The picker and the wiring

Added `components/pos/CustomerPickerSheet.tsx` and wired it into
`app/(main)/pos-tender.tsx`, plus `attachedCustomer` / `setAttachedCustomer` on
`stores/pos-cart-store.ts`.

The single most consequential line is `posCustomerFields(attachedCustomer,
customerName)` spread into `buildPosOrder`. That function has accepted
`customerContact` since it was written and **nothing ever passed it**, so every
counter sale went out anonymous regardless of what the cashier typed.

Guarded by `lib/customers/pos-attach-mount.test.ts`, following the package's
existing `*-mount.test.ts` convention (assert on sources; the pure-logic jest
roots cannot render screens).

- **RED**: the mount test's assertions did not exist in the sources.
- **GREEN**: `npx jest lib/customers` → `Tests: 86 passed, 86 total`.
- **No regression**: `npx jest` → `135 suites, 2226 tests` passed.
- **Typecheck**: `npx tsc --noEmit` clean.
- **Lint**: `npm run lint` clean on every file touched. It caught a real defect —
  see below.

### A bug lint caught

The tender screen's completion callback omitted `attachedCustomer` from its
dependency array. The callback would have closed over the attachment as of the
last render, so a guest picked and then immediately charged would have rung up
**against whoever was attached before them** — the precise failure this feature
exists to prevent. Fixed by adding the dependency, not by suppressing the rule.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | The attached guest's phone is written as the order's contact — the one field that makes the sale land on their profile | `pos-attachment.test.ts:writes the attached guest's phone as the order's contact` | unit | PASS |
| 2 | A picked guest's name overrides text left in the box, so the receipt names the right person | `:uses the attached guest's name over anything typed in the box` | unit | PASS |
| 3 | Email is the fallback contact; phone wins when both exist, matching the shared resolver | `:falls back to the email when the guest has no phone`, `:prefers the phone when the guest has both` | unit | PASS |
| 4 | With no attachment the sale behaves exactly as before — typed name, empty contact | `:leaves the contact empty so the sale stays an honest walk-in` | unit | PASS |
| 5 | A guest with neither phone nor email yields no contact, rather than a link that reaches nobody | `:does not invent a contact for a guest with neither phone nor email` | unit | PASS |
| 6 | Clearing a sale wipes both the attachment and the typed name | `:clears both the attachment and the typed name` | unit | PASS |
| 7 | Each clear returns a fresh object, so one sale's state cannot reach the next | `:returns a fresh object each time` | unit | PASS |
| 8 | The cashier sees who is attached, degrading correctly for a name-less or email-only guest | `:shows the guest's name and number together` (+3) | unit | PASS |
| 9 | A phone-shaped search prefills the phone field, not the name field | `validation.test.ts:routes a phone-shaped query into the phone field` | unit | PASS |
| 10 | `+63…`, `0917…`, `9171234567`, `0917-123-4567` are all recognised as phones | `:recognises %s as a phone` | unit | PASS |
| 11 | Email and name queries route to their own fields | `:routes an email-shaped query into the email field`, `:routes anything else into the name field` | unit | PASS |
| 12 | A blank or placeholder query offers nothing to create, so the cashier is never invited to save "walk-in" as a guest | `:returns null for an empty query`, `:returns null for a placeholder that names nobody` | unit | PASS |
| 13 | The tender screen actually passes the customer fields into the order it builds | `pos-attach-mount.test.ts:passes the customer fields into the order it builds` | guardrail | PASS |
| 14 | The screen does not re-derive phone-or-email beside the JSX | `:derives the attachment fields from the shared pure rule` | guardrail | PASS |
| 15 | The sale is reported to the capture route, so the attachment is not cosmetic | `:reports the captured sale to the platform` | guardrail | PASS |
| 16 | Every store path that ends a sale clears the guest | `:clears the guest everywhere a sale ends` | guardrail | PASS |
| 17 | The picker offers an explicit walk-in, validates a quick-create, reports duplicates, and does not claim an empty store when the search failed | `the customer picker` (4 tests) | guardrail | PASS |

## Coverage and known gaps

No coverage threshold is configured and no coverage command was run, so no
percentage is claimed. The pure modules are exercised across every exported
function and branch (86 tests in `lib/customers`).

Deliberate gaps and outstanding risks:

- **Nothing here has run on a device.** All evidence is unit tests, guardrails,
  `tsc` and lint. The picker's rendering, the sheet's keyboard behaviour, and the
  end-to-end path (attach a guest → complete a sale → see their totals move)
  are unverified and need a build.
- **Guardrail tests assert on source text**, so they prove wiring exists, not
  that it behaves. They are the package's existing convention for screens the
  jest roots cannot render, not a substitute for a render test.
- **`orders.customer_id` is still not written by the app.** Deliberate: the
  register states a contact and the server resolves identity. Writing an id
  from the client would be a second, client-asserted opinion that could disagree
  with the capture path's.
- **Phase 2 (customer management screen) is unbuilt** and blocked on a
  concurrent session's rework of the same file.
- **RLS is still not a permission boundary.** Unchanged from Phases 1 and 3.

## Merge evidence

Checkpoint commits on `feat/android-sms-followups`:

- `458eb54` — `test: add reproducer for attaching a guest to a counter sale` (RED)
- `15b3225` — `test: add reproducer for quick-creating a guest from the POS search box` (RED)
- `3d68a3e` — `feat: attach a guest to a counter sale` (GREEN 86/86, app suite 2226/2226)

No refactor commit: the modules were written to their final shape and the suite
stayed green.
