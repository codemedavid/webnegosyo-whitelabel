'use client'

import { ArrowLeft, CalendarClock, Gauge, MessageSquareText, ShieldCheck, Smartphone, TriangleAlert, Users, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { AudiencePreview } from '@/lib/texts/types'
import { presetForFilter, skippedTotal } from '@/lib/texts/view/audience'
import { startInstant, type ComposerDraft } from '@/lib/texts/view/composer-draft'
import { hasLink, renderSample, segmentMeter } from '@/lib/texts/view/message'
import { audienceSummary, isPhoneAway, repeatLabel, reviewHeading, waitText, type FooterPhoneState } from '@/lib/texts/view/review'
import { heroView } from '@/lib/texts/view/hero'
import { quietWindowText, startText, timeAgoText } from '@/lib/texts/view/time'
import { IconTile } from '../status-chip'
import { useTexts } from '../texts-context'

interface ReviewPaneProps {
  draft: ComposerDraft
  preview: AudiencePreview
  finishText: string | null
  phone: FooterPhoneState
  onBack: (sectionId?: string) => void
}

function Row({ term, icon: Icon, children }: { term: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 border-b border-wn-line py-4 last:border-b-0">
      <IconTile size="sm"><Icon /></IconTile>
      <div className="min-w-0 flex-1">
        <dt className="text-xs font-medium uppercase tracking-wide text-wn-stone">{term}</dt>
        <dd className="mt-0.5 min-w-0 text-sm">{children}</dd>
      </div>
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
      <Button type="button" variant="ghost" size="sm" className="-ml-2 min-h-11 rounded-full text-wn-stone sm:min-h-8" onClick={() => onBack()}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to edit
      </Button>
      <h3 className="text-2xl font-semibold leading-tight tracking-tight">
        {reviewHeading({ reach: preview.reach, preset, when: draft.when, startAt: startInstant(draft, now), now, phoneName: live.sender.primary?.name ?? null, repeatLabel: repeat, phone })}
      </h3>
      <dl className="rounded-2xl border border-wn-line bg-white px-5 shadow-[0_1px_2px_rgba(29,24,21,0.04)]">
        <Row term="Who" icon={Users}>{audienceSummary(preset, preview.reach, skippedTotal(preview.skipped))}</Row>
        <Row term="Message" icon={MessageSquareText}>
          <p className="my-1.5 max-w-sm whitespace-pre-wrap rounded-[1.1rem] rounded-bl-[0.3rem] bg-stone-100 px-3.5 py-2 text-[13px] leading-snug">{renderSample(draft.messageTemplate, storeName, optOutLine)}</p>
          <span className="text-wn-stone">{meter.segments === 1 ? '1 text per guest' : `${meter.segments} texts per guest`}</span>
        </Row>
        <Row term="When" icon={CalendarClock}>
          <span className="block font-medium">{when.charAt(0).toUpperCase() + when.slice(1)}</span>
          {finishText && <span className="block text-wn-stone">{finishText}</span>}
        </Row>
        <Row term="Phone" icon={Smartphone}>
          {phone === 'none' ? 'No phone connected yet' : isAway ? wait : (
            <>
              <span className="block font-medium">{live.sender.primary?.name ?? 'Your phone'}</span>
              <span className="block text-wn-stone">{hero.state === 'resting' ? hero.sentence : `Ready · checked in ${timeAgoText(live.sender.primary?.lastSeenAt ?? null, now) || 'recently'}`}</span>
            </>
          )}
        </Row>
        <Row term="Uses" icon={Gauge}>about {(preview.reach * Math.max(1, meter.segments)).toLocaleString('en-US')} texts from your SIM</Row>
        <Row term="Rules" icon={ShieldCheck}>Quiet hours {quietWindowText(rules)} · one text per guest every {rules.guestCapDays === 1 ? 'day' : `${rules.guestCapDays} days`}</Row>
      </dl>
      {warnings.length > 0 && (
        <ul className="space-y-2">
          {warnings.map((warning) => (
            <li key={warning.text} className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
              <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="flex-1">{warning.text}</span>
              {warning.section && <Button type="button" size="sm" variant="link" className="min-h-11 px-0 font-semibold text-amber-900 sm:min-h-0" onClick={() => onBack(warning.section)}>Fix</Button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
