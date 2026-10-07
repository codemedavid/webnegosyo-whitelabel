/**
 * The reads `createOrder` (platform backend) guards its INSERT with, issued in
 * one parallel batch.
 *
 * They used to run one after another — store hours, the dishes, the order type
 * (IDOR), the payment method (IDOR), and then the order type a second time for
 * its display name, without a tenant filter. None needs another's answer, so
 * they now leave together, and the name comes from the tenant-scoped IDOR row.
 *
 * Only the reads happen here. `createOrder` still judges the answers in the
 * original order (hours, dishes, order type, payment method), so the error a
 * caller hears is unchanged.
 */

interface QueryResult<T> {
  data: T | null
  error: unknown
}

/** The slice of a Supabase client these reads use. */
export interface OrderWriteChecksClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any
}

export interface OrderWriteChecksInput {
  tenantId: string
  menuItemIds: string[]
  orderTypeId?: string
  paymentMethodId?: string
}

export interface OrderWriteChecks {
  hoursRow: unknown
  menuItems: QueryResult<Array<{ id: string; name?: string }>>
  /** Null when no order type was chosen. */
  orderType: QueryResult<{ id: string; name?: string | null }> | null
  /** Null when no payment method was chosen. */
  paymentMethod: QueryResult<{ id: string }> | null
}

async function readHours(client: OrderWriteChecksClient, tenantId: string): Promise<unknown> {
  const { data } = await client
    .from('tenants')
    .select('operating_hours, timezone, enforce_operating_hours, is_prelaunch')
    .eq('id', tenantId)
    .maybeSingle()
  return data
}

async function readMenuItems(
  client: OrderWriteChecksClient,
  tenantId: string,
  menuItemIds: string[],
): Promise<QueryResult<Array<{ id: string; name?: string }>>> {
  return client.from('menu_items').select('id, name').eq('tenant_id', tenantId).in('id', menuItemIds)
}

async function readTenantRow<T>(
  client: OrderWriteChecksClient,
  table: string,
  columns: string,
  id: string | undefined,
  tenantId: string,
): Promise<QueryResult<T> | null> {
  if (!id) return null
  return client.from(table).select(columns).eq('id', id).eq('tenant_id', tenantId).maybeSingle()
}

export async function loadOrderWriteChecks(
  client: OrderWriteChecksClient,
  input: OrderWriteChecksInput,
): Promise<OrderWriteChecks> {
  // Every read is its own async call, so a synchronous throw inside one
  // becomes a rejection Promise.all owns — never an orphaned, unhandled one.
  const [hoursRow, menuItems, orderType, paymentMethod] = await Promise.all([
    readHours(client, input.tenantId),
    readMenuItems(client, input.tenantId, input.menuItemIds),
    readTenantRow<{ id: string; name?: string | null }>(client, 'order_types', 'id, name', input.orderTypeId, input.tenantId),
    readTenantRow<{ id: string }>(client, 'payment_methods', 'id', input.paymentMethodId, input.tenantId),
  ])
  return {
    hoursRow,
    menuItems: { data: menuItems.data ?? null, error: menuItems.error ?? null },
    orderType: orderType ? { data: orderType.data ?? null, error: orderType.error ?? null } : null,
    paymentMethod: paymentMethod ? { data: paymentMethod.data ?? null, error: paymentMethod.error ?? null } : null,
  }
}
