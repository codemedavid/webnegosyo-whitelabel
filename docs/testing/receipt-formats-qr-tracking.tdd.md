# TDD Evidence — Receipt Formats, Tracking QR, Contact Capture, Receipt Studio

**Source plan**: inline `/plan` output approved 2026-08-27 (no `.plan.md` artifact; journeys derived there).
**Date**: 2026-08-27

## User journeys

1. As a merchant, I pick a receipt format (or arrange my own blocks) and every receipt prints that way — while every tenant who never touched it keeps today's receipt byte-for-byte.
2. As a merchant, I reprint a receipt from orders management (app order detail already had it; the app list prompt is now actionable and the web admin can print from both order surfaces).
3. As a customer, I scan the QR at the bottom of my receipt, see live order tracking, and my phone rings when the order is ready.
4. As a walk-in/POS customer with no number on file, I use that same page to attach my phone number to the order — once, and never overwriting an existing contact.
5. As a merchant, I design the receipt visually in the admin (Receipt Studio) with a live preview that matches what prints.

## Task report (RED → GREEN per step)

| Step | RED commit | GREEN commit | Validation run |
|---|---|---|---|
| Block engine + presets | `63c93e9` (module missing) | `10d8e26` | `npx jest lib/receipt-layout.test.ts lib/receipt-formatter.test.ts` → 37 pass |
| Saved-layout delivery path (session/impersonation/print) | `8c376c5` (compile-RED: fields missing) | `2ee44f9` | `npx jest` (app) → 2941 pass; `tsc --noEmit` clean |
| `tenants.receipt_layout` column | — (migration) | `fd9d244` | applied via MCP + information_schema probe |
| Web engine mirror | RED in `f72d154`'s parent commit | `f72d154` | `tests/unit/receipt-layout.test.ts` → 7 pass |
| QR→BMP builder | `fcc4eed` | (feat commit after) | `lib/receipt-qr.test.ts` → 5 pass (BMP decoded byte-by-byte) |
| Segments + printer raster pipeline | committed RED pair | `a2a4437` | `lib/receipt-segments.test.ts` + `lib/printer-segments.test.ts` → 9 pass; app suite 2955 |
| Tracking-URL mint + fetch | RED commit before | `e4abd2a` | `lib/receipt-tracking.test.ts` → 9 pass |
| Contact capture + ready-ring | RED commit before | `ccb16fe` | `tests/unit/order-contact.test.ts` → 10 pass; web unit 6079 |
| Web admin print | RED commit before | `249ea47` | `tests/unit/receipt-web.test.ts` → 3 pass |
| Receipt Studio helpers + UI | RED commit before | `c179db7` | `tests/unit/receipt-editor.test.ts` → 9 pass; web unit 6091 |

Final suite states: **webnegosyo-app `npx jest` 2964/2964**, **web `tests/unit` 6091/6091**, `tsc --noEmit` clean in the app (web tsc has pre-existing test-file drift unrelated to this work; `npx eslint src` → 0 errors).

## Key guarantees pinned by tests

| # | Guarantee | Where |
|---|---|---|
| 1 | Classic preset ≡ historic `formatReceipt` byte-for-byte (base, POS cash, discounted, bundle+address) | `webnegosyo-app/lib/receipt-layout.test.ts` |
| 2 | Invalid/missing saved layouts always fall back to Classic; presets resolve by name | both `receipt-layout` suites, `receipt-print.test.ts` |
| 3 | Saved layout survives sign-in AND impersonation into the auth store; cleared on exit | `lib/receipt-print.test.ts`, `lib/impersonation.test.ts` |
| 4 | QR BMP is a valid uncompressed 24-bit bitmap (header, size, quiet zone, finder pattern); unbuildable payloads return null | `lib/receipt-qr.test.ts` |
| 5 | Printer cuts exactly once at the end; QR goes through `printImageBase64`; a failed QR never blocks paper | `lib/printer-segments.test.ts` |
| 6 | Tracking URL is minted server-side only, best-effort; demo sessions and offline registers print QR-less | `lib/receipt-tracking.test.ts` |
| 7 | Contact capture is once-only (`decideContactWrite`), placeholder-aware, never renames a real customer | `tests/unit/order-contact.test.ts` |
| 8 | Ready-ring fires exactly on the transition into `ready`, never on first load | same suite |
| 9 | Admin order → engine mapping is field-pinned; saved layouts drive the web print identically | `tests/unit/receipt-web.test.ts` |
| 10 | Only known presets / parseable layouts can be saved to the tenants row | `tests/unit/receipt-editor.test.ts` |

## Known gaps / follow-ups

- **Hardware verification pending**: `printImageBase64` QR sizing/behavior must be confirmed on the real iPad + thermal printer (the JS path is fully tested; the printer firmware is not). Fallback if a printer ignores rasters: the layout still prints the caption, and `renderReceipt`'s flat form wraps the URL as text.
- **Convex fan-out deploy pending**: `orders:updateCustomerContact` shipped in bundle v22 (prebundled); Convex tenants return `unavailable` from `/api/orders/contact` until their deployments are pushed.
- App screens (`app/**`) are outside both jest projects (pre-existing); `useOrderPrint` wiring is covered via its pure extractions (`receipt-print.ts`, `receipt-tracking.ts`).
- Coverage: new pure modules each carry dedicated suites (74 new tests across app+web); no repo-wide coverage run was executed this session.

## Merge evidence

Work is committed directly on `main` as paired test/feat commits (see table). If squashed later, this file is the surviving RED/GREEN record.
