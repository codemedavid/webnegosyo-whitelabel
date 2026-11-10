/**
 * An in-memory twin of `public.apply_order_stock_claim`
 * (supabase/migrations/20261103140000_order_stock_atomic_claim.sql) for Jest
 * fakes of the admin client. The REAL function is exercised by
 * tests/sql/run-order-stock-atomic-claim.cjs; this twin lets unit tests that
 * keep their own claims/ledger arrays answer the RPC the same way: duplicate,
 * cancel-wins and edit guards, the edit give-back cap, reverse_all netting and
 * the `restored` record. Everything commits together or not at all.
 */

export interface SimClaim {
  reason: 'sale' | 'void'
  revision: number
  kind?: 'order' | 'edit'
  restored?: unknown[] | null
}

export interface SimMovement {
  inventory_item_id: string
  outlet_id: string | null
  reason?: string
  quantity_delta: number
  entered_quantity: number | null
  entered_unit_id: string | null
  order_id?: string
  tenant_id?: string
}

export interface ClaimRpcState {
  claims: SimClaim[]
  /** Every movement this order recorded; the twin appends what it writes. */
  movements: SimMovement[]
  /** Called before a row is written; throw to simulate a failing trigger. */
  onInsert?: (row: SimMovement) => void
}

export interface ClaimRpcArgs {
  p_tenant_id: string
  p_order_id: string
  p_reason: 'sale' | 'void'
  p_kind: 'order' | 'edit'
  p_revision: number
  p_movements: SimMovement[]
  p_mode: 'rows' | 'reverse_all'
}

type Answer = { data: unknown; error: unknown }

/** The RPC name the service calls. */
export const ORDER_STOCK_CLAIM_RPC = 'apply_order_stock_claim'

const kindOf = (claim: SimClaim) => claim.kind ?? 'order'

function isCancelled(claims: readonly SimClaim[]): boolean {
  const own = claims.filter((c) => kindOf(c) === 'order')
  const latestSale = own.filter((c) => c.reason === 'sale').reduce((m, c) => Math.max(m, c.revision), 0)
  return own.some((c) => c.reason === 'void' && c.revision >= latestSale)
}

function reversal(movements: readonly SimMovement[]): SimMovement[] {
  const netted = new Map<string, { m: SimMovement; delta: number; entered: number }>()
  for (const m of movements) {
    const key = `${m.inventory_item_id}|${m.entered_unit_id ?? ''}|${m.outlet_id ?? ''}`
    const prev = netted.get(key)
    netted.set(key, {
      m,
      delta: (prev?.delta ?? 0) + Number(m.quantity_delta),
      entered: (prev?.entered ?? 0) + (Number(m.entered_quantity) || 0) * Math.sign(Number(m.quantity_delta)),
    })
  }
  return [...netted.values()].filter((e) => e.delta !== 0).map(({ m, delta, entered }) => ({
    inventory_item_id: m.inventory_item_id,
    outlet_id: m.outlet_id ?? null,
    reason: 'void',
    quantity_delta: -delta,
    entered_quantity: entered === 0 ? null : Math.abs(entered),
    entered_unit_id: m.entered_unit_id ?? null,
  }))
}

function heldByShelf(movements: readonly SimMovement[]): Map<string, number> {
  const held = new Map<string, number>()
  for (const m of movements) {
    const key = `${m.inventory_item_id}|${m.outlet_id ?? ''}`
    held.set(key, (held.get(key) ?? 0) - Number(m.quantity_delta))
  }
  return held
}

function capEditRows(rows: readonly SimMovement[], movements: readonly SimMovement[]): SimMovement[] {
  const held = heldByShelf(movements)
  return rows.flatMap((row) => {
    const key = `${row.inventory_item_id}|${row.outlet_id ?? ''}`
    const delta = Number(row.quantity_delta)
    if (delta < 0) {
      held.set(key, (held.get(key) ?? 0) - delta)
      return [row]
    }
    const remaining = Math.max(held.get(key) ?? 0, 0)
    const capped = Math.min(delta, remaining)
    if (capped <= 0) return []
    held.set(key, remaining - capped)
    const entered = row.entered_quantity == null ? null : (row.entered_quantity * capped) / delta
    return [{ ...row, quantity_delta: capped, entered_quantity: entered }]
  })
}

