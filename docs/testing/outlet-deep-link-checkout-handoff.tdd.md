# Branch QR link → checkout handoff

## Source plan

No `*.plan.md`. Journeys were derived during this TDD run from the reported
defect: "`/b/branch` still asks for the branch on the checkout even though I
added that parameter."

## The defect

`/b/{slug}` is a redirect and nothing more — `resolveOutletDeepLink` sends the
customer to `/{tenant}/menu?outlet={slug}` and never touches the database. The
menu honours that param (`resolveOutletSelection` lets the URL win over
anything stored), so branch pricing and the branch menu were correct.

Nothing persisted it. Cart and checkout are separate routes with no query
string, and `useCheckoutOutlet` — the hook behind the checkout picker under the
`after` timing — read neither the URL nor any stored branch. The branch died
with the menu render, so a customer standing in the Cainta branch, who scanned
Cainta's own printed code, was asked at checkout which branch they were in.

Under the `before` timing the same gap exists but shows differently: the splash
gate does not prompt (the URL resolved a branch), yet nothing was written to
storage, so `useCheckoutOutlet`'s `storedOutletId` stayed null and the order
was placed against no branch at all. Not fixed here — see Known gaps.

## User journeys

1. As a customer who scans a branch's printed QR code, I want checkout to
   already know which branch I am in, so that I am not asked a question I have
   already answered by standing there.
2. As a customer whose printed code names a branch that has since closed, I
   want to be asked rather than have my order attributed to a dead branch.
3. As a customer who scanned one branch's code but wants another, I want my own
   choice to override the link.
4. As a merchant who never turned branches on, I want none of this to run.

## Task report

### 1. Persist the branch a link named

New pure module `src/lib/outlets/linked-outlet.ts` — a slug plus a timestamp,
under `linked_outlet_<tenant>`, with the same 7-day window as the stored
selection and the same try/catch discipline (Safari private mode throws on
`localStorage`).

Deliberately NOT folded into `outlet-selection`'s stored record. That one pairs
a branch with the **mode** the customer picked on the splash chooser, and every
reader relies on the mode being present; a QR code carries no mode, so widening
it would push a half-filled selection onto code with no business handling one.

`useOutletSelection` writes it when — and only when — `?outlet=` resolved to a
real, active branch. A dead or mistyped code prompts and leaves storage empty.

- Validation: `npx jest tests/unit/outlets-linked-outlet.test.ts tests/unit/outlets-deep-link-persistence.test.tsx`
- RED (compile): `Cannot find module '../../src/lib/outlets/linked-outlet'`
- RED (runtime, after adding the module but before wiring the hooks):
  `3 failed, 9 passed, 12 total`
- GREEN: `12 passed, 12 total`

### 2. Start the checkout picker from it

`useCheckoutOutlet` reads the remembered slug after mount, matches it against
the live branch list, and feeds the result to `resolveCheckoutOutletSelection`
as an ordinary candidate. That resolver already drops a selection not on offer,
so a deactivated branch — or one that cannot serve the chosen order type —
falls back to the picker for free. A printed link is a suggestion, not an
instruction.

The untouched state changed from `null` to `undefined` so that "has not
answered" and "explicitly cleared" stay distinguishable: `clearSelection` must
bring the branch screen back, not silently reinstate the link's branch.
`droppedReason` narrowed to `typeof chosenOutletId === 'string'` to match.

- Validation: `npx jest tests/unit/outlets tests/unit/use-checkout-outlet tests/unit/checkout-outlet tests/unit/outlet-gate`
- GREEN: `27 passed, 470 tests passed` — the pre-existing checkout-outlet
  suites (journey, screen, first-paint, selection) all still pass.

## Test specification

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | Opening the menu with `?outlet=cainta` serves Cainta AND remembers it past the page | `tests/unit/outlets-deep-link-persistence.test.tsx:persists the linked branch when the menu opens with ?outlet=` | unit (hook) | PASS | `npx jest outlets-deep-link-persistence` |
| 2 | A link naming a branch that does not exist prompts and writes nothing | `…:leaves storage alone when the link names a branch that does not exist` | unit (hook) | PASS | same |
| 3 | A tenant with branches off writes nothing at all | `…:does not remember a branch for a tenant that never turned branches on` | unit (hook) | PASS | same |
| 4 | Checkout pre-selects the linked branch and does not block the CTA | `…:pre-selects the linked branch instead of asking again` | unit (hook) | PASS | same |
| 5 | A linked branch no longer on offer still forces a choice | `…:still asks when the linked branch is no longer on offer` | unit (hook) | PASS | same |
| 6 | An explicit tap overrides the linked branch | `…:lets the customer override the linked branch` | unit (hook) | PASS | same |
| 7 | Slug round-trips through storage | `tests/unit/outlets-linked-outlet.test.ts:reads back the slug it wrote` | unit | PASS | `npx jest outlets-linked-outlet` |
| 8 | Tenants do not read each other's remembered branch | `…:keeps tenants apart` | unit | PASS | same |
| 9 | A link older than the retention window is forgotten and purged | `…:forgets a link older than the retention window` | unit | PASS | same |
| 10 | A corrupt record returns null instead of throwing | `…:returns null for a corrupt record rather than throwing` | unit | PASS | same |
| 11 | Storage that throws (Safari private mode) never breaks the storefront | `…:survives storage that throws, as Safari private mode does` | unit | PASS | same |
| 12 | The remembered link can be cleared | `…:clears the remembered link` | unit | PASS | same |

## Coverage

`npx jest tests/unit/outlets tests/unit/use-checkout-outlet tests/unit/checkout-outlet tests/unit/outlet-gate --coverage` over the three changed files:

```
File                      | % Stmts | % Branch | % Funcs | % Lines
--------------------------|---------|----------|---------|--------
All files                 |   97.28 |     93.4 |     100 |   97.28
  use-checkout-outlet.ts  |     100 |    97.87 |     100 |     100
  use-outlet-selection.ts |   91.33 |    86.36 |     100 |   91.33
  linked-outlet.ts        |     100 |     90.9 |     100 |     100
```

Above the 80% bar on every axis. The uncovered lines in `use-outlet-selection`
are the geolocation and ranking callbacks, which predate this change.

## Known gaps

- **`before` timing still loses the link.** A deep link under the splash-gate
  timing resolves the menu but leaves `useCheckoutOutlet`'s `storedOutletId`
  null, so the order carries no branch. The remembered slug now exists and
  would make this fixable in one place, but the fix needs a decision this
  change should not make on its own: the stored selection requires a **mode**,
  and a QR code supplies none. Deliberately out of scope; the reported symptom
  was the `after`-timing picker.
- Not exercised end-to-end in a browser. The two hooks are covered
  individually; the redirect itself was already covered by
  `tests/unit/outlets-deep-link.test.ts`.
- Full suite: `4863 passed, 8 skipped`. Five suites fail under `sms/`, an
  unrelated directory untouched by this change (pre-existing).

## Merge evidence

- RED: `test: add reproducer for the branch QR link being forgotten by checkout` (`b021c8a`) — 3 of 12 failing.
- GREEN: `fix: carry the branch a QR link named through to checkout` (`c3f139b`) — 12/12, and 470/470 across the outlet surface.
- No separate refactor commit; the fix landed in its final shape.
