/**
 * Shapes shared by the order-deletion service, its repository and its routes.
 */

export type DeletionScope =
  | { kind: 'range'; from: string; to: string }
  | { kind: 'all' }
  | { kind: 'selected'; orderIds: string[] }

export interface DeletionRequest {
  scope: DeletionScope
  /** Also take orders that are still pending/being prepared. Off by default. */
  includeActive: boolean
}

/** A verified store owner: who they are and the one store they may act on. */
export interface DeletionCaller {
  userId: string
  email: string
  tenantId: string
}

export interface DeletionStore {
  id: string
  name: string
  slug: string
}

/** The order columns the export and preview read. */
export interface ExportOrder {
  id: string
  created_at: string
  updated_at: string
  daily_number: number | null
  status: string
  payment_status: string | null
  payment_method_name: string | null
  order_type: string | null
  outlet_id: string | null
  customer_name: string | null
  customer_contact: string | null
  delivery_fee: number | null
  service_charge_amount: number | null
  discount_total: number | null
  total: number
  amount_paid: number | null
  source: string | null
}

export interface ExportItem {
  order_id: string
  menu_item_name: string
  variation: string | null
  addons: string[] | null
  quantity: number
  price: number
  subtotal: number
  special_instructions: string | null
}

export type DeletionStatus = 'exported' | 'deleted' | 'restored' | 'purged' | 'expired'

export interface DeletionRecord {
  id: string
  tenant_id: string
  requested_by: string
  status: DeletionStatus
  scope: DeletionScope
  order_count: number
  order_total: number
  exported_at: string
  export_expires_at: string
  deleted_at: string | null
  deleted_order_count: number | null
  purge_after: string | null
  restored_at: string | null
}

export interface NewDeletionRow {
  tenant_id: string
  requested_by: string
  scope: DeletionScope
  include_active: boolean
  order_ids: string[]
  order_count: number
  order_total: number
  export_sha256: string
  exported_at: string
  export_expires_at: string
}

export type AuditAction = 'exported' | 'password_failed' | 'confirmation_failed'

export interface AuditEntry {
  tenant_id: string
  actor_id: string
  action: AuditAction
  deletion_id?: string | null
  detail?: Record<string, unknown>
}

export interface ExecuteResult {
  deleted: number
  /** Exported orders left alone: changed since the export, or tied to a loyalty settlement. */
  skipped: number
  total: number
  purgeAfter: string
}

export interface RestoreResult {
  restored: number
}

/** Result of a password re-check. A failed network call throws instead. */
export type PasswordCheck = 'ok' | 'wrong'

export type PasswordVerifier = (
  email: string,
  password: string,
  expectedUserId: string
) => Promise<PasswordCheck>

/** Every database read and write the flow makes, so the service is testable without one. */
export interface OrderDeletionRepo {
  findOrdersForScope(tenantId: string, scope: DeletionScope, includeActive: boolean): Promise<ExportOrder[]>
  findItems(orderIds: readonly string[]): Promise<ExportItem[]>
  findOutletNames(tenantId: string): Promise<Map<string, string>>
  insertDeletion(row: NewDeletionRow): Promise<{ id: string }>
  /** Scoped to the store: another store's deletion reads as absent. */
  findDeletion(deletionId: string, tenantId: string): Promise<DeletionRecord | null>
  listDeletions(tenantId: string, limit: number): Promise<DeletionRecord[]>
  recordAudit(entry: AuditEntry): Promise<void>
  countRecentPasswordFailures(actorId: string, sinceIso: string): Promise<number>
  /** The database re-checks ownership, expiry and store scope itself. */
  executeDeletion(deletionId: string, actorId: string): Promise<ExecuteResult>
  restoreDeletion(deletionId: string, actorId: string): Promise<RestoreResult>
}
