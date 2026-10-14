'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { saveCampaignAction, scheduleCampaignAction, sendCampaignNowAction } from '@/app/actions/texts'
import { draftToInput, startInstant, type ComposerDraft } from '@/lib/texts/view/composer-draft'
import { afterSendToast, isPhoneAway, repeatLabel, savedChangesToast, type FooterPhoneState } from '@/lib/texts/view/review'
import { toMs } from '@/lib/texts/view/time'
import { DEMO_READONLY, runAction } from '../run-action'
import { useTexts } from '../texts-context'

const START_FAILED = "Couldn't start sending. This campaign changed somewhere else. Reopen it."

/**
 * Save / Send now / Schedule. Every path saves first (so the stored campaign
 * is exactly what the owner reviewed), then starts it and opens its report.
 * Saving a live (scheduled, repeating) campaign keeps it live.
 */
export function useComposerSubmit(draft: ComposerDraft, displayState: string | null, onSaved: (saved: ComposerDraft) => void) {
  const { tenantId, isDemo, refresh, setUrl } = useTexts()
  const [busy, setBusy] = useState<'save' | 'start' | null>(null)

  const save = async (): Promise<string | null> => {
    const value = await runAction(() => saveCampaignAction(tenantId, draftToInput(draft, Date.now())))
    if (!value) return null
    onSaved({ ...draft, id: value.id })
    return value.id
  }

  const saveDraft = async () => {
    if (isDemo) return void toast.info(DEMO_READONLY)
    setBusy('save')
    const id = await save()
    setBusy(null)
    if (!id) return
    const now = Date.now()
    const repeat = repeatLabel(draft.repeatKind, draft.weekdays, draft.intervalDays, draft.time)
    toast.success(displayState && displayState !== 'draft'
      ? savedChangesToast({ displayState, when: draft.when, startAt: startInstant(draft, now), now, repeat })
      : 'Draft saved.')
    refresh()
  }

  const start = async (phone: FooterPhoneState) => {
    if (isDemo) return void toast.info(DEMO_READONLY)
    setBusy('start')
    try {
      const id = await save()
      if (!id) return
      const now = Date.now()
      const repeat = repeatLabel(draft.repeatKind, draft.weekdays, draft.intervalDays, draft.time)
      if (draft.when === 'now') {
        const sent = await runAction(() => sendCampaignNowAction(tenantId, id), START_FAILED)
        if (!sent) return refresh()
        const finishAt = isPhoneAway(phone) ? null : toMs(sent.finishAt)
        toast.success(afterSendToast({ when: 'now', phone, queued: sent.queued, finishAt, startAt: now, now, repeat }))
      } else {
        const scheduled = await runAction(() => scheduleCampaignAction(tenantId, id), START_FAILED)
        if (!scheduled) return refresh()
        toast.success(afterSendToast({ when: draft.when, phone, queued: 0, finishAt: null, startAt: startInstant(draft, now), now, repeat }))
      }
      refresh()
      // The report, not the editor: a scheduled campaign would otherwise reopen in the composer.
      setUrl({ campaign: id, edit: false, isReport: true })
    } finally {
      setBusy(null)
    }
  }

  return { busy, saveDraft, start }
}
