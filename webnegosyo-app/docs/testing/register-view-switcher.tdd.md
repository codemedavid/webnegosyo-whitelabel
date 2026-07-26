# TDD evidence — view switcher on the Register view

## Source plan

No `*.plan.md` was supplied. The journey below was derived during this TDD run from
the request "add switch view as well on the register view on the webnegosyo app".

## User journey

As a merchant working the register, I want to switch views from the POS screens,
so I can jump to Operations / Insights / Products without first backing out to
another view's tab.

## Task report

**Context.** `lib/workspaces.ts` splits the merchant app into four views
(Operations / Register / Insights / Products) and `components/WorkspaceSwitcher.tsx`
is the control that changes the active one. Before this change the switcher was
mounted on `dashboard`, `orders`, `analytics`, `growth`, `trends`, and
`product-analytics` — but on neither Register tab (`pos`, `pos-sales`), so a
cashier had no way out of the Register view.

**Change.** Mounted `<WorkspaceSwitcher />` in both Register tab screens:

- `app/(main)/pos.tsx` — replaced the static `Register` eyebrow in the header
  title row with the switcher. The switcher's trigger renders the active view's
  label, which is literally "Register", so the header reads the same but is now
  tappable. The now-unused `eyebrow` style key was removed.
- `app/(main)/pos-sales.tsx` — wrapped the "Today at the register" eyebrow in a
  new `headerRow` so the switcher sits beside it, matching the
  `product-analytics` header pattern.

**Guardrail.** Jest in this app only runs pure-logic roots (`lib/`, `theme/`) —
screens are not rendered under test. The new test therefore asserts on the screen
*sources*, driven off the `register` workspace's own tab list, so adding a Register
tab later without a switcher fails the build.

### Validation commands actually run

RED (before the fix):

```
$ npx jest lib/workspace-switcher-mount.test.ts
      29 |   it.each(registerTabs)("renders the WorkspaceSwitcher in %s", (tab) => {
    > 30 |     expect(readScreen(tab)).toContain("<WorkspaceSwitcher />");
Test Suites: 1 failed, 1 total
Tests:       4 failed, 1 passed, 5 total
```

The 4 failures were the import + render assertions for `pos` and `pos-sales`; the
passing test is the tab-list assertion. Failure cause is the missing mount, not
setup or unrelated breakage.

GREEN (after the fix):

```
$ npx jest lib/workspace-switcher-mount.test.ts
Test Suites: 1 passed, 1 total
Tests:       5 passed, 5 total

$ npx jest            # full app suite, after refactor
Test Suites: 26 passed, 26 total
Tests:       368 passed, 368 total

$ npx tsc --noEmit    # no output
$ npx eslint "app/(main)/pos.tsx" "app/(main)/pos-sales.tsx" lib/workspace-switcher-mount.test.ts   # no output
```

## Test specification

| # | What is guaranteed | Test | Type | Result | Evidence |
|---|--------------------|------|------|--------|----------|
| 1 | The Register view owns exactly the two counter-sale tabs, so the guardrail below covers the whole view | `lib/workspace-switcher-mount.test.ts:owns the counter-sale tabs` | unit | PASS | `npx jest lib/workspace-switcher-mount.test.ts` |
| 2 | Every Register tab screen imports `WorkspaceSwitcher` from the shared component path | `lib/workspace-switcher-mount.test.ts:imports the WorkspaceSwitcher in %s` | unit | PASS | same |
| 3 | Every Register tab screen renders `<WorkspaceSwitcher />`, so a cashier can always leave the view | `lib/workspace-switcher-mount.test.ts:renders the WorkspaceSwitcher in %s` | unit | PASS | same |
| 4 | Workspace registry lookups (`getWorkspace`, `isTabInWorkspace`, `defaultTabHref`) stay correct for the `register` key | `lib/workspaces.test.ts` (pre-existing) | unit | PASS | `npx jest lib/workspaces.ts` |

## Coverage and known gaps

```
$ npx jest --coverage --collectCoverageFrom='lib/workspaces.ts'
 workspaces.ts |     100 |      100 |     100 |     100 |
```

Known gaps, stated rather than papered over:

- **No render test.** `jest.config.js` restricts roots to `lib/` and `theme/` and
  there is no React Native testing-library setup in this app, so the guarantee is
  source-level: the component is imported and mounted. That the sheet opens and
  navigates is covered by `WorkspaceSwitcher`'s existing behavior (unchanged here)
  and was not re-verified on-device in this run.
- **Visual layout unverified.** The `pos.tsx` header swap and the new `pos-sales.tsx`
  `headerRow` were not screenshotted on a simulator.
- **`product-management` still has no switcher.** It is the one remaining workspace
  tab without one. Left alone deliberately — out of scope for this request — and the
  guardrail is scoped to the Register view rather than all tabs to avoid failing on it.

## Merge evidence

RED: 4 failing assertions in `lib/workspace-switcher-mount.test.ts` (switcher absent
from `pos` / `pos-sales`).
GREEN: same target passes 5/5; full suite 368/368; `tsc --noEmit` and `eslint` clean.
Refactor: removed the orphaned `eyebrow` style from `pos.tsx`; suite still green.

Checkpoint commits on `feat/unified-modifier-groups`:

- `d6e699c test: add guardrail for view switcher on register screens` (RED)
- `2b0fc79 feat: show the view switcher on the register screens` (GREEN)
- refactor + this report (final commit)
