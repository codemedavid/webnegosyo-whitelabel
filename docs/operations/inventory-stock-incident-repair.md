# Inventory stock incident repair

This runbook is scoped to Sentry issues `JAVASCRIPT-NEXTJS-2H` and
`JAVASCRIPT-NEXTJS-2M`. Keep event/order identifiers in an operator-owned JSON
file outside the repository.

## Preconditions

1. Apply `20260916120000_modifier_group_library_selection_mode.sql` and then
   `20260916121000_simple_option_stock.sql` to the platform database.
2. Confirm the non-mutating PostgREST contract check:

   ```sh
   npm run db:check-stock-contract
   ```

3. Build the manifest from the full Sentry event set. Every row must contain
   `issueId`, `eventId`, `occurredAt`, `tenantId`, `orderId`, `revision`, and
   `url`. The runner accepts only the two incident issue IDs, rejects duplicate
   events/conflicting revisions, and deduplicates identical orders.

## Dry run

```sh
npm run inventory:repair-incident -- \
  --manifest /absolute/path/to/inventory-stock-repair.json
```

The dry run reads each tenant and order from its authoritative platform or
Convex backend. It never accepts order lines from the manifest. It skips an
order when the order is missing, inventory is disabled, status/payment is
cancelled/voided/refunded, the revision changed, no canonical lines remain, or
saved selection names exist without the exact `_inventory_selections` snapshot.
Every 2M/POS row requires that snapshot: the failed request carried exact IDs,
but its canonical order persists only display labels, so an apparently plain
saved row does not prove that the original request had no selections.

Review every `SKIP` and `ERROR`. Do not execute until `failed=0`; investigate
`selection_snapshot_missing` manually because guessing an option ID could move
the wrong stock and would consume the revision's idempotency claim.

## Execute

Use the `uniqueOrders` count printed by the dry run as the acknowledgement:

```sh
npm run inventory:repair-incident -- \
  --manifest /absolute/path/to/inventory-stock-repair.json \
  --execute --confirm-count <uniqueOrders>
```

Execution uses `applyOrderStockMovements`, including its independent
simple-option and ingredient claims. Retry only immediately after a reported
operation failure, and only while the menu, option mappings, and recipes are
unchanged. A no-demand ingredient path releases its claim; replaying it after a
later recipe change could incorrectly deplete a historical order. This is not a
scheduled reconciliation command.

Validate the summary (`failed=0`), retain the per-order `APPLIED` output, and
confirm no new 2H/2M Sentry events were recorded after the migration deployment.

For the 2026-09-16 incident, the completed execution left 30 simple-option
application claims, zero simple-option movements, zero ingredient claims, and
zero ingredient movements. Four POS rows lacked exact selection snapshots and
their base-only attempts also left no claims or movements. Do not replay this
incident again: a future recipe/catalog change would change what the historical
orders mean.

## Deployment guard

`prebuild` runs the stock contract guard when `VERCEL_ENV=production`. It fails
closed when the platform URL/service key is unavailable or PostgREST does not
expose both ledger tables and `/rpc/apply_simple_option_order_stock` to the
service role. Non-production builds skip it; `npm run db:check-stock-contract`
runs it explicitly anywhere.
