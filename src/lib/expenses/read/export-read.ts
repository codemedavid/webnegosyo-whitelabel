/**
 * Everything the accountant export needs, read with the CALLER's session so
 * RLS decides what is in the file exactly as it decides what the book shows
 * (a branch-locked account exports its branch).
 */

import type { ExportOutlet } from '../export'
import type { Expense, ExpenseCategory, Supplier } from '../types'
import { EXPENSE_MESSAGES, toExpenseError } from '../errors'
import { listCategories, listExpenses, listSuppliers, type ExpenseDb } from './expenses-read'

export interface ExpenseExportData {
  storeSlug: string
  expenses: Expense[]
  categories: ExpenseCategory[]
  suppliers: Supplier[]
  outlets: ExportOutlet[]
  isTruncated: boolean
}

export interface ExpenseExportQuery {
  tenantId: string
  from: string
  to: string
  /** undefined = every branch the caller reaches; null = store-wide only. */
  outletId?: string | null
}

async function readOutlets(db: ExpenseDb, tenantId: string): Promise<ExportOutlet[]> {
  const { data, error } = await db.from('outlets').select('id, name').eq('tenant_id', tenantId).order('name').limit(1000)
  if (error) throw toExpenseError('read branches', error, EXPENSE_MESSAGES.readFailed)
  return ((data ?? []) as Array<{ id: string; name: string | null }>).map((row) => ({ id: row.id, name: row.name ?? '' }))
}

async function readSlug(db: ExpenseDb, tenantId: string): Promise<string> {
  const { data, error } = await db.from('tenants').select('slug').eq('id', tenantId).maybeSingle()
  if (error) throw toExpenseError('read store', error, EXPENSE_MESSAGES.readFailed)
  return ((data as { slug?: string } | null)?.slug ?? 'store').toLowerCase()
}

/** Void rows included: the accountant sees the correction trail. */
export async function loadExpenseExport(db: ExpenseDb, query: ExpenseExportQuery): Promise<ExpenseExportData> {
  const [list, categories, suppliers, outlets, storeSlug] = await Promise.all([
    listExpenses(db, { tenantId: query.tenantId, from: query.from, to: query.to, outletId: query.outletId, status: 'all' }),
    listCategories(db, query.tenantId),
    listSuppliers(db, query.tenantId),
    readOutlets(db, query.tenantId),
    readSlug(db, query.tenantId),
  ])
  return { storeSlug, expenses: list.expenses, categories, suppliers, outlets, isTruncated: list.isTruncated }
}

/** `expenses-<slug>-<from>-to-<to>.<ext>`, safe inside a Content-Disposition header. */
export function expenseExportFileName(slug: string, from: string, to: string, extension: 'csv' | 'xlsx'): string {
  const safeSlug = slug.replace(/[^a-z0-9-]/gi, '').slice(0, 63) || 'store'
  return `expenses-${safeSlug}-${from}-to-${to}.${extension}`
}
