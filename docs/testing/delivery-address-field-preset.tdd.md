# TDD evidence — restoring the Delivery Address field in the order-type editor

**Source plan:** none. Journeys derived from the reported defect: *"on the ordertype
the delivery address field is not able to add. we accidentally removed it and now it
only shows us the textarea field and other and not the real delivery thing we have."*

## User journeys

1. As a merchant, I want to add a Delivery Address field to an order type, so that
   customers get the real address autocomplete instead of a plain text box.
2. As a merchant, I don't want to know internal identifiers, so that I can rebuild a
   deleted field without guessing.
3. As a merchant, I want the order type's field list to name what a field *does*, so
   that I can tell the address field from an ordinary textarea.

## Root cause

The checkout renders `MapboxAddressAutocomplete` — and runs the delivery-fee and
delivery-radius logic — only when a form field's `field_name` is exactly
`delivery_address` (`src/components/customer/checkout-templates/checkout-primitives.tsx`).
The seeded row (`supabase/migrations/0011_auto_create_order_types.sql`) stores it as
`field_type: 'textarea'`; only the *name* makes it special.

The admin Add Field dialog (`src/components/admin/order-type-detail.tsx`) offered a
Field Type picker with the six raw DB types and nothing else. The convention was
never surfaced, so once the seeded field was deleted the address widget was
unrecoverable through the UI — a re-added field rendered as a plain textarea.

The `customer_form_fields` CHECK constraint (`supabase/migrations/0009_order_types.sql:32`)
allows only `text|email|phone|textarea|select|number`, so the fix stays on the
`field_name` convention rather than adding a DB field type. No migration needed.

## Task report

| Task | Summary | Validation | Result |
|---|---|---|---|
| Reproduce | Two failing suites: presets module absent, `FieldDialog` unexported, no Delivery Address option | `npx jest tests/unit/checkout-field-presets.test.ts tests/unit/order-type-field-dialog.test.tsx` | RED — 2 suites failed, 4 tests failed |
| Implement | New `src/lib/checkout-field-presets.ts`; Field Type picker built from presets; reserved name auto-filled and locked; badge shows behavior | same command | GREEN — 2 suites, 11 tests passed |
| Refactor | Six copies of the magic string routed through `isDeliveryAddressField` | `npx jest tests/unit` | GREEN — 544 suites, 6436 tests passed |

RED excerpt:

```
Cannot find module '@/lib/checkout-field-presets' from 'tests/unit/checkout-field-presets.test.ts'
Element type is invalid: ... You likely forgot to export your component (FieldDialog)
Test Suites: 2 failed, 2 total   Tests: 4 failed, 4 total
```

GREEN excerpt:

```
PASS tests/unit/checkout-field-presets.test.ts
PASS tests/unit/order-type-field-dialog.test.tsx
Test Suites: 544 passed, 544 total   Tests: 6436 passed, 6436 total
```

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | The picker offers Delivery Address alongside the six raw input types | `checkout-field-presets.test.ts:offers a delivery address choice…` | unit | PASS |
| 2 | The address choice is labelled for merchants, not developers | `checkout-field-presets.test.ts:labels the delivery address preset…` | unit | PASS |
| 3 | The preset produces a field the checkout renders as the address widget | `checkout-field-presets.test.ts:builds a field the checkout recognises…` | unit | PASS |
| 4 | The stored `field_type` stays inside the DB CHECK constraint | `checkout-field-presets.test.ts:stores the address preset under a field_type…` | unit | PASS |
| 5 | Non-reserved presets leave the internal name to the merchant | `checkout-field-presets.test.ts:keeps the internal name free…` | unit | PASS |
| 6 | An existing seeded `textarea` address field resolves back to the address preset | `checkout-field-presets.test.ts:resolves an existing seeded address field…` | unit | PASS |
| 7 | The field list badges an address field as Delivery Address, not Textarea | `checkout-field-presets.test.ts:badges an address field…` | unit | PASS |
| 8 | The real Add Field dialog shows a Delivery Address option | `order-type-field-dialog.test.tsx:offers Delivery Address as a field type` | component | PASS |
| 9 | Picking it saves `field_name: 'delivery_address'` with a `textarea` type | `order-type-field-dialog.test.tsx:creates the field under the internal name…` | component | PASS |
| 10 | The reserved internal name is filled in and locked | `order-type-field-dialog.test.tsx:does not make the merchant type the internal name` | component | PASS |
| 11 | A second address field cannot be added to the same order type | `order-type-field-dialog.test.tsx:refuses a second delivery address field…` | component | PASS |

## Coverage

`npx jest --coverage --collectCoverageFrom='src/lib/checkout-field-presets.ts' …`

```
 checkout-field-presets.ts |   98.4 |    88.23 |     100 |    98.4 | 89-90
```

Lines 89–90 are the `buildFieldFromPreset` unknown-preset throw, unreachable from the
UI (ids come from the same list). `npx tsc --noEmit` and `npx eslint` clean on all
touched files.

## Known gaps

- No E2E: not exercised against a live tenant. The fix is inert for order types whose
  address field still exists — it only restores the ability to re-add a deleted one.
- Existing rows are untouched. A merchant who already re-created the field under a
  wrong name (e.g. `address`) must delete it and add it again via the new choice.

## Merge evidence

RED → `c3259c67`, GREEN → `032a7ffb`, refactor → `f7482dc4` on `presell-stock`.
