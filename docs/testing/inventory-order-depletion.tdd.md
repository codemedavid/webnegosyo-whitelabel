# TDD Evidence — Order-driven stock depletion (Phase 4B/4C)

## Source

No `*.plan.md` file was used. Journeys were derived during this TDD run.
Earlier phases: [1](./inventory-cost-mode.tdd.md),
[2](./inventory-recipe-editor.tdd.md), [3](./inventory-prep-items.tdd.md),
[4A](./inventory-stock-ledger.tdd.md).

## User journeys

- As a merchant, I want stock to go down when an order is placed, so what the
  system says I have matches what is in the kitchen.
- As a merchant, I want an order's effect on stock to appear in the same history
  as my manual movements, so one place answers "where did it go?".
- As a merchant, I want a broken recipe never to cost me a customer's order.

## The plan changed: 4B and 4C collapsed into one phase

The plan had **4B (Convex depletion, 5–7h)** and **4C (tenant-Supabase
depletion, 2–3h)** as separate phases. They are not separate work.

Inventory lives in the **platform** Supabase for every tenant, whatever backend
holds their *orders*. And all three order backends — Convex, a tenant's own
Supabase project, and the shared platform DB — converge in `createOrderAction`.
So depletion hooks in once, at the convergence point, and serves all three. Three
call sites, one implementation. Reimplementing it per backend would have been
three copies of the same Supabase writes.

## A discovered constraint that shaped the scope

`resolveConfiguredRecipeIds` matches recipes on `variation_option_id`,
`addon_id` and `modifier_option_id`. **Order items carry none of those.** A line
carries `variation` as a comma-joined *display string* ("Large, Extra Spicy")
and `addons` as an array of names.

I could have split that string on `", "` and matched names back to ids. I did
not, and the reason is specific: an option whose name contains a comma would
silently deplete **the wrong ingredient**. On a costing display a wrong number
is visible; on the depletion path it quietly corrupts stock and the ledger
records the corruption as fact.

So this phase depletes **base recipes only**. Options and addons are accepted as
input by `resolveOrderDepletions` and covered by tests, but nothing supplies
them yet. The effect is that stock **under-depletes** — it reads higher than
reality for tenants who cost their modifiers. That is the safe direction, and it
is fixed by carrying ids through the order payload, which is a change to one
caller rather than a redesign.

## Task report

### Task 1 — Resolve what an order takes off the shelf

`src/lib/inventory/order-depletion.ts` — the consumer
`resolveConfiguredRecipeIds` was built for in Phase 0 and never had.

- **RED**: `npx jest --testPathPatterns="inventory-order-depletion"`
  → `Cannot find module '@/lib/inventory/order-depletion'` (compile-time RED).
- **GREEN**: same command → `Tests: 9 passed`.
- **Quantities are not converted here.** One recipe may measure flour in grams
  and another in kilograms; converting needs the ingredient's stock unit, which
  is the ledger's job. Merging happens per (ingredient, *unit*) so the two never
  get summed into a nonsense number. A test pins this.
- **Uncosted items contribute nothing** rather than throwing. Most menus are
  only partly costed and an uncosted item must never break an order.
- **Repeated lines merge** into one movement, so history stays readable.

### Task 2 — Write the movements, and never cost an order

`order-stock-service.ts` writes through the same append-only ledger a merchant
uses by hand, so an order's effect is visible in the same history and reversible
by the same mechanism (`void` movements carry the `order_id`).

- **These four tests are characterization tests, not RED-first.** They were
  written after the implementation and passed on first run, so they carry no RED
  evidence. Rather than claim otherwise, I mutation-checked them: removing the
  `try/catch` that makes the function best-effort produced
  `Tests: 2 failed, 2 passed`, and restoring it returned `4 passed`. They catch
  the regression they exist for; they just did not drive the design.
- **Service-role client, deliberately.** A customer placing an order has no
  admin session and inventory RLS is admin-only. Tenant scoping is enforced by
  filtering every read and write on `tenant_id`, and again by the ledger trigger,
  which rejects a movement naming an item outside its tenant (proven in 4A).
- **One bad recipe line is skipped and reported**, not allowed to sink the whole
  order's depletion.

### Task 3 — Hook into all three backends

`depleteStockForOrder` is called on each success path in `createOrderAction`,
gated on the tenant's `inventory_enabled` flag so tenants without inventory pay
no query cost.

