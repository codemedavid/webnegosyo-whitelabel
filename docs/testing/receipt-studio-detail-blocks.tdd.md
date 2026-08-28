# Receipt Studio — granular detail blocks + studio redesign (TDD evidence)

**Source plan:** none — journeys derived during this TDD run from the request:
"more detailed custom blocks (customer name, fill-up details, date, order
number, …) and make the editor beautiful like the Branding Studio."

## User journeys

1. As a merchant, I want to place the order number, date, customer name, and
   order type as individual receipt blocks (not one fixed group), so I can
   arrange and label them my way.
2. As a merchant, I want fill-in lines ("Received by: ______") on the receipt,
   so staff or customers can write details by hand.
3. As a merchant, I want to rename the printed label of each detail block
   (e.g. "Guest" instead of "Customer").
4. As a merchant, I want the Receipt Studio to feel like the Branding Studio —
   full-screen, live paper preview, organized block library.

## Task report

| Task | Validation | RED evidence | GREEN evidence |
|---|---|---|---|
| New block kinds in web engine | `npx jest --testPathPatterns "tests/unit/receipt-"` | 10 failed (kinds unknown → parse null, blocks skipped), commit `fbce5e1` | 29/29 pass, commit `7c1486a` |
| Mirror in app engine (the printing side) | `cd webnegosyo-app && npx jest receipt` | compile-time RED: `TS2322 '"fillIn"' is not assignable to type …ReceiptBlock` (test exercised missing kinds) | 67/67 pass incl. Classic byte-for-byte regression locks |
| Palette groups + fillIn seed | same web command | `BLOCK_GROUPS` import failed / palette entries missing | pass |
| Studio UI redesign | `npx eslint` on touched files + `npx tsc --noEmit` (no receipt errors) | n/a (visual work, logic covered above) | clean |

One test authoring error was fixed during GREEN (`stays silent for orderType…`
asserted the wrong line index); the implementation was not changed for it.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | orderNumber/orderDate/customerName/orderType print as standalone lines with default labels | `tests/unit/receipt-layout.test.ts` "prints each order detail as its own block" | unit | PASS |
| 2 | Merchant-authored labels replace defaults | "prints merchant-authored labels instead of the defaults" (web) / "honoring custom labels" (app) | unit | PASS |
| 3 | orderType block prints nothing when the order has no type | "stays silent for orderType when the order has none" | unit | PASS |
| 4 | The four granular blocks stacked classically are byte-identical to the composite `orderMeta` | "match orderMeta line-for-line" (both mirrors) | unit | PASS |
| 5 | fillIn prints `Label: ` + underscores exactly to the paper edge; over-long labels clip | "renders a fill-in line…" / "clips an over-long fill-in label" | unit | PASS |
| 6 | Parser accepts the new kinds, rejects fillIn without label, non-string labels, and labels > 32 chars | "parses the detail blocks and rejects malformed ones" (both mirrors) | unit | PASS |
| 7 | Palette offers the new kinds; every entry belongs to a known group; every group is non-empty; fillIn seeds with an editable label | `tests/unit/receipt-editor.test.ts` | unit | PASS |
| 8 | Classic preset still prints byte-for-byte what `formatReceipt` always printed | app regression-lock suite (pre-existing, re-run) | unit | PASS |

## Coverage and known gaps

- `npx jest --testPathPatterns "tests/unit/receipt-" --coverage` on
  `receipt-layout.ts` + `receipt-editor.ts`: **91.86% stmts / 82.43% branch** (≥ 80%).
- Studio UI (React component) is untested by automation, matching the
  pre-existing convention (Branding Studio has no component suite either);
  its logic lives in the tested pure libs.
- Not live-verified in a browser this run; the shell reuses the proven
  Branding Studio layout idiom.
- Rollout note: an app build older than this change rejects layouts containing
  the new kinds and safely falls back to Classic. Ship the app-side
  `receipt-layout.ts` (OTA-able JS) before telling merchants to use the new blocks.

## Round 2 — logo block + sidebar entry (2026-08-28)

Journeys: print the store logo on the receipt; reach Receipt Studio from the
admin sidebar.

| # | What is guaranteed | Test | Result |
|---|---|---|---|
| 9 | `logo` block emits an image segment when config carries `logoUrl`; silent without one and in flat text; parses as a simple block | `receipt-layout.test.ts` "logo block" (both mirrors) | PASS |
| 10 | `buildReceiptSegments` forwards the logo URL; logo-less prints stay text-only | `webnegosyo-app/lib/receipt-print.test.ts` | PASS |
| 11 | Sign-in and impersonation carry `tenants.logo_url` into `authStore.receiptLogoUrl`; impersonation exit clears it | same file + `impersonation.test.ts` | PASS |
| 12 | `fetchLogoBase64` returns downloaded bytes as base64; null on HTTP error / network throw / empty body / > 512 KB | `webnegosyo-app/lib/receipt-logo.test.ts` | PASS |
| 13 | Palette offers a Store logo block in the Header group | `tests/unit/receipt-editor.test.ts` | PASS |

RED evidence: web 3 failing + app 3 suites compile-time RED (commit with the
reproducers); GREEN: web 86/86 relevant, app full suite 2986/2986, app tsc
clean. Two test-side fixes during GREEN (impersonation round-trip fixture
gained the new cleared field; an `as const` fixture made readonly) — no
implementation was changed to satisfy a test.

Untested by automation: `printer.ts` image branch (native module) and the
hardware raster itself — same standing gap as the QR block.

## Merge evidence (survives squash)

RED `fbce5e1` (test reproducers) → GREEN `7c1486a` (engine, both mirrors) →
UI redesign commit (studio shell, block rows, paper preview, page wrapper).
