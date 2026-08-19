# TDD Evidence — Export crash: `Cannot find native module 'ExpoSharing'`

## Source plan

No `*.plan.md`; journeys derived during this TDD run from the reported
release crash log (merchant admin app, `webnegosyo-app/`):

```
ERROR [Error: Cannot find native module 'ExpoSharing']
  <global> (lib/export/share.ts:15)
  <global> (lib/export/run-export.ts:20)
  <global> (app/(main)/customers.tsx:56)
```

## Root cause

The installed binary predates the data-export feature, so BOTH new export
natives (`ExpoFileSystem`, `ExpoSharing`) are absent. `expo-sharing`'s JS
entry point calls `requireNativeModule('ExpoSharing')` at module scope, so
the eager `import * as Sharing from "expo-sharing"` in
`lib/export/share.ts` threw at bundle-evaluation time and crashed every
screen that transitively imports the export lib (customers, and any other
screen with an export button).

## User journeys

1. As a merchant on an app build that predates the export feature, I want the
   Customers (and Orders/Sales) screens to load normally, so a feature I
   can't use yet doesn't red-screen my app.
2. As that same merchant, if I tap an export button, I want a readable
   "update the app" error instead of a crash.

## Fix

`webnegosyo-app/lib/export/share.ts` now resolves `expo-file-system/legacy`
and `expo-sharing` lazily inside `shareCsv()` via guarded `require()`. A
missing native module surfaces as:
`"Exporting is not supported by this app version. Please update the app and try again."`

## Task report

- **RED** — `webnegosyo-app/lib/export/share-missing-native.test.ts` mocks
  both modules with throwing factories (mirroring the native-missing
  behavior). Command: `npx jest lib/export/share-missing-native.test.ts` →
  3/3 FAILED at `share.ts:14` eager import (the intended defect). Commit
  `34c1378`.
- **GREEN** — after the lazy-load change, same command → 3/3 PASS; full
  export suite `npx jest lib/export` → 55/55 PASS (pre-existing mocked
  tests unaffected). `npx tsc --noEmit` clean; `npx eslint` clean on both
  changed files. Commit `dc16c9f`.
- **Refactor** — none needed; change is two small hunks in one file.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | Importing `lib/export/share` never throws when export natives are missing | `share-missing-native.test.ts` — "can be imported without throwing" | unit | PASS |
| 2 | Transitive import via `run-export` (the customers-screen path) never throws | `share-missing-native.test.ts` — "imported transitively via run-export" | unit | PASS |
| 3 | `shareCsv` rejects with a merchant-readable "update the app" message | `share-missing-native.test.ts` — "rejects shareCsv with a merchant-readable update message" | unit | PASS |
| 4 | Normal share flow (write → share sheet → uri) unchanged | `share.test.ts` (5 pre-existing tests) | unit | PASS |

## Coverage and known gaps

`npx jest lib/export --coverage` → lib/export: **98.05% stmts / 100% funcs /
99.26% lines** (share.ts 94.11%; uncovered line is the unreachable
null-cache-directory guard on real devices).

Known gap (intentional, out of scope): the export feature remains
non-functional on old binaries by design — actually enabling it requires a
new EAS build that bundles the two natives (tracked separately). This fix
only removes the crash and degrades gracefully.

## Merge evidence

If squash-merged, the RED/GREEN summary above is the record:
RED `34c1378` (3 tests fail at eager import) → GREEN `dc16c9f`
(3/3 + 55/55 pass, tsc + eslint clean).
