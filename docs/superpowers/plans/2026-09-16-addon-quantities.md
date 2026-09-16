# Add-on quantities implementation plan

**Goal:** Restore separate variations and add-ons with per-item extra quantities and correct inventory consumption.
**Architecture:** Keep modifier groups and stable recipe IDs; classify quantity-based extras explicitly using `selection_mode: 'quantity'`. Missing mode preserves existing choice-only rules. Selected `Addon` snapshots gain optional `quantity` (missing means one).
**Tech stack:** Existing Next.js/React/TypeScript, Jest, Supabase and Convex order adapters.

- [x] Add a failing cart behavior test: base 100 + cheese 10 × 3, parent quantity 2 gives 260; different quantities produce different cart identities.
- [x] Implement shared add-on quantity helpers, cart pricing/identity, selection projection and reverse mapping; preserve old snapshots at quantity one.
- [x] Add a failing admin test for independent Variation/Add-on creation. Implement clear controls and persisted `selection_mode` including library round trips. Keep existing min/max choice behavior.
- [x] Add a failing selector test for plus/minus and adapter tests for repeated extras. Implement quantity controls in product detail and cart editor with validation and total updates.
- [x] Add a failing inventory test for 2 × 3 portions; route unified extras to their recipes and carry quantity maps to depletion. Preserve cancellation/retry/ingredient branch semantics.
- [x] Update checkout, order persistence, QR and displayed summaries to carry explicit quantities, preserving old order compatibility. Web checkout does not submit the separate POS loyalty quote shape; that flow is unchanged.
- [x] Run focused Jest suites, TypeScript and changed-file lint; review the diff and document deployment prerequisites and existing test typing failures.

Tests are run with `npm test -- --runInBand <affected test paths>` before and after each behavioral slice. Existing baseline: 88 tests passed across modifier selection/editor and inventory selection/depletion suites.

Implementation work stays in this working tree because it includes active user changes required by the current product. Existing edits must be preserved; do not stage or commit unrelated files.

Implementation detail: selection snapshots use the existing `customer_data` / `customerData` JSON field so old order-backend schemas continue accepting orders. Readers verify snapshot parent IDs and quantities against saved lines. No Convex schema bump is required.

See `docs/testing/addon-quantities.tdd.md` for verification and rollout boundaries.
