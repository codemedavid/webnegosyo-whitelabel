/**
 * The browser side of the order-deletion routes. Same-origin fetches, so the
 * session cookie authenticates them and the routes' origin check passes.
 */
import { DELETION_ID_HEADER } from '@/lib/order-deletion/constants'
import type { DeletionRecord, DeletionRequest, ExecuteResult, RestoreResult } from '@/lib/order-deletion/types'
import type { DeletionPreview } from '@/lib/order-deletion/service'

export interface ListedOrder {
  id: string
  created_at: string
  daily_number: number | null
  status: string
  customer_name: string | null
  total: number
}

export interface DownloadedExport {
  deletionId: string
  csv: string
  fileName: string
  orderCount: number
  orderTotal: number
  expiresAt: string
}

/**
 * `Response.text()` decodes UTF-8 and drops a leading byte-order mark, and
 * without it Excel reads the file as ANSI and mangles peso signs and accents.
 */
function withByteOrderMark(text: string): string {
  return text.startsWith('\uFEFF') ? text : `\uFEFF${text}`
}

async function readError(response: Response): Promise<Error> {
  try {
    const body = (await response.json()) as { error?: string }
    return new Error(body.error ?? `Request failed (${response.status}).`)
  } catch {
    return new Error(`Request failed (${response.status}).`)
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw await readError(response)
  return (await response.json()) as T
}

export function fetchPreview(tenantId: string, request: DeletionRequest, listOrders = false) {
  return postJson<{ preview: DeletionPreview; orders?: ListedOrder[]; truncated?: boolean }>(
    '/api/order-deletion/preview',
    { tenantId, ...request, listOrders }
  )
}

export async function fetchExport(tenantId: string, request: DeletionRequest): Promise<DownloadedExport> {
  const response = await fetch('/api/order-deletion/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId, ...request }),
  })
  if (!response.ok) throw await readError(response)

  const deletionId = response.headers.get(DELETION_ID_HEADER)
  if (!deletionId) throw new Error('The export did not include a deletion ticket. Try again.')
  return {
    deletionId,
    csv: withByteOrderMark(await response.text()),
    fileName: response.headers.get('X-Export-File-Name') ?? 'orders-backup.csv',
    orderCount: Number(response.headers.get('X-Order-Count') ?? 0),
    orderTotal: Number(response.headers.get('X-Order-Total') ?? 0),
    expiresAt: response.headers.get('X-Export-Expires-At') ?? '',
  }
}

export async function confirmDeletionRequest(
  tenantId: string,
  input: { deletionId: string; password: string; confirmation: string }
): Promise<ExecuteResult> {
  const { result } = await postJson<{ result: ExecuteResult }>('/api/order-deletion/confirm', { tenantId, ...input })
  return result
}

export async function restoreDeletionRequest(tenantId: string, deletionId: string): Promise<RestoreResult> {
  const { result } = await postJson<{ result: RestoreResult }>('/api/order-deletion/restore', { tenantId, deletionId })
  return result
}

export async function fetchHistory(tenantId: string): Promise<DeletionRecord[]> {
  const response = await fetch(`/api/order-deletion?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' })
  if (!response.ok) throw await readError(response)
  return ((await response.json()) as { deletions: DeletionRecord[] }).deletions
}
