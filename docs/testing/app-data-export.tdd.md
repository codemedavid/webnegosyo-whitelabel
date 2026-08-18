# TDD Evidence — Merchant App Data Export (Orders / Daily Sales / Customers CSV)

**Source plan:** inline `/plan` in-session (2026-08-18); no `*.plan.md` artifact.
**Scope:** `webnegosyo-app/` — CSV export via the native share sheet, filtered by date presets.

## User journeys

1. As a merchant, I want to export my orders (with items, payment, totals) for a chosen date range, so I can keep records outside the app.
2. As a merchant, I want a daily sales summary CSV, so I can paste a gapless per-day series into a spreadsheet.
3. As a merchant, I want to export my customer list with spend stats, so I can use it outside the app.
4. As a merchant, I must be told when an export is a truncated window (fetch caps), so I never mistake a partial file for the whole story.

## RED → GREEN cycles (all on `main`)

| Cycle | RED commit | RED evidence | GREEN commit | GREEN evidence |
|---|---|---|---|---|
| Export core (csv/dates/orders/sales/customers) | `c22fc74` | 5 suites failed: `Cannot find module './csv'` etc. | `a224533` | `npx jest lib/export --selectProjects logic` → 42/42 pass |
| Share-sheet delivery | `eb73e33` | suite failed: `Cannot find module './share'` | `9449ef8` | 5/5 pass (expo modules factory-mocked with `__esModule: true`) |
| Full customer fetch | `81b99be` | 5 new tests failed (`fetchAllCustomersForExport` missing), 19 existing passed | `fbb8ff6` | `lib/customers/repo` → 24/24 pass |
| ExportSheet component | `6a1d2b3` | suite failed to run (component missing) | `46bd6f3` | components suite → 8/8 pass |
| Export orchestration | `29ddda3` | suite failed: `Cannot find module './run-export'` | `1540757` | 5/5 pass |
| Screen wiring (no new logic) | — | — | `8c878d7` | `npx tsc --noEmit` clean; full suite 190/190, 2825 tests; `expo lint` 0 errors |

## What the passing tests guarantee

| # | Guarantee | Test file | Type |
|---|---|---|---|
| 1 | CSV escaping: commas/quotes/newlines quoted, quotes doubled, header cells too | `lib/export/csv.test.ts` | unit |
| 2 | Spreadsheet formula injection (`=`,`+`,`-`,`@`) neutralized on string cells; numbers exempt | `lib/export/csv.test.ts` | unit |
| 3 | Output leads with UTF-8 BOM and joins rows with CRLF (Excel double-click safe) | `lib/export/csv.test.ts` | unit |
| 4 | Exported day/time is the Manila day, matching in-app analytics, never the UTC day | `lib/export/dates.test.ts` | unit |
| 5 | File names carry the inclusive day range; single-day windows collapse to one date | `lib/export/dates.test.ts` | unit |
| 6 | Order filter is half-open `[start, end)` with optional exact-status narrowing | `lib/export/orders-export.test.ts` | unit |
| 7 | Orders CSV: one row per order, newest first, no `undefined` in optional cells | `lib/export/orders-export.test.ts` | unit |
| 8 | Coverage math: cap hit + oldest row inside the window ⇒ `isComplete: false` with the honest effective start | `lib/export/orders-export.test.ts` | unit |
| 9 | Daily sales: per-Manila-day aggregation, cancelled excluded, zero-filled gapless series, TOTAL row | `lib/export/sales-export.test.ts` | unit |
| 10 | Customers CSV limited to already-visible columns; opt-out overrides prior SMS consent | `lib/export/customers-export.test.ts` | unit |
| 11 | Share: availability checked before writing (no orphaned PII file), write failures propagate, CSV mime/UTI set | `lib/export/share.test.ts` | unit (mocked natives) |
| 12 | Full customer fetch pages with explicit tenant filter on every page, bounded at 25×200, throws on any failed page | `lib/customers/repo.test.ts` | integration (mocked supabase chain) |
| 13 | ExportSheet: selected preset reaches `onExport`, busy state blocks re-fire, coverage/error notes render | `components/ExportSheet.test.tsx` | component |
| 14 | Orchestration: window→filter→CSV→share sequencing and coverage return per export type | `lib/export/run-export.test.ts` | unit |

## Coverage

`npx jest lib/export lib/customers/repo components/ExportSheet --coverage` →
**97.71% statements / 89.25% branches / 100% functions / 99.47% lines** on the new modules (threshold 80%).

## Known gaps / intentional limits

- `run-export.ts` default `share` branch (the real `shareCsv`) is exercised only via injection; the native share sheet itself needs a device — **manual step**.
- Order fetch is the recent-2000 page on both backends; truncation is *reported* (Alert + coverage note), not eliminated. Server-side date-range args are the follow-up if merchants need deeper history.
- `expo-file-system` + `expo-sharing` are new native modules — **requires an EAS build; not OTA-able**.
- No E2E: share-sheet flows cannot run under jest; covered by the component + orchestration seams instead.
