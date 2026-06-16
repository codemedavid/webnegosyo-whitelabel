import { app } from 'electron'
import {
  openSync,
  writeSync,
  fsyncSync,
  closeSync,
  renameSync,
  readFileSync,
  mkdirSync,
} from 'fs'
import { join, dirname } from 'path'
import type {
  LocalPosOrder,
  PosOrderPayload,
  PosCatalogCache,
  PosTenantCache,
} from '../shared/types'

interface OrdersFile {
  version: 1
  orders: LocalPosOrder[]
}

interface CacheFile {
  version: 1
  catalog: PosCatalogCache | null
  tenant: PosTenantCache | null
}

// Drop synced orders after this window so the ledger never grows unbounded;
// non-synced orders are kept forever until they reach Convex.
const SYNCED_RETENTION_MS = 14 * 24 * 60 * 60 * 1000

let ordersCache: OrdersFile | null = null
let cacheCache: CacheFile | null = null

function ordersPath(): string {
  return join(app.getPath('userData'), 'pos-orders.json')
}

function cachePath(): string {
  return join(app.getPath('userData'), 'pos-cache.json')
}

// Durable, crash-safe write: fsync the temp file before the atomic rename so a
// power loss can never leave a half-written ledger (the no-data-loss guarantee).
// Throws on any failure so callers can keep their in-memory state untouched.
function atomicWrite(path: string, dataObj: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = path + '.tmp'
  const json = JSON.stringify(dataObj, null, 2)
  const fd = openSync(tmp, 'w')
  try {
    writeSync(fd, json)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  renameSync(tmp, path) // atomic on same filesystem
  // fsync the parent directory so the rename itself survives a power loss (the
  // directory entry, not just the file contents). Best-effort: directory fds
  // can't be fsync'd on Windows, so swallow errors there.
  try {
    const dirFd = openSync(dirname(path), 'r')
    try {
      fsyncSync(dirFd)
    } finally {
      closeSync(dirFd)
    }
  } catch {
    // Not supported on all platforms (e.g. Windows) — the rename above is the
    // primary guarantee; the directory fsync is a hardening bonus.
  }
}

function loadOrders(): OrdersFile {
  if (ordersCache) return ordersCache
  try {
    const raw = JSON.parse(readFileSync(ordersPath(), 'utf-8')) as Partial<OrdersFile>
    ordersCache = {
      version: 1,
      orders: Array.isArray(raw.orders) ? raw.orders : [],
    }
  } catch {
    // A corrupt ledger must never brick the register — fall back to empty.
    ordersCache = { version: 1, orders: [] }
  }
  return ordersCache
}

function loadCache(): CacheFile {
  if (cacheCache) return cacheCache
  try {
    const raw = JSON.parse(readFileSync(cachePath(), 'utf-8')) as Partial<CacheFile>
    cacheCache = {
      version: 1,
      catalog: raw.catalog ?? null,
      tenant: raw.tenant ?? null,
    }
  } catch {
    cacheCache = { version: 1, catalog: null, tenant: null }
  }
  return cacheCache
}

// Write-then-commit: persist the next state to disk FIRST and only swap the
// in-memory cache once the durable write succeeds. If atomicWrite throws, the
// cache stays exactly as it was — so a failed save never leaves a "phantom"
// order in memory that a retry (with a fresh clientOrderId) could later
// duplicate. This ordering is the no-duplicate guarantee.
function commitOrders(next: OrdersFile): void {
  atomicWrite(ordersPath(), next)
  ordersCache = next
}

function commitCache(next: CacheFile): void {
  atomicWrite(cachePath(), next)
  cacheCache = next
}

export function savePosOrder(
  payload: PosOrderPayload,
  paymentStatus: 'paid' | 'pending'
): LocalPosOrder {
  const state = loadOrders()
  // Idempotent on clientOrderId — a retried save must never create a duplicate.
  const existing = state.orders.find((o) => o.clientOrderId === payload.clientOrderId)
  if (existing) return existing
  const order: LocalPosOrder = {
    clientOrderId: payload.clientOrderId,
    payload,
    paymentStatus,
    createdAt: Date.now(),
    syncStatus: 'pending',
    attempts: 0,
  }
  commitOrders({ version: 1, orders: [...state.orders, order] })
  return order
}

export function getPendingPosOrders(): LocalPosOrder[] {
  return loadOrders()
    .orders.filter((o) => o.syncStatus !== 'synced')
    .sort((a, b) => a.createdAt - b.createdAt)
}

export function getPosPendingCount(): number {
  return loadOrders().orders.filter((o) => o.syncStatus !== 'synced').length
}

export function markPosOrderSynced(clientOrderId: string, convexOrderId: string): void {
  const state = loadOrders()
  if (!state.orders.some((o) => o.clientOrderId === clientOrderId)) return
  const now = Date.now()
  const updated = state.orders.map((o) =>
    o.clientOrderId === clientOrderId
      ? { ...o, syncStatus: 'synced' as const, syncedAt: now, convexOrderId }
      : o
  )
  // Prune only confirmed-synced orders past the retention window; pending sales stay.
  const pruned = updated.filter(
    (o) => o.syncStatus !== 'synced' || now - (o.syncedAt ?? now) <= SYNCED_RETENTION_MS
  )
  commitOrders({ version: 1, orders: pruned })
}

export function markPosOrderFailed(clientOrderId: string, error: string): void {
  const state = loadOrders()
  if (!state.orders.some((o) => o.clientOrderId === clientOrderId)) return
  // Stays 'pending' so the sync worker always retries it.
  const updated = state.orders.map((o) =>
    o.clientOrderId === clientOrderId
      ? { ...o, attempts: (o.attempts || 0) + 1, lastError: error }
      : o
  )
  commitOrders({ version: 1, orders: updated })
}

export function getPosCatalog(tenantId: string): PosCatalogCache | null {
  const { catalog } = loadCache()
  if (catalog && catalog.tenantId === tenantId) return catalog
  return null
}

export function setPosCatalog(cache: PosCatalogCache): void {
  const state = loadCache()
  commitCache({ version: 1, catalog: cache, tenant: state.tenant })
}

export function getPosTenant(): PosTenantCache | null {
  return loadCache().tenant
}

export function setPosTenant(cache: PosTenantCache): void {
  const state = loadCache()
  commitCache({ version: 1, catalog: state.catalog, tenant: cache })
}
