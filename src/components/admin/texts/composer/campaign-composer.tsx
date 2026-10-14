'use client'

import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { presetForFilter } from '@/lib/texts/view/audience'
import { isDraftDirty, nameProblem, startInstant, whenProblem, type ComposerDraft } from '@/lib/texts/view/composer-draft'
import { finishEstimate } from '@/lib/texts/view/finish'
import { messageProblem, segmentMeter } from '@/lib/texts/view/message'
import { footerPhoneState, isPhoneAway, primaryLabel, waitText } from '@/lib/texts/view/review'
import { finishText, toMs } from '@/lib/texts/view/time'
import { cn } from '@/lib/utils'
import { ConfirmDialog } from '../confirm-dialog'
import { SheetFrame } from '../sheet-frame'
import { useTexts } from '../texts-context'
import { useConfirm } from '../use-confirm'
import { useUnloadGuard } from '../use-unload-guard'
import { ComposerFooter } from './composer-footer'
import { MessageSection } from './message-section'
import { PhonePreview } from './phone-preview'
import { ReviewPane } from './review-pane'
import { useAudiencePreview } from './use-audience-preview'
import { useComposerSubmit } from './use-composer-submit'
import { WhenSection } from './when-section'
import { WhoSection } from './who-section'

interface CampaignComposerProps {
  initial: ComposerDraft
  /** The stored campaign's state; null for a new one. */
  displayState: string | null
  armRequest: number
  onClose: () => void
  onDirtyChange: (isDirty: boolean) => void
}

/** Where to send the owner for the first thing that blocks Review. */
const FIX_TARGETS = { name: 'composer-name', message: 'composer-message-text', when: 'composer-when', audience: 'composer-audience-count' } as const

function focusFirst(id: string) {
  requestAnimationFrame(() => {
    const node = document.getElementById(id)
    node?.scrollIntoView({ block: 'center' })
    node?.focus({ preventScroll: true })
  })
}

/**
 * One scrolling form — Who / Message / When — with the phone preview beside
 * it, then a Review pane before anything reaches a guest. Every number
 * (count, texts per guest, finish time) reacts as the owner edits.
 */
