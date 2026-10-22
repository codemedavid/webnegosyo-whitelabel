/**
 * Storing one receipt photo or PDF for an expense.
 *
 * The ROUTE has already proven who the caller is, and read the expense with
 * the caller's OWN session — so RLS decided that this person may see it (an
 * `expenses` holder who reaches its branch, or the cashier who paid it from
 * their drawer). Here the remaining rules apply: a member of that store who
 * holds `expenses` or created this drawer expense, a recorded (not voided)
 * expense, a real JPEG/PNG/WebP/PDF within 5 MB, and a bounded count.
 *
 * Storage is injected so the rules are testable without Supabase.
 */

import { MAX_RECEIPT_BYTES, MAX_RECEIPTS_PER_EXPENSE, receiptObjectPath, sniffReceiptType } from './rules'

/** The expense as the caller's session read it. */
export interface ReceiptExpense {
  id: string
  tenantId: string
  paidFrom: string
  createdBy: string | null
  status: string
}

export interface ReceiptUploader {
  userId: string
  /** Holds `expenses` on the expense's store. */
  holdsExpenses: boolean
}

export interface ReceiptRowWrite {
  id: string
  tenant_id: string
  expense_id: string
  object_path: string
  mime: string
  bytes: number
  uploaded_by: string
}

export interface ReceiptStore {
  countReceipts(expenseId: string): Promise<number>
  putObject(path: string, bytes: Uint8Array, contentType: string): Promise<void>
  insertReceipt(row: ReceiptRowWrite): Promise<void>
  removeObject(path: string): Promise<void>
}

export type ReceiptRefusalCode = 'not_allowed' | 'voided' | 'too_large' | 'empty' | 'unsupported_type' | 'too_many'

type RefusalStatus = 400 | 403 | 409 | 413 | 415

export type ReceiptUploadOutcome =
  | { ok: true; id: string }
  | { ok: false; status: RefusalStatus; code: ReceiptRefusalCode; error: string }

function refuse(status: RefusalStatus, code: ReceiptRefusalCode, error: string): ReceiptUploadOutcome {
  return { ok: false, status, code, error }
}

/** `expenses`, or the cashier's own drawer expense. */
export function mayAttachReceipt(expense: ReceiptExpense, uploader: ReceiptUploader): boolean {
  if (uploader.holdsExpenses) return true
  return expense.paidFrom === 'drawer' && expense.createdBy !== null && expense.createdBy === uploader.userId
}

export async function uploadReceipt(
  store: ReceiptStore,
  expense: ReceiptExpense,
  uploader: ReceiptUploader,
  bytes: Uint8Array,
  newReceiptId: () => string,
): Promise<ReceiptUploadOutcome> {
  if (!mayAttachReceipt(expense, uploader)) {
    return refuse(403, 'not_allowed', "You can't add a receipt to this expense.")
  }
  if (expense.status !== 'recorded') return refuse(409, 'voided', 'This expense was voided. Add the receipt to its replacement.')
  if (bytes.length === 0) return refuse(400, 'empty', 'The file is empty.')
  if (bytes.length > MAX_RECEIPT_BYTES) return refuse(413, 'too_large', 'The file is larger than 5 MB.')

  const sniffed = sniffReceiptType(bytes)
  if (!sniffed) return refuse(415, 'unsupported_type', 'Add a photo (JPEG, PNG or WebP) or a PDF.')

  if ((await store.countReceipts(expense.id)) >= MAX_RECEIPTS_PER_EXPENSE) {
    return refuse(409, 'too_many', `An expense can keep up to ${MAX_RECEIPTS_PER_EXPENSE} receipts.`)
  }

  const id = newReceiptId()
  const path = receiptObjectPath(expense.tenantId, expense.id, id, sniffed.extension)
  await store.putObject(path, bytes, sniffed.mime)
  try {
    await store.insertReceipt({
      id,
      tenant_id: expense.tenantId,
      expense_id: expense.id,
      object_path: path,
      mime: sniffed.mime,
      bytes: bytes.length,
      uploaded_by: uploader.userId,
    })
  } catch (error) {
    // No row points at the object: take it back out rather than leave an orphan.
    await store.removeObject(path).catch(() => undefined)
    throw error
  }
  return { ok: true, id }
}