/** Answer one `apply_order_stock_claim` call against `state`. */
export function simulateOrderStockClaim(state: ClaimRpcState, args: ClaimRpcArgs): Answer {
  const { p_reason: reason, p_kind: kind, p_revision: revision, p_mode: mode } = args
  const answer = (status: string, rows: SimMovement[] = []): Answer => ({ data: { status, rows }, error: null })

  if (state.claims.some((c) => c.reason === reason && kindOf(c) === kind && c.revision === revision)) {
    return answer('duplicate')
  }
  if (kind === 'order' && reason === 'sale'
      && state.claims.some((c) => kindOf(c) === 'order' && c.reason === 'void' && c.revision >= revision)) {
    return answer('cancelled_first')
  }
  if (kind === 'edit' && isCancelled(state.claims)) return answer('cancelled_first')

  const source = mode === 'reverse_all' ? reversal(state.movements) : [...(args.p_movements ?? [])]
  const rows = kind === 'edit' ? capEditRows(source, state.movements) : source
  try {
    for (const row of rows) state.onInsert?.(row)
  } catch (error) {
    return { data: null, error }
  }
  const written = rows.map((row) => ({ ...row, order_id: args.p_order_id, tenant_id: args.p_tenant_id }))
  state.movements.push(...written)
  state.claims.push({
    reason, kind, revision,
    ...(mode === 'reverse_all' && written.length > 0 ? { restored: written } : {}),
  })
  return answer('applied', written)
}

/** A test world that keeps its own claims and ledger arrays. */
export interface ClaimRpcWorld {
  claims: SimClaim[]
  /** The order's movements as the database would see them right now. */
  movements: () => SimMovement[]
  /** Receives the rows the twin wrote (append them to the world's ledger). */
  onWritten?: (rows: SimMovement[]) => void
  onInsert?: (row: SimMovement) => void
}

/** `simulateOrderStockClaim` bound to a world whose movements are read live. */
export function bindOrderStockClaimRpc(world: ClaimRpcWorld): (args: ClaimRpcArgs) => Answer {
  return (args) => {
    const state: ClaimRpcState = { claims: world.claims, movements: [...world.movements()], onInsert: world.onInsert }
    const answer = simulateOrderStockClaim(state, args)
    if (!answer.error) world.onWritten?.((answer.data as { rows: SimMovement[] }).rows)
    return answer
  }
}

/**
 * An admin-client `rpc` for fakes: the claim goes to `claim`, everything else
 * (the simple-option counters) answers `other`.
 */
export function routeStockRpc(
  claim: (args: ClaimRpcArgs) => Answer,
  other: Answer = { data: 0, error: null },
): (name: string, args: unknown) => Promise<Answer> {
  return async (name, args) => (name === ORDER_STOCK_CLAIM_RPC ? claim(args as ClaimRpcArgs) : other)
}


type StoreRow = Record<string, unknown>

/** A fake database's two tables, holding rows for every order and tenant. */
export interface ClaimRowStore {
  /** `order_stock_applications` rows (tenant_id, order_id, reason, kind, revision, restored). */
  claims: StoreRow[]
  /** `stock_movements` rows (tenant_id, order_id, …). */
  movements: StoreRow[]
}

/**
 * An admin-client `rpc` over a stateful fake that keeps whole tables: the
 * claim RPC sees only the calling order's claims and movements, and its writes
 * land back in the tables stamped with tenant and order. Every other RPC (the
 * simple-option counters) answers `other()`, read at call time.
 */
export function rowStoreStockRpc(
  store: ClaimRowStore,
  other: () => Answer = () => ({ data: 0, error: null }),
): (name: string, args: unknown) => Promise<Answer> {
  return async (name, args) => {
    if (name !== ORDER_STOCK_CLAIM_RPC) return other()
    const call = args as ClaimRpcArgs
    const own = (row: StoreRow) => row.tenant_id === call.p_tenant_id && row.order_id === call.p_order_id
    const claims = store.claims.filter(own) as unknown as SimClaim[]
    const before = claims.length
    const state: ClaimRpcState = { claims, movements: store.movements.filter(own) as unknown as SimMovement[] }
    const answer = simulateOrderStockClaim(state, call)
    if (answer.error) return answer
    const stamp = { tenant_id: call.p_tenant_id, order_id: call.p_order_id }
    store.claims.push(...state.claims.slice(before).map((claim) => ({ ...stamp, ...claim })))
    store.movements.push(...(answer.data as { rows: SimMovement[] }).rows.map((row) => ({ ...row })))
    return answer
  }
}