export function CampaignComposer({ initial, displayState, armRequest, onClose, onDirtyChange }: CampaignComposerProps) {
  const { tenantId, live, rules, storeName, optOutLine } = useTexts()
  const [base, setBase] = useState(initial)
  const [draft, setDraft] = useState(initial)
  const [isReview, setReview] = useState(false)
  const [mobileView, setMobileView] = useState<'edit' | 'preview'>('edit')
  const [showErrors, setShowErrors] = useState(false)
  const { state: preview, retry, sampledTemplate } = useAudiencePreview(tenantId, draft.audience, draft.messageTemplate)
  const { ask, dialogProps } = useConfirm()
  const isDirty = isDraftDirty(base, draft)
  const isLive = displayState !== null && displayState !== 'draft'
  const submit = useComposerSubmit(draft, displayState, (saved) => { setBase(saved); setDraft(saved) })
  const update = (patch: Partial<ComposerDraft>) => setDraft((prev) => ({ ...prev, ...patch }))
  useEffect(() => onDirtyChange(isDirty), [isDirty, onDirtyChange])
  useUnloadGuard(isDirty)

  const now = Date.now()
  const reach = preview.preview?.reach ?? 0
  const phone = footerPhoneState(live.sender.heroState)
  const isAway = isPhoneAway(phone)
  const meter = segmentMeter({ template: draft.messageTemplate, storeName, optOutLine, reach })
  const finish = finishEstimate({
    texts: reach * Math.max(1, meter.segments), start: startInstant(draft, now), now, isNow: draft.when === 'now',
    waitingAhead: live.sender.waiting, sentToday: live.sender.sentToday, rules, isPhoneAway: isAway,
  })
  const problems = { name: nameProblem(draft.name), message: messageProblem(draft.messageTemplate) ?? (meter.tone === 'error' ? meter.text : null), when: whenProblem(draft, now) }
  const primary = primaryLabel({ when: draft.when, phone, reach, quietUntil: toMs(live.sender.quietUntil) })

  const goReview = () => {
    setShowErrors(true)
    const first = problems.name ? 'name' : problems.message ? 'message' : problems.when ? 'when' : !preview.preview || reach === 0 ? 'audience' : null
    if (first) return focusFirst(FIX_TARGETS[first])
    setReview(true)
  }
  const back = (sectionId?: string) => {
    setReview(false)
    if (sectionId) focusFirst(sectionId)
  }
  const onPrimary = () => {
    if (draft.when !== 'now' || phone === 'none') return void submit.start(phone)
    const pace = isAway
      ? waitText(live.sender.primary?.name ?? null, live.sender.primary?.lastSeenAt ?? null, now)
      : `They get it from ${live.sender.primary?.name ?? 'your phone'}, about 25 every 30 minutes.${finish?.finishAt ? ` Done ${finishText(finish.finishAt, now)}.` : ''}`
    ask({
      title: `Text ${reach.toLocaleString('en-US')} guests now?`,
      body: `${pace} You can pause anytime.`,
      cancelLabel: 'Not yet',
      confirmLabel: primary,
      onConfirm: () => submit.start(phone),
    })
  }

  const toggle = (
    <div className="flex rounded-full bg-muted p-0.5 lg:hidden" role="tablist" aria-label="Composer view">
      {(['edit', 'preview'] as const).map((view) => (
        <button key={view} type="button" role="tab" aria-selected={mobileView === view} onClick={() => setMobileView(view)}
          className={cn('min-h-11 rounded-full px-3 text-xs font-medium capitalize sm:min-h-9', mobileView === view ? 'bg-background shadow-sm' : 'text-muted-foreground')}>
          {view}
        </button>
      ))}
    </div>
  )

  return (
    <SheetFrame
      title={draft.id ? draft.name || 'Campaign' : `New campaign${draft.name ? ` · ${draft.name}` : ''}`}
      description={isReview ? 'Check it once more before it goes out.' : 'Who gets it, what it says, and when.'}
      headerExtra={toggle}
      isDirty={isDirty}
      armRequest={armRequest}
      onClose={onClose}
      footer={
        <ComposerFooter isReview={isReview} phone={phone} primary={primary} secondary={isLive ? 'Save changes' : 'Save draft'} busy={submit.busy}
          onSaveDraft={() => void submit.saveDraft()} onReview={goReview} onPrimary={onPrimary} />
      }
    >
      <div className="flex min-h-full">
        <div className={cn('min-w-0 flex-1', mobileView === 'preview' && 'hidden lg:block')}>
          <div className="mx-auto max-w-xl space-y-8 px-4 py-6 sm:px-6">
            {isReview && preview.preview ? (
              <ReviewPane draft={draft} preview={preview.preview} finishText={finish?.text ?? null} phone={phone} onBack={back} />
            ) : (
              <>
                <div className="space-y-1.5">
                  <label htmlFor="composer-name" className="text-xs font-medium text-muted-foreground">Campaign name (only you see it)</label>
                  <Input id="composer-name" value={draft.name} maxLength={80} onChange={(event) => update({ name: event.target.value })}
                    aria-invalid={showErrors && problems.name !== null} aria-describedby={problems.name ? 'composer-name-error' : undefined}
                    className="h-11 text-base font-semibold" />
                  {showErrors && problems.name && <p id="composer-name-error" role="alert" className="text-sm text-destructive">{problems.name}</p>}
                </div>
                <WhoSection audience={draft.audience} onChange={(audience) => update({ audience })} preview={preview} onRetry={retry} />
                <MessageSection value={draft.messageTemplate} onChange={(messageTemplate) => update({ messageTemplate })} name={draft.name}
                  audiencePreset={presetForFilter(draft.audience)} reach={reach} showErrors={showErrors} />
                <WhenSection draft={draft} onChange={update} problem={showErrors || draft.when !== 'now' ? problems.when : null} finish={finish} />
              </>
            )}
          </div>
        </div>
        <aside aria-label="Phone preview" className={cn('border-l bg-muted/40 px-6 py-8 lg:block lg:w-[380px] lg:shrink-0', mobileView === 'preview' ? 'block flex-1 border-l-0' : 'hidden')}>
          <div className="lg:sticky lg:top-8">
            <PhonePreview template={draft.messageTemplate} samples={sampledTemplate === draft.messageTemplate.trim() ? preview.preview?.samples ?? [] : []} />
          </div>
        </aside>
      </div>
      <ConfirmDialog {...dialogProps} />
    </SheetFrame>
  )
}