- **GREEN**: `npm run build` → Compiled successfully; three call sites verified
  at `orders.ts:406, 432, 457`.

## Test specification

| # | What is guaranteed | Test | Type | Result | Evidence |
|---|--------------------|------|------|--------|----------|
| 1 | Ordering an item spends its base recipe | `inventory-order-depletion.test.ts` | unit | PASS | `npx jest inventory-order-depletion` |
| 2 | Quantities multiply by how many were ordered | same | unit | PASS | same |
| 3 | The same ingredient across lines merges into one movement | same | unit | PASS | same |
| 4 | The same ingredient in different units is NOT summed | same | unit | PASS | same |
| 5 | An item with no recipe spends nothing and does not throw | same | unit | PASS | same |
| 6 | Selected option/addon recipes are spent when ids are supplied | same | unit | PASS | same |
| 7 | An unselected option's recipe is not spent | same | unit | PASS | same |
| 8 | Empty and zero-quantity lines write nothing | same | unit | PASS | same |
| 9 | A database failure never surfaces to the order | `inventory-order-stock-besteffort.test.ts` | unit (characterization) | PASS | mutation-checked |
| 10 | A rejected query never rejects the order | same | unit (characterization) | PASS | mutation-checked |
| 11 | An uncosted menu reads one table and stops | same | unit (characterization) | PASS | `from` called once with `recipes` |
| 12 | Depletion is wired into all three order backends | `npm run build` + `orders.ts:406,432,457` | build | PASS | Compiled successfully |
| 13 | No regression across inventory/order surface | `npx jest "inventory\|recipe\|modifier\|menu-item\|addon\|order"` | unit | PASS | 642 passed |

## Coverage and known gaps

```
npx jest --testPathPatterns="inventory-order" --coverage \
  --collectCoverageFrom="{src/lib/inventory/order-depletion.ts,src/lib/inventory/order-stock-service.ts}"

File                    | % Stmts | % Branch | % Funcs | % Lines
All files               |   71.37 |    78.12 |      75 |   71.37
 order-depletion.ts     |     100 |    93.75 |     100 |     100
 order-stock-service.ts |   55.74 |     62.5 |   66.66 |   55.74
```

`order-depletion.ts` — the part that decides what leaves the shelf — is at 100%.
`order-stock-service.ts` is at 56%: the covered half is the error handling and
early exits; **the uncovered half is the main success path** (lines 107–148),
which builds and inserts the movement rows. It has no test because the repo has
no Supabase-mocking pattern for services deep enough to drive four chained
queries. It has also never run against a real database.

**Gaps, stated plainly:**

- **Depletion has not been observed working end to end.** No test and no manual
  run has placed an order and watched stock go down. The pieces are proven
  individually; the whole is not.
- **Modifier and addon recipes are not depleted** — see the constraint above.
  Tenants who cost their modifiers will under-deplete until order items carry
  ids.
- **Nothing returns stock when an order is cancelled.** `applyOrderStockMovements`
  takes a `'void'` direction and writes reversing movements, but no caller
  invokes it — `updateOrderStatus` was not touched. A cancelled order currently
  keeps its ingredients spent.
- **No idempotency.** Nothing stops the same order depleting twice if the
  creation path were ever retried. `order_id` is recorded on every movement, so
  the fix is a uniqueness check, but it is not there.
- **The three call sites are unverified by test.** `createOrderAction` is a
  ~400-line server action with no test harness; the wiring is proven only by the
  type checker.
- Prep ingredients are depleted as themselves, not exploded into their
  components — ordering a pizza reduces "Pizza Dough", not the flour inside it.
  Defensible (the dough was made earlier) but worth stating.

## Pre-existing failure, not introduced here

`webnegosyo-app/lib/order-item-images.test.ts` fails to run
(`Cannot access 'mockFrom' before initialization` — a jest.mock hoisting bug).
That file is untouched by this work (`git diff HEAD --name-only` → 0 files under
`webnegosyo-app/`); it surfaced only because this run's test pattern includes
"order".

## Merge evidence (checkpoint commits)

| Commit | Stage |
|---|---|
| `36fa7ff` | RED — reproducer for order-driven stock depletion |
| `8ce2ca7` | GREEN — depletion resolver, ledger writes, and backend wiring |

Lint: `npx eslint` over every changed file → clean.
