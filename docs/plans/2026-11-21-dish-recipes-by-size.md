# Dish recipes by size and choice: plan

Status: **PLAN, waiting for the owner's OK.** No code written yet.
Date: 2026-11-21.

## 1. How it works today

A dish can have one **dish recipe** (`recipes.target_type = 'menu_item'`). Each choice on the dish can also have its own recipe (`modifier_option`, or the legacy `variation_option` / `addon`).

A choice recipe is **added on top of** the dish recipe. It never replaces it. This rule is the same everywhere: depletion (`order-depletion.ts` `resolveLineRecipePortions`), stock guards (`producible.ts`), auto-86, the POS mirrors and the cost-at-sale trigger.

That rule fits add-ons ("Extra shot +10 ml coffee"). It fights how owners think about sizes and other pick-one choices. An owner thinks "a Large uses a 22 oz cup and 250 ml milk". They don't think "a Large is the dish recipe plus 6 oz of cup".

## 2. What the live platform DB shows (read-only, 2026-11-21)

| Fact | Number |
|---|---|
| Stores with at least one dish recipe | 23 |
| Stores with at least one choice recipe | 6 (283 `modifier_option` + 18 `variation_option` rows) |
| Dishes with sizes/choices **and** a dish recipe | 191 |
| …of those, with **no** choice recipe at all | **162 (85%)**: a Large takes exactly what a Small takes |
| Size-like groups (size/oz/cup/regular/large…) on a dish with a recipe | 19, and 17 of them have no per-size recipe |

**Counted twice.** At `11-21-cafe-chill`, each flavour of the Ice Cream cones repeats the whole dish recipe: cone, cream base and water. The dish recipe already has them, so every sale would take **2 cones** and double the base powder. 73 of the store's 96 choice lines repeat a dish-recipe line. The store has no orders yet, so nothing has been deducted wrongly so far. `keto-lifestyle-cafe` shows the same pattern (7 of 9 lines).

At `uncle-drei-s-teasnacks-cafe-tanza-cavite` (the heaviest user, 1,447 deducted orders in 30 days), most overlaps are real extras such as an extra shot or extra pearl. Its sugar levels, though, hold the full amount (10–25 ml), and the dish recipe also holds a stray 1.39 ml. That is "replace" thinking typed into an "add" model.

We don't repair live data, so none of these rows get changed. The fix is to show the mistake to the owner and offer a one-tap fix that the owner applies.

## 3. Gaps in the current screens

**Web dish editor**
- Legacy sizes and choices (`variations` / `variation_types`, 124 dishes in recipe stores) have **no recipe editor on the web**. Only the app can attach one.
- Modifier options hide the recipe under option settings → "Stock tracking: From recipe ingredients". A recipe made in the app (which never sets `stock_mode`) still deducts on every sale, but the web doesn't show it.
- Each choice is a separate editor with a separate save. A dish with 3 sizes and 5 ingredients means 15 lines across 4 editors, and you can't copy between them.
- Nothing shows what one Large actually takes in total. You only ever see the delta.

**Web Inventory → Recipes workbench**
- It edits only the dish recipe. Choices aren't there.

**Merchant app**
- It has a choices list (good), opened one choice at a time. The same "on top of" wording applies, there's no total per version and no duplicate warning.

**Saving**
- `saveRecipeForTarget` deletes and then re-inserts lines. If it fails in between, the recipe is left empty. Saving several recipes of one dish at once would make this worse.

## 4. Proposal: enter what each version uses; store it the way it's stored now

### 4.1 Model (no change to storage or depletion)

The owner types the **total** each version uses. The engine splits it:

- **The part every version shares** = the smallest amount across the group's options → the dish recipe.
- **The rest** → that option's recipe (always ≥ 0, so `recipe_components_quantity_ck` holds).

Small 12 oz / Medium 16 oz / Large 22 oz of milk is stored as 12 oz in the dish recipe, plus 0 / 4 / 10 oz on the sizes. Base + delta equals exactly what the owner typed, for every version. Depletion, POS, auto-86, cost-at-sale and reports read the same rows the same way, so **none of them change**.

Which UI each group gets:
- **Pick-one groups** (`max_select = 1`, not `selection_mode = 'quantity'`; legacy sizes and variation types too) → the **"Changes by size"** table. One pick-one group per dish ("Recipe changes by: Size ▾").
- **Pick-many groups and add-ons** → **"Each pick adds"**, the current per-pick model, now with copy-to-all and a per-pick total.
- An ingredient that changes by Size × Flavour together (for example, syrup amount depending on size) can't be stored without combination recipes. **Out of scope.** The table says so if it meets one.
- If the pick-one group is optional and nothing is picked, the sale takes only the shared part. The table notes this under optional groups.

### 4.2 Web: one "Ingredients" panel (dish editor + Inventory workbench)

