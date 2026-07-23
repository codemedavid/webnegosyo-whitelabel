# TDD Evidence — Promotion banner upload fails on the Branding Studio Mobile tab

**Date:** 2026-07-22
**Branch:** main
**Bug:** In the Branding Studio, uploading a promotion banner image and toggling
"Show promotion banners" showed a toast **"Validation error: Invalid input"** and
did not publish. Reproduced with the **Mobile** device tab active (see the
reported screenshot).

## Source plan

No `*.plan.md` — journeys derived during this TDD run from the bug report.

## User journey

> As a merchant, I want to upload a promotion banner image and turn banners on in
> the Branding Studio (on either the Desktop **or** Mobile tab) and Publish, so
> that the banner shows on my storefront — without a "Validation error".

## Root cause

`src/lib/branding-registry.ts` — the `banners()` field constructor produced a
field with no `columnBacked` flag. `editsTenantColumn(field, isMobile)` returns
`!isMobile || field.columnBacked === true`, so on the **Mobile** tab a
non-`columnBacked` field is written into the tenant's `mobile_overrides` JSONB
map instead of its real column.

`promotion_banners` is an **array** (`PromotionBanner[]`), but the
`mobile_overrides` schema in `src/lib/branding-service.ts` is
`z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))`
— scalar values only. An array value fails the union, and Zod reports its default
union message **"Invalid input"**, surfaced as `Validation error: Invalid input`.

The Desktop tab worked because `!isMobile` short-circuits to the real column.

## Fix

`src/lib/branding-registry.ts`: mark the `banners()` field constructor
`columnBacked: true`. A banners field is array-valued shared content and can
never legally live in the scalar-only `mobile_overrides` map, so it must edit its
tenant column on every device tab. One-line, minimal change; both read and write
paths in `branding-studio.tsx` already key off `editsTenantColumn`, so they stay
symmetric.

## Task report

| Behavior | Validation command | RED → GREEN |
|---|---|---|
| Banners edit the tenant column even on mobile | `npx jest --config jest.config.cjs tests/unit/branding-banners-mobile.test.ts` | RED: `editsTenantColumn(banners, true)` returned `false`; GREEN after flag |
| Banners field is `columnBacked` | same | RED: `columnBacked` was `undefined`; GREEN: `true` |
| `mobile_overrides` rejects an array (invariant that justifies the fix) | same | GREEN from the start (guards why banners must be columnBacked) |
| A `promotion_banners` array validates on the tenant column | same | GREEN (with required `primary_color`/`secondary_color` present) |

RED output excerpt (before fix):

```
● promotion banners on the mobile tab › edits the tenant column ... even on mobile
    Expected: true
    Received: false
Tests: 2 failed, 2 passed, 4 total
```

GREEN output (after fix):

```
Tests: 4 passed, 4 total
```

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | `promotion_banners` edits its tenant column on both desktop and mobile | `tests/unit/branding-banners-mobile.test.ts` | unit | PASS |
| 2 | The banners field is flagged `columnBacked` | same | unit | PASS |
| 3 | `mobile_overrides` rejects an array value (invariant) | same | unit | PASS |
| 4 | A `promotion_banners` array validates on the real tenant column | same | unit | PASS |

## Coverage / known gaps

- `npx jest --config jest.config.cjs --testPathPatterns "mobile-overrides|branding"`:
  14 suites pass, 180 tests pass. The 1 failing suite is a **pre-existing,
  untracked** stray file `tests/unit/mobile-overrides.test.ts` (already `??` in
  git status before this task) that imports a `resolveDeviceTemplate` symbol that
  does not exist in `src/lib/mobile-overrides.ts`. It is an abandoned duplicate of
  the passing tracked `tests/unit/lib/mobile-overrides.test.ts` and is unrelated
  to this fix. Recommend deleting it separately.
- ESLint clean on `branding-registry.ts` and the new test.
- No E2E added; behavior is fully covered at the unit level where the bug lived.
