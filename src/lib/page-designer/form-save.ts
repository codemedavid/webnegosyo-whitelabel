/**
 * Saving the Page Designer's checkout form: the questions each order type
 * asks (`customer_form_fields`). The same rows the Order types page and the
 * register read, written through the order-type service (its schema, its
 * `store_setup` check, the caller's session so RLS applies).
 *
 * The browser sends, per order type, the questions it loaded and its draft.
 * The writes are worked out HERE from what the database holds now, and only
 * after checking that every order type is this store's and that nobody
 * changed its questions since the editor loaded them. Server only (it reads
 * the session through `@/lib/supabase/server`).
 */

import {
  createCustomerFormField,
  deleteCustomerFormField,
  reorderCustomerFormFields,
  updateCustomerFormField,
} from '@/lib/order-types-service'
import { createClient } from '@/lib/supabase/server'

import {
  diffFormFields,
  formDraftFromRows,
  formSaveInputSchema,
  remapTempIds,
  sameQuestions,
  type FormDraft,
  type FormOp,
  type FormSaveOutcome,
} from './form-changes'

export type FormSaveResult = { success: true; outcome: FormSaveOutcome } | { success: false; error: string; outcome?: FormSaveOutcome }

const FIELD_COLUMNS = 'id, order_type_id, field_name, field_label, field_type, is_required, placeholder, options, validation_rules, order_index'

type Client = Awaited<ReturnType<typeof createClient>>

interface OrderTypeRow {
  id: string
  name: string | null
}

async function readOrderTypes(supabase: Client, tenantId: string, ids: string[]): Promise<OrderTypeRow[] | null> {
  const { data, error } = await supabase.from('order_types').select('id, name').eq('tenant_id', tenantId).in('id', ids)
  if (error) {
    console.error('[saveCheckoutForm] Could not read order types:', error)
    return null
  }
  return (data ?? []) as unknown as OrderTypeRow[]
}

async function readQuestions(supabase: Client, tenantId: string, ids: string[]): Promise<FormDraft | null> {
  const { data, error } = await supabase
    .from('customer_form_fields')
    .select(FIELD_COLUMNS)
    .eq('tenant_id', tenantId)
    .in('order_type_id', ids)
    .order('order_index', { ascending: true })
  if (error) {
    console.error('[saveCheckoutForm] Could not read the questions:', error)
    return null
  }
  return formDraftFromRows(ids, (data ?? []) as unknown as Parameters<typeof formDraftFromRows>[1])
}

/** Run the writes in order; new questions' temp ids resolve to their rows before the reorders. */
async function applyOps(tenantId: string, ops: readonly FormOp[], created: Record<string, string>): Promise<void> {
  for (const op of ops) {
    if (op.op === 'create') {
      const row = await createCustomerFormField(tenantId, op.orderTypeId, op.field)
      created[op.tempId] = row.id
    } else if (op.op === 'update') {
      await updateCustomerFormField(op.fieldId, tenantId, op.field)
    } else if (op.op === 'delete') {
      await deleteCustomerFormField(op.fieldId, tenantId)
    } else {
      await reorderCustomerFormFields(op.fieldIds.map((id) => created[id] ?? id), tenantId)
    }
  }
}

const PARTIAL = 'Some questions could not be saved. The ones that were saved are kept — check them, then save again.'

/** Whether every order type now holds exactly the draft's questions, in its order. */
function landed(after: FormDraft, wanted: FormDraft): boolean {
  return Object.entries(wanted).every(([id, questions]) => {
    const stored = after[id] ?? []
    return stored.length === questions.length && stored.every((q, i) => q.id === questions[i].id)
  })
}

/**
 * Save the checkout questions. The caller has checked `store_setup`; each
 * service write checks it again.
 */
export async function saveCheckoutForm(tenantId: string, input: unknown): Promise<FormSaveResult> {
  const parsed = formSaveInputSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Those questions could not be read. Reload the page and try again.' }
  const ids = Object.keys(parsed.data.orderTypes)
  if (!ids.length) return { success: true, outcome: { fields: {}, created: {} } }

  const supabase = await createClient()
  const orderTypes = await readOrderTypes(supabase, tenantId, ids)
  if (!orderTypes) return { success: false, error: 'Could not save the questions. Please try again.' }
  // An order type of another store (or one deleted meanwhile) is never written.
  if (orderTypes.length !== ids.length || ids.some((id) => !orderTypes.some((row) => row.id === id))) {
    return { success: false, error: 'One of these order types is no longer part of your store. Reload the page.' }
  }
  const names = Object.fromEntries(orderTypes.map((row) => [row.id, row.name?.trim() || 'Order type']))

  const current = await readQuestions(supabase, tenantId, ids)
  if (!current) return { success: false, error: 'Could not save the questions. Please try again.' }
  const moved = ids.filter((id) => !sameQuestions(current[id], parsed.data.orderTypes[id].base))
  if (moved.length) {
    const list = moved.slice(0, 3).map((id) => `"${names[id]}"`).join(', ')
    return {
      success: false,
      error: `The ${list} questions changed somewhere else (Order types or another tab) since you opened this page. Reload to see them, then make your change again.`,
    }
  }

  const draft: FormDraft = Object.fromEntries(ids.map((id) => [id, parsed.data.orderTypes[id].draft]))
  const { ops, problems } = diffFormFields(current, draft, { names })
  if (problems.length) return { success: false, error: problems[0] }

  // Filled in as rows are created, so a failure part-way still reports them.
  const created: Record<string, string> = {}
  let hasFailed = false
  try {
    await applyOps(tenantId, ops, created)
  } catch (error) {
    console.error('[saveCheckoutForm] A write failed part-way:', error)
    hasFailed = true
  }

  // RLS refusals come back as "no error, no rows": compare what is stored now with what was asked for.
  const after = await readQuestions(supabase, tenantId, ids)
  const fields = after ? Object.fromEntries(ids.map((id) => [id, [...(after[id] ?? [])]])) : null
  if (hasFailed || !after || !landed(after, remapTempIds(draft, created))) {
    if (!hasFailed) console.error('[saveCheckoutForm] The stored questions do not match the save', { tenantId, ids })
    // Hand back what IS stored, so the editor's next save starts from it (never a duplicate create).
    return fields ? { success: false, error: PARTIAL, outcome: { fields, created, isPartial: true } } : { success: false, error: PARTIAL }
  }
  return { success: true, outcome: { fields: fields ?? {}, created } }
}
