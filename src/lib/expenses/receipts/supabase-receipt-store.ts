/**
 * The receipts' bucket and table — SERVICE ROLE only.
 *
 * Nothing else can write either (no storage policies, no client INSERT
 * policy). Every call is scoped to an expense the ROUTE already read with the
 * caller's own session; reads FOR a person never come through here.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { RECEIPT_BUCKET } from './rules'
import type { ReceiptStore } from './upload-service'

function fail(context: string, message: string): never {
  throw new Error(`[expense-receipts] ${context}: ${message}`)
}

export function createSupabaseReceiptStore(db: SupabaseClient): ReceiptStore {
  return {
    async countReceipts(expenseId) {
      const { count, error } = await db
        .from('expense_receipts')
        .select('id', { count: 'exact', head: true })
        .eq('expense_id', expenseId)
      if (error) fail('count', error.message)
      return count ?? 0
    },

    async putObject(path, bytes, contentType) {
      const { error } = await db.storage
        .from(RECEIPT_BUCKET)
        .upload(path, bytes, { contentType, upsert: false, cacheControl: 'no-store' })
      if (error) fail('upload', error.message)
    },

    async insertReceipt(row) {
      const { data, error } = await db.from('expense_receipts').insert(row).select('id')
      if (error) fail('insert', error.message)
      if (!data || data.length !== 1) fail('insert', 'no row written')
    },

    async removeObject(path) {
      const { error } = await db.storage.from(RECEIPT_BUCKET).remove([path])
      if (error) fail('remove', error.message)
    },
  }
}
