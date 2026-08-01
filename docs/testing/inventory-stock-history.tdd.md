# TDD evidence — stock movement history (Phase 4D)

**Source plan**: no `*.plan.md`. This is item 4 of the forward plan agreed in-session
after Phase 4B/4C ("`getStockMovementsAction` returns the ledger and nothing displays
it"). Journeys were written during this TDD run.

## User journeys

1. As a merchant, I want to see what moved an ingredient's stock, so that "why is
   this number wrong?" is answerable without opening SQL.
2. As a merchant, I want each movement's figure to reconcile with the balance beside
   it, so that the history explains the on-hand total rather than contradicting it.
3. As a merchant, I want to tell the movements the system wrote from the ones I typed,
   so that I know whether an order or a person caused a change.
4. As a merchant, I want to keep recording stock even when the history fails to load,
   so that a display problem never becomes a data-entry outage.

## Task report

### Task 1 — `toStockHistoryEntry`, the presentation rule

Turns a ledger row into a readable entry: signed stock-unit delta, balance, reason
label, optional entered-figure aside, automatic marker. Pure — no dates formatted, no
React imported, so the merchant app can reuse it unchanged.

- **RED**: `npx jest --testPathPatterns="inventory-stock-history"` →
  `Cannot find module '../../src/lib/inventory/stock-history'` (compile-time RED —
  the test newly references a module that does not exist).
- **GREEN**: same command → `Tests: 11 passed, 11 total`.

The load-bearing decision recorded by tests 4 and 5: a movement entered as `0.6 kg`
against an ingredient stocked in grams moved the balance by `600`. The **stock-unit**
delta leads (`+600 g`) so it reconciles with the balance shown beside it, and the
entered figure is carried as an aside (`entered 0.6 kg`) — and omitted entirely when
it would only repeat the delta.

### Task 2 — the history list in the stock dialog

`StockHistoryList` reads the ledger through `getStockMovementsAction` when the stock
dialog mounts, and renders loading / error / empty / list states.

- **RED**: `npx jest --testPathPatterns="inventory-stock-manager"` →
  `Tests: 5 failed, 7 passed` — the five new history tests failing because nothing
  rendered a history.
- **GREEN**: same command → `Tests: 12 passed, 12 total`.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | An incoming movement reads `+500 g` and is marked as inbound | `inventory-stock-history.test.ts:signs an incoming movement with a plus` | unit | PASS |
| 2 | An outgoing movement reads `-160 g` and is marked as outbound | `…:signs an outgoing movement with a minus` | unit | PASS |
| 3 | A zero-delta stocktake reads `0 g`, not `+0`/`-0` | `…:shows a zero-delta stocktake without a sign` | unit | PASS |
| 4 | The stock-unit delta leads so it reconciles with the balance | `…:leads with the stock-unit delta so it reconciles with the balance` | unit | PASS |
| 5 | The entered figure is omitted when it only repeats the delta | `…:omits the entered figure when it says nothing new` | unit | PASS |
| 6 | Rows with no recorded entered quantity render without one | `…:omits the entered figure for movements that never recorded one` | unit | PASS |
| 7 | Reasons render in the merchant's words (`Wasted`, `Order voided`) | `…:labels the reason in the merchant's words` | unit | PASS |
| 8 | NUMERIC round-trip zeros are trimmed from both figures | `…:trims the trailing zeros a NUMERIC round-trip leaves behind` | unit | PASS |
| 9 | Notes pass through, and null stays null | `…:carries the note through and null when there is none` | unit | PASS |
| 10 | Timestamps stay raw ISO — no locale formatting where a server render can see it | `…:keeps the timestamp raw rather than formatting it` | unit | PASS |
| 11 | Order-driven movements are flagged automatic | `…:marks a movement that came from an order` | unit | PASS |
| 12 | The ledger is not read until a merchant opens an ingredient | `inventory-stock-manager.test.tsx:does not read the ledger until the merchant opens the ingredient` | component | PASS |
| 13 | Opening the stock dialog lists what moved, for that ingredient | `…:lists what moved when the stock dialog opens` | component | PASS |
| 14 | Each movement shows signed and with the balance it left behind | `…:shows each movement signed, with the balance it left behind` | component | PASS |
| 15 | An ingredient with no history says so plainly | `…:says so plainly when an ingredient has no history yet` | component | PASS |
| 16 | A failed history read leaves the Record button usable | `…:keeps the recording form usable when the history fails to load` | component | PASS |
| 17 | Each open re-reads the ledger rather than caching the first read | `…:re-reads the ledger every time the dialog opens` | component | PASS |

## Coverage

```
npx jest --coverage --testPathPatterns="inventory-stock" \
  --collectCoverageFrom="src/lib/inventory/stock-history.ts" \
  --collectCoverageFrom="src/components/admin/stock-history-list.tsx"

File                     | % Stmts | % Branch | % Funcs | % Lines | Uncovered
All files                |   99.09 |    86.66 |     100 |   99.09 |
  stock-history-list.tsx |   98.48 |    77.27 |     100 |   98.48 | 76-77
  stock-history.ts       |     100 |    95.65 |     100 |     100 | 68
```

Both uncovered spots are defensive: the `catch` around a thrown (not merely failed)
action, and the branch where a unit id resolves to no abbreviation.

## Honesty notes and known gaps

- **Guarantee 12 is a guardrail, not a RED-first test.** It passed on the first run,
  because at that point nothing read the ledger at all. It is kept to lock the
  behaviour in — a future "prefetch history for every row" would make it fail.
- **One of my tests was wrong, not the product.** `lists what moved when the stock
  dialog opens` initially failed with *"Found multiple elements with the text:
  Received"* — `Received` is also a reason button on the form above the list. The
  assertion was scoped with `within(screen.getByRole('list'))`; nothing was weakened.
- **Read-only.** This phase displays the ledger and does not let anyone edit or delete
  a movement. `stock_movements` remains append-only by convention, not by constraint.
- **20 movements, no paging.** `getStockMovements` defaults to a limit of 20 and the
  UI offers no "load more". A busy ingredient's older history is reachable only in SQL.
- **Merchant app still has no inventory surface.** This is web-admin only; the
  presentation module is deliberately pure so the app can reuse it.
- **Pre-existing failures elsewhere.** The full sweep reports
  `3 failed, 240 passed` suites — all three (`order-item-images`,
  `printer-native-load`, `superadmin-nav`) live under `webnegosyo-app/` and belong to
  concurrent work; one is another session's in-flight RED. My two commits touch no
  file under `webnegosyo-app/`.

## Merge evidence

- RED checkpoint: `92a5d6e` — `test: add reproducers for the stock history view`
- GREEN checkpoint: `1bb7555` — `feat: show the stock movement history in the inventory manager`

Both reachable from `HEAD` on `feat/unified-modifier-groups`. Lint reports no errors or
warnings for the changed files (`npm run lint`; the repository's 83 pre-existing errors
are all in files this work did not touch).
