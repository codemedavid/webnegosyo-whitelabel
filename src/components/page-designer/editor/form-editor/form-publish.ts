'use client'

import { publishPageDesignAction } from '@/app/actions/page-designer'
import type { FormSaveInput, FormSaveOutcome } from '@/lib/page-designer/form-changes'
import type { PageId } from '@/lib/page-designer/types'
import type { BuilderSurface } from '@/components/hero-builder/editor/surface'

import type { PendingLook } from '../page-surfaces'

/** The checkout's unsaved questions, read at publish time; `onSaved` runs once they are stored. */
export interface PendingForm {
  input: FormSaveInput | undefined
  /** Called with exactly what was sent and what the server stored. */
  onSaved: (sent: FormSaveInput, outcome: FormSaveOutcome) => void
}

/**
 * The checkout surface, publishing the form's questions together with the
 * design and the Look. Without unsaved questions it publishes exactly as
 * before. Questions the server stored are marked saved even when the publish
 * itself then failed, so publishing again is not read as a conflict.
 */
export function withFormPublish(
  surface: BuilderSurface,
  page: PageId,
  pendingLook: () => PendingLook | null,
  pendingForm: () => PendingForm | null,
): BuilderSurface {
  if (page !== 'checkout') return surface
  return {
    ...surface,
    publish: async (target, design) => {
      const form = pendingForm()
      const sent = form?.input
      if (!sent) return surface.publish(target, design)
      const look = pendingLook()
      const lookSent = look?.input
      const result = await publishPageDesignAction(target.tenantId, page, design, lookSent, sent)
      if (result.form) form?.onSaved(sent, result.form)
      if (result.success && lookSent) look?.onSaved(lookSent.changes)
      return result
    },
  }
}
