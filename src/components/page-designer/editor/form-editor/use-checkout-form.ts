'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { z } from 'zod'

import {
  copyQuestions,
  diffFormFields,
  formQuestionSchema,
  formSaveInput,
  remapTempIds,
  sameQuestions,
  type CheckoutFormSource,
  type FormDraft,
  type FormOrderType,
  type FormQuestion,
  type FormSaveInput,
  type FormSaveOutcome,
} from '@/lib/page-designer/form-changes'

export type { CheckoutFormSource, FormOrderType }

const storedDraftSchema = z.record(z.string(), z.array(formQuestionSchema))

/** An unsent draft survives a reload; only order types the store still has are restored. */
function readDraft(key: string, saved: FormDraft): FormDraft | null {
  try {
    const raw = window.localStorage.getItem(key)
    const parsed = storedDraftSchema.safeParse(raw ? JSON.parse(raw) : null)
    if (!parsed.success) return null
    const known = Object.entries(parsed.data).filter(([id]) => id in saved)
    return known.length ? { ...saved, ...Object.fromEntries(known) } : null
  } catch {
    return null
  }
}

function writeDraft(key: string, saved: FormDraft, draft: FormDraft): void {
  try {
    const changed = Object.keys(draft).filter((id) => !sameQuestions(saved[id], draft[id]))
    if (changed.length) window.localStorage.setItem(key, JSON.stringify(Object.fromEntries(changed.map((id) => [id, draft[id]]))))
    else window.localStorage.removeItem(key)
  } catch {
    // Storage full or blocked — the draft is a convenience, saving still works.
  }
}

const EMPTY: CheckoutFormSource = { orderTypes: [], saved: {} }

/**
 * The checkout questions in the Page Designer: what is saved, the editor's
 * draft, and the save input (undefined = nothing changed). `markSaved` takes
 * exactly what was sent, so an edit made while a save is on its way stays
 * unsaved instead of being overwritten by the reply.
 */
export function useCheckoutForm(tenantId: string, source: CheckoutFormSource | null) {
  const { orderTypes, saved: initial } = source ?? EMPTY
  const draftKey = `pd-form:${tenantId}`
  const [saved, setSaved] = useState<FormDraft>(initial)
  const [draft, setDraft] = useState<FormDraft>(initial)
  const tabs = useMemo(() => orderTypes.filter((t) => t.isEnabled), [orderTypes])
  const [activeId, setActiveId] = useState<string | null>(tabs[0]?.id ?? null)
  const restored = useRef(false)

  useEffect(() => {
    if (restored.current || !source) return
    restored.current = true
    const stored = readDraft(draftKey, initial)
    if (stored) setDraft(stored)
  }, [draftKey, initial, source])

  useEffect(() => {
    if (restored.current) writeDraft(draftKey, saved, draft)
  }, [draftKey, saved, draft])

  const input = useMemo<FormSaveInput | undefined>(() => formSaveInput(saved, draft), [saved, draft])
  const names = useMemo(() => Object.fromEntries(orderTypes.map((t) => [t.id, t.name])), [orderTypes])
  const problems = useMemo(() => (input ? diffFormFields(saved, draft, { names }).problems : []), [input, saved, draft, names])

  const edit = useCallback(
    (orderTypeId: string, change: (questions: readonly FormQuestion[]) => readonly FormQuestion[]) =>
      setDraft((current) => ({ ...current, [orderTypeId]: change(current[orderTypeId] ?? []) })),
    [],
  )

  const markSaved = useCallback((sent: FormSaveInput, outcome: FormSaveOutcome) => {
    setSaved((current) => ({ ...current, ...outcome.fields }))
    setDraft((current) => {
      const remapped = remapTempIds(current, outcome.created)
      const next: Record<string, readonly FormQuestion[]> = { ...remapped }
      for (const id of Object.keys(sent.orderTypes)) {
        const sentDraft = remapTempIds({ [id]: sent.orderTypes[id].draft }, outcome.created)[id]
        // Untouched since it was sent → take the stored copy (its new names and ids).
        if (outcome.fields[id] && sameQuestions(remapped[id], sentDraft)) next[id] = outcome.fields[id]
      }
      return next
    })
  }, [])

  return {
    orderTypes,
    tabs,
    activeId: activeId && tabs.some((t) => t.id === activeId) ? activeId : (tabs[0]?.id ?? null),
    setActiveId,
    saved,
    draft,
    input,
    problems,
    hasChanges: input !== undefined,
    edit,
    copyFrom: (from: string, to: string) => setDraft((current) => copyQuestions(current, from, to)),
    discard: () => setDraft(saved),
    markSaved,
  }
}

export type CheckoutFormEditor = ReturnType<typeof useCheckoutForm>