```
Ingredients                                   Recipe changes by: [Size ▾]
┌──────────────────────┬─────────┬─────────┬─────────┐
│ Ingredient           │ Small   │ Medium  │ Large   │
├──────────────────────┼─────────┼─────────┼─────────┤
│ Cup 12/16/22 oz      │ 1 pc*   │ 1 pc*   │ 1 pc*   │  * a different cup per size = 3 rows
│ Fresh milk           │ 180 ml  │ 220 ml  │ 250 ml  │
│ Espresso beans       │ 18 g    │ 18 g    │ 18 g    │  ← "Same for all" chip
│ + Add ingredient     │         │         │         │
├──────────────────────┼─────────┼─────────┼─────────┤
│ One sale takes       │ 3 items │ 3 items │ 3 items │
│ Cost (costs key)     │ ₱24.10  │ ₱27.80  │ ₱31.20  │
└──────────────────────┴─────────┴─────────┴─────────┘
Each pick adds
  Add-ons ▸ Extra shot   +10 ml coffee        [Copy to…]
  Add-ons ▸ Pearl        +14.3 g pearl
```

- The cell is the total for that version. An empty cell = 0 for that version.
- "Same for all" fills the row. A row's unit is shared across its columns.
- Phone width: the table turns into version tabs (same as the app, §4.3).
- "Copy recipe from…" another dish. This matters for "SERIES" menus where many dishes share one recipe.
- Legacy sizes and variation types get the same panel. A recipe's visibility no longer depends on `stock_mode`: if a recipe exists, it shows.
- The Inventory → Recipes workbench opens this same panel, so choices are covered there too.

### 4.3 App: version tabs

The recipe screen gets `[ Small | Medium | Large ]` tabs. Each tab lists the full recipe for that version (totals). Lines that are the same in every size carry an "All sizes" tag. Editing a shared line asks "All sizes / Only Large". Adding an ingredient asks the same. Add-on picks stay as a list. It uses the same engine as the web: a byte-identical mirror plus a parity test, as with `receipt-layout`.

### 4.4 Mistake checks (shown on web + app, never applied automatically)

A pure `recipe-checks.ts`:
1. **Counted twice.** An ingredient is in the dish recipe AND in every option of a pick-one group. Message: "Each sale takes 2 cones." The owner gets one tap, "Count it once", which takes it out of the choices. This catches the Cafe Chill case.
2. **Sizes take the same.** A size-like group sits on a dish that has a recipe, and no version differs. Nudge: "Does a Large use the same as a Small?" This covers the 162-dish gap.
3. **Version total shown everywhere** ("One Large takes …"), so delta-only thinking never has to happen.

### 4.5 Saving all at once

New RPC `save_dish_recipes(p_tenant, p_menu_item, p_recipes jsonb, p_expected_version)`:
- plpgsql, **SECURITY INVOKER** (RLS and the existing recipe/unit guard triggers still apply).
- Writes the dish recipe and every choice recipe of that dish in **one transaction**.
- Compare-and-set on the dish's recipe version, so an app edit made in the meantime isn't overwritten.
- Asserts affected rows and raises 42501 on a silent RLS refusal.

The TS route keeps the line rules (`assertRecipeLinesDeductible`) and the zod check, then calls the RPC. Callers: a web server action and the app via `POST /api/inventory/dish-recipe` (bearer).

## 5. Blast radius

- **Unchanged:** depletion, `producible.ts`, POS stock mirrors, cost-at-sale trigger, reports, Convex. Storage shape and semantics stay the same.
- **Behaviour shift to call out:** shared amounts now land in the dish recipe. Auto-86 reads only the dish recipe, so a dish whose cups run out will now be 86'd. Before, that didn't happen when cups lived only in the sizes. This is correct, but it's new.
- **Security surface:** the new RPC (menu key, store-wide account, other store, branch-locked, anon). Prove it with a PGlite runner over the real migration plus a live probe as each role.
- **Mirrors:** engine web ⇄ app (parity test). The existing per-target route stays for older app builds.

## 6. Phases

1. **Engine** (pure, TDD): load → versions view → edit ops → split on save; checks. Property tests: base + delta = what was typed for every version, nothing negative, untouched groups kept, save∘load idempotent.
2. **Atomic save**: migration + PGlite runner + apply + probe as owner / staff without `menu` / branch-locked / other store / anon; regenerate types; route + server action.
3. **Web UI**: Ingredients panel in the dish editor and the workbench; legacy sizes covered; `stock_mode` gate removed from display.
4. **App UI**: version tabs + checks (JS only, OTA-able).
5. **Prove it**: browser walk on `sample-demo` (verify-webnegosyo). Then a sample-demo Large order, checking that `stock_movements` takes exactly the Large total. Simulator walk of the app screen. A read-only check that the Cafe Chill warning appears.

## 7. Decisions (owner, 2026-11-21)

1. One "changes by" group per dish; Size × Flavour combinations are out of scope. **Yes.**
2. Stores that count an ingredient twice today (Cafe Chill, Keto): in-product warning + one-tap "Count it once" only. No outreach, no live data repair.
3. **Web first**; the app's version tabs come in a later phase.

## 8. Status (2026-11-22)

- Engine (`src/lib/inventory/dish-recipe/`), `save_dish_recipes` (APPLIED + probed on platform 2026-11-22), `GET/PUT /api/inventory/dish-recipe`, `DishRecipePanel` in the dish editor, the new-dish recipe step and Inventory → Recipes: built.
- Browser-proven on sample-demo (`.claude/skills/verify-webnegosyo/drive/dish-recipe.spec.ts`, desktop + phone).
- Not done: a live sample-demo order proving the deduction (engine covered by the property test over the real `resolveOrderDepletions`); the per-choice recipe editors inside option rows still exist beside the panel; app phase.
