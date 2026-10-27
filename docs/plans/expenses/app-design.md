# Expenses in the merchant app — design and build brief

Approved by the owner 2026-10-22. Visual plan with phone mockups:
https://claude.ai/artifact/9XD3BPhJ9qg4QG6Bhr2hZV (source: the mockups are the spec for look and layout).

Scope: `webnegosyo-app/` only. Ships over the air to app 1.0.14. **No database, RLS, permission or web
changes.** No new native modules (no reanimated, gorhom, expo-haptics, expo-image, blur, gradient,
lottie, flash-list, skia, chart libs). Use RN `Animated`/`LayoutAnimation`, `react-native-svg`,
`SectionList`, `components/Modal.tsx` (never RN's Modal).

## Why (research summary)

- Amount first; category is the only other required tap. Repeats (ice, LPG, palengke) take two taps.
- The drawer is where money goes missing; pay-outs must be typed, listed and reconciled at close.
- Never block saving on a receipt photo; flag it gently ("No receipt") and give the owner a catch-up list.
- The owner's question is "how much did I keep?" — answer first, in a sentence.
- Benchmarks are gentle guides ("Usual", "On the high side"), never verdicts; the cashier is never blamed.

## Visual language (must match the rest of the app)

- Page gutter **20** (ScreenHeader's), vertical gap 12. Cream canvas `colors.background`.
- Cards: white, `radius.lg` (16), `shadow.sm`, **no border**. One ink hero per screen
  (`colors.heroInk`, radius 16, padding 20, `shadow.md`) — same as Home `HeroRevenueCard` and the Reports
  customer dashboard (`components/reports/RevenueSplitCard.tsx`).
- Pills are `radius.full`. `SegmentedControl` for view switches. `SectionHeader` for section titles.
  `ListRow` / action-row idiom from `components/reports/BringBackCard.tsx` for "do this" rows.
- Coral (`colors.accent`) only for selection and "do this". Expenses are shown in ink, never red, no minus.
  Red only for void, drawer short, loss. Green for kept / money in.
- Money: `formatCents(c, { compact: true })` for rows and detail; `BigAmount` for hero figures;
  `formatPesoShort` in tight bars (`lib/expenses/money-text.ts`). Tabular numerals everywhere.
- Category look: `categoryLook(category)` + `<CategoryTile>`; group colours in `colors.expenseGroups`
  (`ink`, `tint`, `onHero`). The old two-letter `CategoryBadge` is retired — replace every use.
- Category choosing: `components/expenses/CategoryPicker.tsx` (`CategoryGrid`, `CategoryList`). Show the
  full list IN PLACE (swap the body), never a sheet on top of a sheet.
- Words: plain English; Filipino category names stay. Fix → **Change**; Sort pay-outs → **Give these a
  category**; Needs a look → **Check these**; NOT AN EXPENSE → **Cash moved**; Prime cost → **Food + staff**;
  "Gastos this month" → **Spent in October**.
- Guardrails that must keep passing: `lib/screen-primitives.test.ts` (no glyph characters like › ▲ ✓ in
  `app/(main)`, use `Button`, `SectionHeader`), `lib/screen-header-mount.test.ts`, `lib/hubs.test.ts`,
  `lib/tab-icons.test.ts`, `lib/tablet-layout-wiring.test.ts` (Modal rule), `lib/navigation.test.ts`.
  If a screen in an exemption list becomes clean, remove ONLY that screen's entry.
- Tablets (short side ≥ 600, landscape): sheets centre via `useCenteredDialog()`; report-style screens
  use `useIsWideReports()` + `ReportsColumns` where two columns help.
- Every state designed: loading (skeleton or LoadingState WITH the header), error (ErrorState with retry,
  also a quiet banner when cached data is shown but a refresh failed), empty (EmptyState, plain words).

## Work packages and file ownership

Agents work in parallel in the same tree. Touch ONLY the files you own; if you need something from
another package, use the contract below or leave a note in your report.

| Pkg | Owns |
|---|---|
| B1 Expenses home | `app/(main)/expenses.tsx`, `components/expenses/ExpenseRow.tsx`, new `components/expenses/home/*`, new `lib/expenses/expenses-home*.ts` (+tests), `components/expenses/CategoryBadge.tsx` (delete when unused) |
| B2 Add sheet | `components/expenses/AddExpenseSheet.tsx`, `AddExpenseParts.tsx`, `ExpenseKeypad.tsx`, `AddExpenseSheet.test.tsx`, `lib/expenses/add-expense-form.ts` (+test), new `components/expenses/ExpenseUndoHost.tsx`, new `stores/expense-undo-store.ts`, mount line in `app/(main)/_layout.tsx` |
| B3 Detail + action sheets | `app/(main)/expense/[expenseId].tsx`, `components/expenses/ExpenseActionSheets.tsx`, `SortPayoutsSheet.tsx`, new `components/expenses/ReceiptViewer.tsx`, new detail view-model libs |
| C Profit | `app/(main)/profit.tsx`, `components/profit/*`, `lib/profit/*` |
| D Connections | `app/(main)/dashboard.tsx`, `app/(main)/reports.tsx`, `app/(main)/pos.tsx` (header only), `app/(main)/pos-sales.tsx` (param only), `components/ShiftCard.tsx`, `components/drawer/*`, `components/staff/ShiftHistoryList.tsx`, `components/StockMovementSheet.tsx` + its two callers (`inventory.tsx`, `ingredient/[ingredientId].tsx`), `lib/activity/detail-facts.ts`, `lib/assistant/links.ts`, the offline banner, `lib/expenses/use-expenses.ts` (`invalidateExpenses` only), new `lib/expenses/money-glance*.ts` |

## Contracts between packages

- **AddExpenseSheet props (B2 adds, D/B1/C use):** existing props stay. New optional
  `initialAmountCents?: number`, `initialNote?: string`, `initialIsStockPurchase?: boolean`
  (stock receive → "Record what you paid"). Opening with these fills the form; the owner can change them.
- **Save behaviour (B2):** "Save ₱X" saves and CLOSES the sheet; "Save + next" saves and keeps it open
  for the next entry. Either way the Undo bar ("Saved · LPG ₱1,050 · Undo", 6 s) is shown by a global
  `<ExpenseUndoHost/>` mounted once in `app/(main)/_layout.tsx` next to `ExpenseSync`, so it survives the
  sheet closing on any screen. The undo window / commit timing moves from the sheet into
  `stores/expense-undo-store.ts`; `onCommitted` keeps firing for the drawer.
- **Drawer mode (B2):** same sheet, title "Pay from the drawer", drawer chip + "Drawer has ₱X", "After this
  the drawer should hold ₱Y", no date and no paid-from row, save label "Pay ₱X from drawer".
- **POS Pay out (D):** `pos.tsx` header button routes to `/(main)/pos-sales?pay=1`; `ShiftCard` opens the
  drawer sheet when it sees the param and the user has an open shift.
- **Profit window → Expenses (C → B1):** Expenses accepts `?from=YYYY-MM-DD&to=YYYY-MM-DD` in addition to
  `month=`; B1 implements (filter the loaded month(s) to the range and say so in the header), C links with it.
- **Expenses filters (B1):** URL params `view=unsorted|drawer|no_receipt|check`, `category=`, `month=`,
  `from=`/`to=`, `add=1`. D's close-shift "See in Expenses" uses `view=drawer`.

## Screen specs

See the mockups. Key points per screen:

1. **Expenses** — ScreenHeader "Expenses", subtitle "October · All branches", actions: search, export.
   Ink hero: "Spent in October", month ‹ ›, BigAmount, change vs last month (`percentChange`, neutral pill,
   words not colour), split bar by group (`onHero` colours) + dot legend with %, footer "Today ₱X · N
   expenses" and, when `canSeeProfit` + platform backend, "Kept so far ₱Y" → Profit. "Needs you" card
   only when something needs the owner (unsorted pay-outs → sort sheet; no receipt over threshold; possible
   duplicates; waiting to sync / refused on this phone). SegmentedControl List | By category. Filter pills:
   All, Drawer, No receipt, Check these (count), Category (opens CategoryList sheet). Total follows filters.
   Search filters note / paid-to / category name. Day headers = eyebrow date + day total. Rows: CategoryTile
   30, title (note or category), meta "Category · Paid from · Who · time", amount right, small status line
   (No receipt dot / Waiting to send / Voided struck). Floating ink pill "Add expense". Export = month CSV
   via `components/ExportSheet.tsx` + `lib/export/csv.ts`. Cashier-only accounts never reach this screen.
2. **Add expense** — bottom-sheet look (grab handle, 22 radius top, "Cancel" text, title 24/800 like
   DrawerSheet), full height on phones, centred dialog on tablets. Amount left-aligned (₱ light, digits
   40–48/800, coral caret). Paid-from as a visible pill row (Cash on hand, GCash, Maya, Bank, Card, Owner's
   pocket). Repeat chips. CategoryGrid (swap to CategoryList in place for "All N"). Typing a note pre-picks
   a category via `suggestCategoryForReason` when none is chosen. Stock question inline only when asked.
   Extras row: Photo · Note · Date (calendar via `@react-native-community/datetimepicker`, up to the
   validator's limit) · Paid to. Keypad, then "Save + next" (secondary) and "Save ₱X" (primary).
3. **Pay from the drawer** — see contract above.
4. **Expense detail** — BackHeader always (also while loading). White hero card: CategoryTile 44,
   BigAmount, note · category, status pill. Flags explained as callouts with the fix as a button (no
   receipt → Add photo; possible duplicate → link to the other one; waiting/refused on this phone).
   Facts card: When (no raw ISO), Paid from (→ shift when drawer), Branch, Recorded by. Receipts as
   thumbnails → full-screen viewer (pinch not required; swipe between). History timeline. Bottom action bar:
   Add receipt · Change · Void. Change/Void/Sort sheets: no sheet-on-sheet, no hard-coded heights.
5. **Profit** — ScreenHeader "Profit"; SegmentedControl This week / This month / Last month / Pick. Ink
   hero: "Kept in October so far", BigAmount in `heroInkPositive` (loss: danger-light text + plain
   sentence), sentence "From ₱X in sales you kept Y%", falling bars Sales → Ingredients → Expenses → Kept.
   Three tiles: Food cost, Staff, Rent with gentle labels (Usual / On the high side / High) — thresholds
   in a tested pure function, phrased as "most restaurants". Where the money went (CategoryTile bars →
   Expenses with exact from/to). 6-period trend, current period hatched as unfinished. Findings as action
   rows with buttons. Cash flow view keeps working.
6. **Home + Reports** — Home: card under the sales hero with "Spent today ₱X · N expenses" (anyone with
   `expenses`) and "Kept this month ₱Y · Z% of sales" (only `canSeeProfit` + platform). Reports: a "Money"
   `SectionHeader` with two rows carrying live figures, above "Dig deeper"; the Profit row hidden for
   accounts that can't open it.
7. **Close shift** — a DrawerSheet replaces the Alert: expected cash built line by line (start, cash sales,
   paid for expenses · N, cash taken out, should be in the drawer), the shift's drawer expenses listed with
   CategoryTile, counted amount, "₱120 short" / "₱50 over" stated plainly. Managers see "Expenses ₱X · Taken
   out ₱Y" per open drawer and per shift in history.
