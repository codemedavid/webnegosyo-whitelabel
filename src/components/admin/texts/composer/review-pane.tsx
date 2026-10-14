'use client'

import { ArrowLeft, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { AudiencePreview } from '@/lib/texts/types'
import { presetForFilter, skippedTotal } from '@/lib/texts/view/audience'
import { startInstant, type ComposerDraft } from '@/lib/texts/view/composer-draft'
import { hasLink, renderSample, segmentMeter } from '@/lib/texts/view/message'
import { audienceSummary, isPhoneAway, repeatLabel, reviewHeading, waitText, type FooterPhoneState } from '@/lib/texts/view/review'
import { heroView } from '@/lib/texts/view/hero'
import { quietWindowText, startText } from '@/lib/texts/view/time'
import { useTexts } from '../texts-context'

interface ReviewPaneProps {
  draft: ComposerDraft
  preview: AudiencePreview
  finishText: string | null
  phone: FooterPhoneState
  onBack: (sectionId?: string) => void
}

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-b py-3 last:border-b-0 sm:grid-cols-[110px_1fr] sm:gap-4">
      <dt className="text-sm font-medium text-muted-foreground">{term}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  )
}

/** A deliberate stop before texting real people from the owner's own SIM. */
export function ReviewPane({ draft, preview, finishText, phone, onBack }: ReviewPaneProps) {
  const { live, isDemo, storeName, optOutLine, rules } = useTexts()
  const now = Date.now()
  const preset = presetForFilter(draft.audience)
  const meter = segmentMeter({ template: draft.messageTemplate, storeName, optOutLine, reach: preview.reach })
  const repeat = repeatLabel(draft.repeatKind, draft.weekdays, draft.intervalDays, draft.time)
  const hero = heroView(live.sender, isDemo)
  const isAway = isPhoneAway(phone)
  const wait = waitText(live.sender.primary?.name ?? null, live.sender.primary?.lastSeenAt ?? null, now)
  const when = draft.when === 'now' ? 'Now' : draft.when === 'later' ? startText(startInstant(draft, now), now) : repeat
  const warnings: { text: string; section: string }[] = []
  if (hasLink(draft.messageTemplate)) warnings.push({ text: 'Has a link: phone networks often block these.', section: 'composer-message' })
  if (meter.canRemoveEmoji) warnings.push({ text: 'Emoji make each text cost more.', section: 'composer-message' })
  if (phone === 'offline') warnings.push({ text: wait, section: '' })

  return (
    <div className="space-y-6">
      <Button type="button" variant="ghost" size="sm" className="-ml-2 min-h-11 sm:min-h-8" onClick={() => onBack()}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to edit
      </Button>
      <h3 className="text-xl font-semibold tracking-tight">
        {reviewHeading({ reach: preview.reach, preset, when: draft.when, startAt: startInstant(draft, now), now, phoneName: live.sender.primary?.name ?? null, repeatLabel: repeat, phone })}
      </h3>
      <dl className="rounded-2xl border bg-card px-4">
        <Row term="Who">{audienceSummary(preset, preview.reach, skippedTotal(preview.skipped))}</Row>
        <Row term="Message">
          <p className="mb-1 max-w-sm whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-muted px-3 py-2">{renderSample(draft.messageTemplate, storeName, optOutLine)}</p>
          <span className="text-muted-foreground">{meter.segments === 1 ? '1 text per guest' : `${meter.segments} texts per guest`}</span>
        </Row>
        <Row term="When">{when}{finishText ? ` · ${finishText}` : ''}</Row>
        <Row term="Phone">{phone === 'none' ? 'No phone connected yet' : isAway ? wait : `${hero.word} · ${hero.sentence}`}</Row>
        <Row term="Uses">about {(preview.reach * Math.max(1, meter.segments)).toLocaleString('en-US')} texts from your SIM</Row>
        <Row term="Rules">quiet hours {quietWindowText(rules)} · one text per guest every {rules.guestCapDays === 1 ? 'day' : `${rules.guestCapDays} days`}</Row>
      </dl>
      {warnings.length > 0 && (
        <ul className="space-y-2">
          {warnings.map((warning) => (
            <li key={warning.text} className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="flex-1">{warning.text}</span>
              {warning.section && <Button type="button" size="sm" variant="link" className="h-auto px-0 text-amber-900 dark:text-amber-200" onClick={() => onBack(warning.section)}>Fix</Button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
