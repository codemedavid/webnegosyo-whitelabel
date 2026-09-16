# Restore variations and quantity-based add-ons on web ordering

Date: 2026-09-16
Status: Approved by the user: implement per-item add-on quantities.

## Customer and merchant behavior

Menu management should expose two clearly named sections and creation actions:

- **Variations:** choices that configure the item, such as Size or Protein.
  New groups default to choosing one option. Preserve existing required and
  multi-choice rules; do not silently convert existing configured groups.
- **Add-ons:** extras such as Cheese or Extra Rice. Customers can choose several
  extras and increase or decrease each extra with a minus/quantity/plus control.
  New add-on groups are optional and uncapped by default. Zero removes an extra.

Proposed quantity meaning: quantities apply to each unit of the parent item.
Two burgers with three extra cheese portions each charge for and consume six
extra cheese portions. Show this meaning beside the quantity controls.

An add-on capped to one unit is still an add-on. Its type must not change merely
because a merchant changes the maximum. For quantity-enabled groups, any configured
minimum or maximum counts total portions; existing choice-only groups retain their
existing distinct-choice rules.

## Findings from the current source

1. `src/components/admin/menu-item-form.tsx` replaces the separate editors with
   `ModifierGroupsEditor` when the tenant feature flag is enabled.
2. `src/components/admin/modifier-groups-editor.tsx` offers “Add Group” and “Allow
   multiple,” without an explicit variation/add-on distinction. New groups
   default to single-select.
3. `src/lib/modifier-groups-cart.ts` stores selected option IDs and toggles each
   option on or off. `mapSelectionToCartFormat` treats `max_select === 1` as a
   variation and everything else as add-ons. There is no quantity per selection.
4. `src/components/customer/modifier-groups-selector.tsx` renders toggle buttons,
   without per-option quantity controls.
5. `src/components/customer/item-detail-modal.tsx`, also used to edit cart lines,
   uses the legacy variation/add-on fields. It needs a quantity-preserving
   adapter and the same selection rules as the main product detail screen.
6. `src/lib/inventory/order-item-selection.ts` puts selected add-on IDs into
   `addonIds`. `src/app/actions/orders.ts` passes only variation `option_ids` into
   `modifierOptionIds`. A multi-select option with a `modifier_option` recipe
   therefore does not match that recipe on this checkout path.
7. `src/lib/inventory/graph-builder.ts` resolves recipes using sets of IDs.
   Repeating an ID cannot represent consumption of multiple portions.
8. QR checkout builds add-ons as name/price pairs. Stored-order depletion readers
   currently recover only the base item and quantity. Selection IDs and quantities
   must survive these boundaries to support accurate replay and order changes.
9. Simple option stock is read by availability checks, but the inspected order
   stock service writes ingredient ledger movements from recipes. Automatic
   decrement/restoration of `ModifierOption.stock_qty` was not found in the
   searched web source or SQL migrations; it must not be assumed to work.

These are source-level findings, not observations from a live merchant account.

## Recommended implementation

Keep the unified modifier storage and existing stable option IDs. Add an explicit
group purpose and quantity capability rather than using maximum selection count
as the only discriminator. Preserve unclassified existing multi-choice groups
until the merchant explicitly chooses quantity-based add-on behavior. Legacy
variation and add-on columns provide an unambiguous classification when present.

Update admin save validation, library save/attach, and compatibility projections
to preserve this metadata and all existing recipe links. Saving a group must not
regenerate option IDs or discard linked-item and cost-source metadata.

Represent selected add-ons with explicit quantities, defaulting missing quantities
to one for old carts and orders. Carry stable option/group identity through the
cart and order snapshots. Do not encode quantities by changing prices or repeating
names. Update these boundaries together:

- Selection state, minus/plus controls, validation, and default selections.
- Product page, quick view, legacy add-ons, and cart edit round-trip.
- Cart line identity and merging: different add-on quantities remain different
  configurations.
- Cart and checkout totals, loyalty pricing where used, order summaries, receipts,
  Messenger output, and QR order payloads.
- Order persistence and reads across platform Supabase, tenant Supabase, and
  Convex, retaining old payload compatibility.

Inventory resolves stable selected IDs against the tenant's catalog and recipes,
multiplies each selected add-on recipe by add-on quantity and parent quantity, and
includes unified add-ons in modifier recipe resolution. Base recipes are counted
once per parent unit. Linked menu-item add-ons need an explicit authoritative
recipe source so their stock is neither omitted nor counted twice.

Preserve the existing branch-scoped ledger and retry protection. Reversals restore
the recorded movements. Saved order edits and reopening an order must retain the
selection quantities needed to apply the correct difference or repeat the sale.

For simple option stock, implement atomic quantity-aware sale/restoration with
retry protection before promising that mode is integrated. Validate available
stock against aggregate demand, including repeated parent items and separate cart
lines. Recipe tracking continues through the existing ingredient ledger.

## Alternatives considered

- **Rename the editor only:** small change, but does not provide repeated extras
  or correct the inventory path.
- **Restore a separate legacy storage system:** recreates familiar controls, but
  adds a second source of truth and risks losing current recipe associations.
- **Explicit UI concepts over unified storage (recommended):** retains current
  inventory associations while adding the missing quantity contract end to end.

## Acceptance checks

1. A merchant can independently create a Size variation and an Extras add-on
   group, save them, reload, and reuse them from the library.
2. A customer can switch Small to Large, add Cheese three times and Rice twice,
   and remove either extra down to zero.
3. Two parent items multiply those extras correctly in both the bill and stock.
4. Cart editing and refresh retain the exact choices and quantities; different
   configurations do not merge incorrectly.
5. Existing required and bounded multi-choice groups keep their old behavior.
6. Both legacy add-on recipes and unified modifier-option recipes deplete the
   correct ingredients, including shared ingredients and linked item extras.
7. Stock changes retain branch scope, tolerate retries without duplicate
   deductions, and restore the correct amount on cancellation or order edits.
8. Checkout/QR/persisted order readers and pricing paths retain quantities.
9. Invalid quantities and unavailable selections are rejected; configured caps
   and actual stock limits are enforced beyond the browser controls.

## Baseline verification

Before implementation, the four existing modifier editor/selection suites passed:
68 tests across `modifier-groups-form`, `modifier-groups-cart`,
`modifier-groups-selector`, and `hooks/useModifierGroups`.
These tests cover current behavior; they do not prove repeated add-ons work.

No application code or database changes have been made for this investigation.
The workspace contains existing unrelated changes, including edits to the menu
form and recipe editors; implementation must preserve them.
