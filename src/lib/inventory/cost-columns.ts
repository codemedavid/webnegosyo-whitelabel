/**
 * Explicit column lists for the tables whose cost column is not selectable by
 * client roles (migration 20261107130100). A `select('*')` — or a `.select()`
 * after an insert/update, which asks for every column back — is refused once
 * that migration lands, so session-client reads name these instead and get the
 * price, if the caller may have it, from `item-costs.ts`.
 *
 * Keep each list equal to the table's columns minus `unit_cost`. A column added
 * later must be added here AND granted to the client roles in its migration
 * (tests/unit/inventory-cost-column-guard.test.ts enforces the second half).
 */

export const INVENTORY_ITEM_COLUMNS =
  'id, tenant_id, name, sku, category, stock_unit_id, is_prep, image_url, current_qty, reorder_level, is_active, created_at, updated_at, counted_at'

export const STOCK_MOVEMENT_COLUMNS =
  'id, tenant_id, inventory_item_id, reason, quantity_delta, entered_quantity, entered_unit_id, balance_after, note, order_id, created_by, created_at, outlet_id, target_qty, stock_transfer_id, inventory_count_id, client_request_id, opens_tracking'

export const STOCK_TRANSFER_LINE_COLUMNS =
  'id, tenant_id, transfer_id, inventory_item_id, sent_quantity, received_quantity, created_at'
