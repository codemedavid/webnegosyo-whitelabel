# Subscriptions screen — dark-shell legibility

## Source plan

No `*.plan.md`. The journeys below were derived during this TDD run from a
screenshot of `webnegosyo.com/superadmin/subscriptions` in which the tenant
column was unreadable.

## What was wrong

The superadmin shell (`src/app/superadmin/layout.tsx`) renders a pure-black
surface. Four files were the only light-theme island left inside it:

- `src/app/superadmin/subscriptions/page.tsx`
- `src/components/superadmin/subscription-manager.tsx`
- `src/components/superadmin/mark-paid-dialog.tsx`
- `src/components/superadmin/allowance-dialog.tsx`

`grep -rl 'text-neutral-900' src/components/superadmin/ src/app/superadmin/`
returned those four and nothing else.

The headline defect: tenant names shipped as `text-neutral-900` — near-black ink
on a near-black ground. The single column that answers "who do I chase today?"
was the single column the owner could not read. Secondary defects: white `bg-white`
stat slabs, pastel `bg-emerald-100` pills, `2026-08-30` wrapping to two lines,
`Mark paid` wrapping to two lines, and a page-level `p-6` nested inside the
layout's own `px-6 py-8` frame.

## User journeys

1. As the platform owner, I want to read every tenant's name on the collections
   table, so that I know who to chase.
2. As the platform owner, I want a row to scan in one pass, so that a column of
   dates and actions is legible at a glance rather than double-height.
3. As the platform owner, I want the dialogs I open from this screen to be
   readable too, so that recording a payment does not mean guessing at fields.

## Task report

### Task 1 — prove the screen is unreadable on its own shell

Wrote `tests/unit/subscription-screen-legibility.test.tsx`, which renders the
real `SubscriptionManager` (rows built through the real roster) plus both
dialogs, and scans the rendered DOM for class tokens that render dark ink or an
opaque white slab on the black shell.

jsdom computes no contrast, so the honest assertion is the palette the component
*asks for*, not the pixels it produces. The guard matches whole class tokens, so
`bg-white/[0.02]` — the shell's own panel fill — is not caught by a search for
`bg-white`.

Command: `npx jest tests/unit/subscription-screen-legibility.test.tsx`

RED output:

```
Tests:       8 failed, 1 passed, 9 total

● the dialogs opened from this screen match the shell › records a payment on a dark surface
    - Array []
    + Array [
    +   "bg-white",
    +   "text-neutral-900",
    +   "text-neutral-500",
    +   "text-neutral-600",
    + ]
```

Checkpoint: `b11ae1d test: add reproducer for the light-themed subscriptions screen on the black shell`

### Task 2 — move the screen onto the /download palette

Restyled all four files against the existing `src/components/superadmin/ui/primitives.tsx`
design system rather than inventing a second dark palette:

- Table surface, header, rows, and pills use `border-white/10` / `bg-white/[0.02]`
  and translucent state fills, matching `leads-table.tsx`.
- Stat tiles now render through the shared `Panel` primitive.
- Dates, `Due in`, `Overdue`, allowance cells and all three row buttons are
  `whitespace-nowrap`; numeric columns gained `tabular-nums`.
- The page drops its own `p-6` and adopts `Breadcrumbs` + `PageHeader`, matching
  `superadmin/leads/page.tsx`.

Command: `npx jest tests/unit/subscription-screen-legibility.test.tsx`

GREEN output:

```
Tests:       9 passed, 9 total
```

Checkpoint: `1d58310 fix: put the subscriptions screen on the dark superadmin palette`

### Task 3 — confirm nothing else moved

Command: `npx jest subscription allowance --silent`

```
Test Suites: 13 passed, 13 total
Tests:       160 passed, 160 total
```

`npx tsc --noEmit` reports 62 errors, all pre-existing and all in unrelated test
files (`inventory-*`, `outlets-*`, `tenant-limits`, `product-detail-*`). Zero in
`src/` and zero in any file touched here.

`npx next lint` on the six touched files: `✔ No ESLint warnings or errors`.

`npm run build` completes; `/superadmin/subscriptions` builds at 6.1 kB.

## Test specification

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | The screen asks for no dark-ink or opaque-white-slab class token anywhere | `subscription-screen-legibility.test.tsx:asks for no dark ink and no opaque white slabs anywhere on the screen` | unit | PASS | `npx jest subscription-screen-legibility` |
| 2 | The tenant name renders in light ink | `…:renders the tenant name in light ink, since that column is the whole point` | unit | PASS | same |
| 3 | The tenant slug renders in dimmed light ink, not dark grey | `…:renders the tenant slug in a dimmed light ink rather than a dark grey` | unit | PASS | same |
| 4 | Summary tiles sit on the shell surface, not white cards | `…:keeps the summary tiles on the shell surface instead of white cards` | unit | PASS | same |
| 5 | The paid-through date never wraps mid-value | `…:keeps the paid-through date on a single line` | unit | PASS | same |
| 6 | The primary row action never wraps mid-label | `…:keeps the primary action on a single line` | unit | PASS | same |
| 7 | Allowance cells still read `used / limit` | `…:labels the allowance columns so a bare "0 / 1" is not left to guess at` | unit | PASS | same |
| 8 | The mark-paid dialog renders on a dark surface | `…:records a payment on a dark surface` | unit | PASS | same |
| 9 | The allowance dialog renders on a dark surface | `…:edits allowances on a dark surface` | unit | PASS | same |
| 10 | Every pre-existing behaviour of the screen is unchanged | `subscription-collections-screen.test.tsx`, `allowance-editor-wiring.test.tsx` (+11 suites) | unit | PASS | `npx jest subscription allowance` — 160 passed |

## One deliberate refinement to the guard

The first draft forbade `bg-white` outright, which failed the `Mark paid`
button. That button is the design system's own inverted primary — `RangeTabs`
in `primitives.tsx` styles its active state exactly `bg-white text-black`, and it
reads perfectly. The guard was narrowed to permit an element that turns white
*and* restates the ink as `text-black`, and to forbid a white surface that leaves
light text on light ground. That is the real failure mode; the button is not it.

## Coverage

```
npx jest subscription allowance --coverage

All files                    |    97.1 |    97.28 |   85.48 |    97.1
  allowance-dialog.tsx       |     100 |      100 |     100 |     100
  mark-paid-dialog.tsx       |   87.17 |    66.66 |   16.66 |   87.17 | 46-65
  subscription-manager.tsx   |     100 |    92.85 |   82.35 |     100 | 186,244,304,352
```

Above the 80% bar. Known gap: `mark-paid-dialog.tsx:46-65` is the submit
transition, which `subscription-collections-screen.test.tsx` stubs the dialog out
of; the action it calls is covered directly by `subscription-service.test.ts`.

## Known gaps

These tests assert the palette a component requests, not measured contrast.
They will catch a light-theme token reappearing on this screen — the actual
regression that happened — but they cannot catch a dark-on-dark pairing built
entirely from `white/NN` opacities. A real contrast check needs a browser; none
is wired into this repo's unit suite.
