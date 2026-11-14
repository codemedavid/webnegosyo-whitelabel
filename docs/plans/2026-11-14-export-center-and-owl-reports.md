# Export center + Owl reports

Status: **APPROVED 2026-11-14** — owner said "go" to every §10 recommendation. Building on worktree `feat/export-center` off origin/main.

Extends `docs/plans/2026-11-05-reports-redesign/plan.md` (approved; its §6.6 "Exports" and phases A5 / W4 are replaced by this plan). The Reports tidy-up itself stays in that plan (§9 below says what is left of it).

## 0. Changes made while building (2026-11-14)

- **No stored files.** §5 planned a private bucket, signed links and a 24 h purge. Built instead: `POST /api/exports` = preview, `GET /api/exports?…` builds the file, writes one `report_exports` row as the caller, and **streams** it (a stream is not held to the 4.5 MB response cap). Why: every read and the log write stay on the caller's own session (RLS), no service-role client and no new place where customer data sits. Cost: "Recent exports" runs the same dates again instead of re-serving the old file, and says so.
- **Store Activity line `report.exported` is not written yet** (needs a category added to the activity constraint). The `report_exports` log is the record; owner + `activity_view` read all of it.
- **Payments received lists ledger rows only.** "Money received" on Summary also counts orders marked paid without a ledger row, so the two can differ; the sheet needs a note saying so (E3).
- Not yet in the sheets: money per payment method on Sales by day, customers per day, remittances, day closes, Store Activity, stock used & missing (daily stock report). The Profit statement is one column for the whole period, not one per month.
- **Owl's `export_report` does not build a file.** It previews as the caller and answers with a card whose links are `/api/exports?…`; the file is built when the link is tapped. Same reason as above, and Owl never sees the rows.
- **Previews are exact up to 1,500 orders** (the period is read whole); over that, sheets that add orders up show columns only.
- **E4 (app Export screen) built, not shipped.** `app/(main)/export.tsx` is a utility screen (no new tab, so no tab registry changes) opened from Reports → "Take it out" and from the Export buttons on Orders, Sales, Profit, Stock and Remittances (`exportHref`, that screen's sheets and dates pre-chosen). The catalogue comes from the server (`POST /api/exports` `mode: 'catalogue'`), so the app carries no second copy. On main-database stores with the Reports key the Orders and Sales buttons no longer build a CSV on the phone; other stores and accounts keep it. Kept on the phone: the full customer list and Expenses (different content / no Reports key needed). Needs the web deploy first (the catalogue mode), then an OTA. Proven: the app's three calls with a Bearer token against the real route as sample-demo's admin, and a rendered test of the screen. Not proven: the screen on a device or simulator, and the share sheet.

## 1. What the owner asked for

1. **Exports that are complete and easy to find.** "Export today" should give everything that happened: items sold, sales, customers, shifts, who the cashier was, inventory. Any date range, not only presets. The owner must know what a file contains before downloading it.
2. **Owl makes reports.** "Give me yesterday's report", "financial statement for October", "average order value per day" → a CSV/Excel file. Owl pulls from the same pre-built exports; it only builds something special when asked for a special format.
3. **Owl follows the owner's own format.** Upload a spreadsheet as the standard; Owl fills that layout.
4. **Works without Owl.** Everything Owl can export is on the Reports tab by hand.
5. **Reports are less crowded** (separate plan, §9).

## 2. What exists today (research 2026-11-14)

- **11 exports, scattered**: web = expenses (xlsx/csv), Senior/PWD books (csv), order-deletion backup, ingredients, 2 superadmin lists; app = orders, daily sales, analytics (Convex stores only), customers, expenses. No screen lists them.
- **Web `/admin/reports` has no export at all.** Shifts, drawers, remittance, day close = print / text slip only. No export for per-cashier sales, staff activity, or inventory over time (movements, deliveries, waste, counts).
- **Dates**: app sales export = presets only, ≤ 90 days, capped at 2,000 orders, own formula (not the one sales definition).
- **Duplicated plumbing**: 4 CSV writers, 2 separate exceljs builders, 3 download helpers. No shared workbook builder.
- **Owl**: 24 read tools, 20 propose tools; cards = stats / ranked / bars / confirm / lessons — **no file card**. Attachments accept images only (≤ 3, data URLs). 6 steps per turn, 12 s per tool, facts ≤ 3,000 chars. Refuses branch-locked accounts.
- **Download storage**: none. Routes stream the file back; Vercel caps a response body at 4.5 MB. R2 is public-only (no signed GET). Private Supabase buckets with short signed links exist for receipts and ID photos.
- **Data is all there on platform**: `orders` / `order_items` / `order_payments`, cashier = `customer_data.pos.cashierId` (+ `order_status_events`), `staff_shifts` / `shift_counts` / `shift_cash_movements` / `cash_remittances` / `business_day_closes`, `customers`, `stock_movements` (frozen cost) + daily stock report, `expenses`, `store_activity`. Readers exist for most (`src/lib/cash/*`, `src/lib/reports/read/*`, `src/lib/inventory/daily-report-read.ts`, `src/lib/expenses/read/*`).
- **Reports crowding, measured**: ~15 report destinations on web, ~22 in the app; sales/orders/average order shown in ≥ 6 places on web and ≥ 9 in the app; ~14 different date pickers in the app.

## 3. The idea in one picture

```
                 ┌───────────────────────────────┐
                 │  Export catalogue (one list)  │  src/lib/exports/
                 │  every "sheet" we can make    │
                 └──────────────┬────────────────┘
        ┌───────────────┬───────┴────────┬──────────────────┐
   Export page      Export button     Owl tools          (later) MCP
   web + app        on each report    "yesterday's       
   (by hand)        (pre-filled)       report please"    
```

One catalogue, one builder, one download path. The Export page, the per-report buttons and Owl are three doors into the same thing, so a file is identical whichever door made it.

## 4. The export catalogue (`src/lib/exports/`)

One typed entry per **sheet**: id (stored, never renamed), owner-word name, one-line "what one row is", columns (each with the staff key it needs), the reader, the staff key for the sheet, max range.

| Group | Sheet | One row is… | Key |
|---|---|---|---|
| **Sales** | Summary | the period: gross → discounts → net, service, delivery, collected, unpaid, + a Checks block | `reports` |
| | Sales by day | one business day: orders, customers, sales, average order, discounts, each payment method; cost & profit† | `reports` |
| | Items sold | one dish: qty, sales, share, category; cost & profit† | `reports` |
| | Categories · Order types & channels · Busy hours · Branches | one category / channel / hour / branch | `reports` |
| | Payments by method | one payment method | `reports` |
| **Orders** | Orders | one order: number, date, time, branch, type, channel, status, **cashier**, **shift**, customer, payment method, paid/unpaid, discount, service, delivery, total | `orders` |
| | Order lines | one dish on one order: order no., dish, variation, add-ons, qty, price, discount, category, notes | `orders` |
| | Payments received | one payment or refund: order no., time, method, amount, reference, **recorded by** | `orders` + payment read key |
| | Discounts & vouchers | one discount on one order: kind, code, amount, who gave it, reason | `reports` |
| | Cancelled, voided, refunded | one event: order, amount, who, reason, when | `orders` |
| **Customers** | Customers who ordered | one customer in the period: orders, spent, first-timer or regular, last order; name + phone | `customers` |
| **Staff & cash** | Shifts | one shift: cashier, drawer, branch, opened, closed, starting cash, expected, counted, over/short, reason, orders, sales | `cash_manage` (own shift: `pos`) |
| | Sales by cashier | one cashier: orders, sales, average order, discounts given, cancels | `reports` |
| | Cash in / out | one drawer movement: shift, kind, amount, reason, by whom | `cash_manage` |
| | Remittances · Day closes | one hand-over / one closed day | `cash_manage` |
| | Activity log | one action: who, what, when, amount, approved by | `activity_view` |
| **Stock** | Stock on hand | one ingredient now: qty, unit, reorder level; unit cost & value‡ | `inventory` |
| | Stock movements | one movement: ingredient, reason (delivery, sale, waste, count, transfer), qty, balance after, who, order no.; cost‡ | `inventory` |
| | Stock used & missing | one ingredient per day: opening, received, used by sales, wasted, counted, missing (variance) | `inventory` + `costs` |
| **Books** | Expenses (existing) · Senior & PWD book (existing) · Profit statement | — | `expenses` · `discount_review` · `reports`+`costs`+`expenses` |

† needs `costs`. ‡ cost columns need `costs`; without it the columns are simply absent, never blank-but-there.

**Packs** = named sets of sheets in one Excel file:
- **Day pack** ("Everything that happened"): Summary, Sales by day, Orders, Order lines, Payments received, Items sold, Customers who ordered, Shifts, Sales by cashier, Cash in/out, Discounts, Cancelled/refunded, Stock movements, Stock used & missing, Expenses. Sheets the caller may not see, or the store doesn't use (no inventory, no shifts), are left out and the preview says so.
- **Accountant pack** (from the 11-05 plan): Summary + Checks, Sales by day, Payments, Discounts, Senior/PWD book, Cancellations & refunds, Items, Expenses, Definitions.
- **Profit statement** ("financial statement"): Sales → less discounts → Net sales → Cost of food → Gross profit → Expenses by category → Profit, per month across the range. From `profit-model.ts`. Labelled "for your records", no BIR claim (same rule as the 11-05 plan).

**Rules every sheet follows**
- Money from the ONE sales definition (`src/lib/reports/`); sheets that summarise use the existing report SQL; no new revenue formula. Summary carries a **Checks** block (Σ days = Σ items = Σ payments = summary) so the file proves itself.
- Read through the **caller's session client** (RLS applies), routed by `resolveOrderBackend`. Branch-locked accounts always get their own branch.
- Row-level sheets (orders, lines, movements): paged by key past the 1,000-row cap, each page under a statement timeout, ≤ **93 days** and ≤ 50,000 rows per sheet — over that the export is refused with a plain message ("pick a shorter range"), never silently cut. Summary sheets: ≤ 13 months (existing chunked engine).
- One shared workbook builder (`workbook.ts`: header block with store / period / branch / "as of", frozen header, autofilter, ₱ number cells, formula guard) and one CSV writer; the four existing writers move onto it over time, not in this plan's first phase.
- Formats: **Excel** (default, one file, one tab per sheet) or **CSV** (one file; several sheets = a .zip, `fflate` is already a dependency).

## 5. The Export page (by hand, no Owl needed)

Web `/admin/reports/export` · app `Reports → Export` (same three steps, same server).

```
1  What do you need?           2  When?                       3  Check, then download
┌──────────────────────────┐   Today · Yesterday · Last 7    You're exporting:
│ ★ Everything that        │   This month · Last month       Day pack · Nov 14 · All branches
│   happened (Day pack)    │   Pick dates  [Nov 1]→[Nov 14]  ─────────────────────────────
│ ★ For my accountant      │   Branch [All ▾]                ✓ Orders            132 rows
│ ★ Profit statement       │                                 ✓ Order lines       418 rows
│ ── or pick sheets ──     │                                 ✓ Shifts              4 rows
│ Sales  Orders  Customers │                                 – Stock (not set up)
│ Staff & cash  Stock Books│                                 ▸ peek: first 5 rows of each
└──────────────────────────┘                                 [Excel ▾]  [ Download ]
```

- Each sheet card says in one line what a row is ("One row per order, with cashier and payment").
- Step 3 is the "know what you're exporting" answer: sheet list, row counts, the columns, a 5-row peek, anything left out and why. Counts come from a cheap count query, not from building the file.
- **Recent exports** list under it (who, what, when, re-download for 24 h).
- **Export button on every report page** opens the same dialog with that report's sheet, period and branch already chosen.
- App: the file is downloaded with the bearer token and handed to the share sheet (`expo-file-system` + `expo-sharing` are already in the binary → OTA). The old on-device CSVs are retired for platform stores once this is live.

**Server**
- `POST /api/exports` (cookie or bearer; `withRequestBearer`) → validates the request against the catalogue + the caller's keys → builds → stores the file → returns `{ id, name, sheets:[{name, rows}], expiresAt }`. `GET /api/exports/:id/download` re-checks the caller and redirects to a 5-minute signed link.
- Files live in a **private Supabase bucket `report-exports`** (same pattern as `expense-receipts`), path `tenant/user/id`, deleted after 24 h by pg_cron. This gets past Vercel's 4.5 MB response cap and gives Owl and the app one download path.
- `report_exports` table = the log (tenant, user, sheets, period, branch, row counts, format, source `page` | `button` | `owl`, template id). Staff read their own rows; owner + `activity_view` read all. Also one Store Activity line `report.exported`.
- Limits: per-person burst limit, one build at a time per store (advisory lock), 60 s budget; refused cleanly when over.

## 6. Owl: three levels

Principle unchanged: **Owl never types a number into a file.** It chooses *what* goes in; tested server code fills it in. The model never sees the file's contents (names, phones) — only a short summary.

### 6.1 "Just give me the report" — `export_report`
- Input: `sheets[]` or `pack` (catalogue ids — a fixed enum), `whenFields` (existing any-date input), `format`.
- Runs the SAME builder as the Export page with the caller's session. Own timeout (like the photo tool).
- Returns `facts` = what was made (sheet names, row counts, period, headline totals, what was left out and why) + a new **`file` card**: name, size, sheets, "Download" (→ `/api/exports/:id/download`), expiry. Web renders a download button; app downloads + shares.
- Examples it covers with no extra work: "export today", "yesterday's orders with the cashier", "shifts this week", "inventory movements for October", "October financial statement".

### 6.2 "I want it my way" — `build_custom_report`
- Owl writes a **spec**, not data: title, rows (`day` | `week` | `month` | `item` | `category` | `cashier` | `shift` | `customer` | `order` | `payment method` | `hour` | `branch`), columns (metric ids from the registry / column ids from the catalogue), filters (order type, channel, branch, cashier, category), sort, top N, column names and order.
- The server validates the spec (unknown field → the tool answers with the nearest valid ones so Owl can correct itself), fills it from the engine, returns the file card + the first rows as facts so Owl can talk about it ("your best day was Saturday at ₱18,420").
- Covers: "average order value per day this month", "who bought what today", "top 20 customers by spend with their favourite dish", "sales per cashier per shift".
- A good custom report can be **saved** ("save this as Weekly owner report") → §6.3 storage → it then appears on the Export page too.

### 6.3 "Follow my format" — uploaded spreadsheet
- Upload `.xlsx` / `.csv` ≤ 2 MB: `POST /api/assistant/files` (multipart, same access as chat; mirrors the voice route). Parsed with the existing reader (`src/lib/inventory/import/workbook.ts`).
- The model is shown only the **outline**: sheet names, header cells, row labels, and 3 sample rows with cells cut short — marked as data, never as instructions. Formulas, macros and links are not followed or kept.
- Owl proposes a **mapping**: each of the owner's columns / rows → a catalogue field or metric, or "can't fill". It shows the mapping in plain words first ("'Benta' → Sales · 'Gastos' → Expenses · 'Upa' → I don't have this; left blank") and the owner confirms.
- The server builds a new workbook with the owner's sheet names, column order and headings, filled from the engine; unfilled cells stay blank and are listed.
- Saved as a **format** in `report_templates` (tenant, name, layout, mapping, created by). Next time: "yesterday's report in my format" — or pick it under **My formats** on the Export page, no Owl needed.
- App: needs `expo-document-picker` (a new native module → next store build). Until then the app uses formats saved from the web.

### 6.4 "Be able to see it all"
- Owl's read tools already cover sales, items, customers, inventory, staff, activity, orders (any date on the unmerged `feat/owl-any-date-activity` branch — **this plan needs that branch merged first**).
- Gaps closed here: shifts & drawers (`get_shifts`: over/short, who, sales) and expenses/profit (`get_profit`) — both were R3 "Money" on the Owl roadmap; they are needed so Owl can *answer* about what it exports.
- Budget: a file counts as one turn; ≤ 20 Owl exports per store per day; steps per turn unchanged.
- New tools go at the END of the tool list (cached prefix); labels mirrored in the app (`presentation.ts`, `links.ts`).

## 7. Database

| Migration | What |
|---|---|
| `report_exports` | the log; RLS: own rows, owner/`activity_view` all; service-role inserts |
| bucket `report-exports` + pg_cron purge | private, xlsx/csv/zip MIME, 24 h |
| `report_templates` | saved formats / saved custom reports; store-wide accounts with `reports` |
| export readers | where a sheet needs it: SECURITY INVOKER functions in the post-outage pattern (`RETURN QUERY EXECUTE`, children by `= any(array(...))`), e.g. orders-with-cashier-and-shift, customers-in-period; an expression index on `(tenant_id, (customer_data->'pos'->>'cashierId'))` built CONCURRENTLY |

Every migration: PGlite runner per role, applied to platform, probed as the real roles (owner, staff without the key, branch-locked, other store, anon) asserting rows, types regenerated. Live probes start with `set local statement_timeout = '5s'` and one day.

## 8. Build order (each phase ships on its own)

| Phase | Scope | Ships |
|---|---|---|
| **E1. Engine + Sales/Orders** | catalogue, workbook + CSV builder, storage + log, `POST /api/exports`; sheets: Summary, Sales by day, Items, Categories, Channels, Payments by method, Orders, Order lines, Payments received, Customers who ordered | server |
| **E2. Export page (web)** | 3-step page, preview with counts + peek, custom range, recent exports, Export button on every `/admin/reports` page | web |
| **E3. Staff, cash, stock + packs** | Shifts, Sales by cashier, Cash in/out, Remittances, Day closes, Activity, Stock on hand / movements / used & missing, Discounts, Cancelled; Day pack, Accountant pack, Profit statement | web |
| **E4. App Export** | Reports → Export (same server), Export button on app report screens, retire on-device CSVs on platform stores | OTA |
| **O1. Owl exports** | `export_report`, file card (web + app), `get_shifts`, `get_profit` | web + OTA |
| **O2. Owl custom reports** | `build_custom_report`, save as a format | web + OTA |
| **O3. Owl follows my format** | upload (web), outline → mapping → confirm → fill, My formats on the Export page | web; app upload at next store build |

Tests per phase: catalogue contract test (every sheet: columns, keys, reader, never-renamed ids), builder unit tests, **reconciliation property test** (Σ order lines = Σ orders = Summary net, to the centavo, over `reportOrdersArb`), capped-fake-table tests for paging, role tests per sheet (a column the caller can't see is absent), Owl scripted-model + golden routing prompts (EN + Taglish), live checks on `sample-demo` as real roles, browser walk with `verify-webnegosyo`, timings on the largest store under `benchmark-checklist`.

## 9. The Reports tidy-up (separate plan — where it stands)

Already approved on 2026-11-05: one **Reports** entry, one period bar, Overview → short report list → Export. Built so far: the engine (#105) and the app Sales overview (#106). **Not built**: Sales by day/month, the Items tree, web sidebar restructure, breakdowns on the shared engine.

Proposed after this plan is OK'd: a short addendum to that plan (not a new one) that
- makes the landing three doors: **Today · Reports · Export**;
- cuts the app's ~22 destinations and ~14 date pickers to the one period bar and the report list in that plan;
- moves Cash, Stock report, Senior & PWD, Activity under Reports as links instead of separate hubs.

## 10. Decisions for the owner

1. **Stores**: platform stores first (the majority); Convex stores keep today's app exports until they move. *(Recommended)*
2. **Format**: Excel by default, one file with a tab per sheet; CSV on request (a zip when several sheets). *(Recommended)*
3. **Range**: any dates; detail sheets (orders, lines, stock movements) up to 93 days per file, summaries up to 13 months. *(Recommended — protects the shared database)*
4. **Who can export**: follows the existing staff keys per sheet; customer phones only with `customers`; costs only with `costs`; every export logged with the person's name. *(Recommended)*
5. **Owner's format**: Owl builds a NEW file that copies the layout (sheet names, headings, order). *(Recommended for v1)* Filling the owner's original file while keeping its colours and formulas = later.
6. **Order**: Export page first (E1–E4), then Owl (O1–O3), because Owl pulls from it. *(Recommended)* Or O1 right after E3 if Owl matters more than the app screen.
7. **Reports tidy-up**: continue the 11-05 plan after E4, with the addendum in §9. Or pause exports after E2 and tidy first.

## 11. Risks

- **Shared database** (1 GB host, memory-tight on 2026-11-12): detail exports are the heaviest reads we have. Mitigated by paging, timeouts, one build per store, range + row caps, and counting before building. Timings measured before each phase ships.
- **Branch base**: local `main` and `origin/main` have diverged, and Owl any-date is unmerged. Work starts on a worktree off `origin/main`; O1 waits for any-date to land.
- **Orders change after the fact** (edits, refunds): every file says "as of <time>".
- **Uploaded files are untrusted**: size cap, outline only, no formulas/macros/links, cell text cut short and treated as data.
- **PII in files**: customer names/phones leave the system in a file. Gated by `customers`, logged, links expire in 5 minutes, files deleted in 24 h.
