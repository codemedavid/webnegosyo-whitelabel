import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, type RateLimitOptions } from '@/lib/distributed-rate-limit'
import { withRequestBearer } from '@/lib/supabase/bearer-session'
import { MAX_RECEIPT_BYTES, MAX_RECEIPT_UPLOAD_REQUEST_BYTES, RECEIPT_TOO_LARGE_MESSAGE } from '@/lib/expenses/receipts/rules'
import {
  NO_STORE_HEADERS,
  holdsExpenses,
  isStoreMember,
  jsonError,
  resolveExpenseRouteCaller,
} from '@/lib/expenses/route-caller'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

/** Shared across instances; a Redis outage falls back to the per-instance limit. */
const BURST: RateLimitOptions = { limit: 30, windowSec: 60, onRedisFailure: 'instance' }
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface ExpenseForReceipt {
  id: string
  tenant_id: string
  paid_from: string
  created_by: string | null
  status: string
}

/**
 * POST /api/expenses/receipts — multipart `expenseId` + `file` → `{ id }`.
 *
 * The web admin (cookie) or the merchant app (Bearer). The expense is read
 * with the CALLER's session, so RLS decides whether they may see it at all;
 * then they must be a member of its store holding `expenses`, or the cashier
 * who paid it from their own drawer. Only then does the service role write the
 * private object and its row. The file's type comes from its first bytes.
 *
 * 400 malformed · 401 not signed in · 403 not theirs · 404 not visible ·
 * 409 voided / too many · 413 over the body cap (4.5 MB, Vercel's) · 415 not a
 * photo or PDF · 429 slow down.
 */
export function POST(request: NextRequest): Promise<NextResponse> {
  return withRequestBearer(request, () => handleUpload(request))
}

/**
 * The body, read with a hard byte cap: never buffered whole when it is too
 * big, whatever Content-Length says. A missing length is allowed (React
 * Native on Android streams a file upload chunked, with no length), but it
 * cannot be used to send more than the cap. 'too_large' once over it.
 */
async function readCappedBody(request: NextRequest, cap: number): Promise<Uint8Array | 'too_large' | null> {
  const reader = request.body?.getReader()
  if (!reader) return null
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > cap) {
      await reader.cancel().catch(() => undefined)
      return 'too_large'
    }
    chunks.push(value)
  }
  const body = new Uint8Array(total)
  chunks.reduce((offset, chunk) => (body.set(chunk, offset), offset + chunk.byteLength), 0)
  return body
}

async function readForm(request: NextRequest): Promise<FormData | 'too_large' | null> {
  const declared = request.headers.get('content-length')
  if (declared !== null) {
    const length = Number(declared)
    if (!Number.isFinite(length) || length < 0) return null
    if (length > MAX_RECEIPT_UPLOAD_REQUEST_BYTES) return 'too_large'
  }
  const body = await readCappedBody(request, MAX_RECEIPT_UPLOAD_REQUEST_BYTES).catch(() => null)
  if (body === null || body === 'too_large') return body
  const contentType = request.headers.get('content-type') ?? ''
  return new Request(request.url, { method: 'POST', body: new Blob([body as BlobPart]), headers: { 'content-type': contentType } })
    .formData()
    .catch(() => null)
}

async function readUpload(request: NextRequest): Promise<{ expenseId: string; file: Blob } | NextResponse> {
  const form = await readForm(request)
  if (form === 'too_large') return jsonError(RECEIPT_TOO_LARGE_MESSAGE, 413)
  if (!form) return jsonError('Send the receipt as a file upload.', 400)
  const expenseId = form.get('expenseId')
  const file = form.get('file')
  if (typeof expenseId !== 'string' || !UUID_RE.test(expenseId)) return jsonError('That expense could not be found.', 400)
  if (!(file instanceof Blob)) return jsonError('Choose a photo or PDF of the receipt.', 400)
  if (file.size > MAX_RECEIPT_BYTES) return jsonError(RECEIPT_TOO_LARGE_MESSAGE, 413)
  return { expenseId, file }
}

async function handleUpload(request: NextRequest): Promise<NextResponse> {
  const caller = await resolveExpenseRouteCaller()
  if (!caller) return jsonError('Unauthorized', 401)

  if (!(await checkRateLimit(`expense-receipt:${caller.user.id}`, BURST)).allowed) {
    return jsonError('Too many uploads at once. Try again in a minute.', 429)
  }

  const upload = await readUpload(request)
  if (upload instanceof NextResponse) return upload

  const { data, error } = await caller.db
    .from('expenses')
    .select('id, tenant_id, paid_from, created_by, status')
    .eq('id', upload.expenseId)
    .maybeSingle()
  if (error) {
    console.error('[expenses/receipts] expense read failed', { code: error.code ?? null })
    return jsonError('Could not store the receipt. Try again.', 500)
  }
  const expense = data as ExpenseForReceipt | null
  if (!expense) return jsonError("That expense isn't available.", 404)
  if (!isStoreMember(caller, expense.tenant_id, 'create')) return jsonError('Forbidden', 403)

  const { createAdminClient, ADMIN_QUERY_TIMEOUT_MS } = await import('@/lib/supabase/admin')
  const { createSupabaseReceiptStore } = await import('@/lib/expenses/receipts/supabase-receipt-store')
  const { uploadReceipt } = await import('@/lib/expenses/receipts/upload-service')

  try {
    const bytes = new Uint8Array(await upload.file.arrayBuffer())
    const store = createSupabaseReceiptStore(createAdminClient({ timeoutMs: ADMIN_QUERY_TIMEOUT_MS }))
    const outcome = await uploadReceipt(
      store,
      {
        id: expense.id,
        tenantId: expense.tenant_id,
        paidFrom: expense.paid_from,
        createdBy: expense.created_by,
        status: expense.status,
      },
      { userId: caller.user.id, holdsExpenses: holdsExpenses(caller) },
      bytes,
      randomUUID,
    )
    if (!outcome.ok) {
      return NextResponse.json({ error: outcome.error, code: outcome.code }, { status: outcome.status, headers: NO_STORE_HEADERS })
    }
    return NextResponse.json({ id: outcome.id }, { status: 201, headers: NO_STORE_HEADERS })
  } catch (failure) {
    console.error('[expenses/receipts] upload failed', {
      tenantId: expense.tenant_id,
      expenseId: expense.id,
      error: failure instanceof Error ? failure.message : String(failure),
    })
    return jsonError('Could not store the receipt. Try again.', 500)
  }
}
