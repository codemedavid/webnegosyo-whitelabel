'use client'

import { Moon, Smartphone, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { SendingPhone } from '@/lib/texts/types'
import { phoneChip } from '@/lib/texts/view/chips'
import type { HeroView } from '@/lib/texts/view/hero'
import { cn } from '@/lib/utils'
import { Meter, StatusDot, TONE_CLASSES } from '../status-chip'

const LIVE_STATES = new Set(['ready', 'sending'])

function initials(name: string): string {
  const words = name.replace(/['’]s\b/g, '').split(/\s+/).filter(Boolean)
  return (words.length > 1 ? `${words[0][0]}${words[1][0]}` : name.slice(0, 2)).toUpperCase()
}

/** One small avatar per phone, its own status dot in the corner. */
function PhoneAvatars({ phones, onOpen }: { phones: SendingPhone[]; onOpen: () => void }) {
  if (phones.length === 0) return null
  return (
    <button type="button" onClick={onOpen} className="group flex min-h-11 items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm text-wn-stone transition-colors hover:bg-wn-sand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span className="flex -space-x-2">
        {phones.slice(0, 3).map((phone) => (
          <span key={phone.deviceId} className="relative flex h-8 w-8 items-center justify-center rounded-full bg-wn-ink text-[11px] font-semibold text-white ring-2 ring-white" title={`${phone.name}: ${phoneChip(phone.state, phone.isInactive).label}`}>
            {initials(phone.name)}
            <StatusDot tone={phoneChip(phone.state, phone.isInactive).tone} className="absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-white" />
          </span>
        ))}
      </span>
      <span className="font-medium text-foreground group-hover:underline">{phones.length === 1 ? '1 phone' : `${phones.length} phones`}</span>
    </button>
  )
}

interface HeroCardProps {
  view: HeroView
  phones: SendingPhone[]
  onAct: () => void
  onPhones: () => void
}

/** "Can my texts go out right now?" — the state, one sentence, the day's meter, one fix. */
export function HeroCard({ view, phones, onAct, onPhones }: HeroCardProps) {
  const tone = TONE_CLASSES[view.tone]
  const Icon = view.icon === 'moon' ? Moon : Smartphone
  const isLive = LIVE_STATES.has(view.state)
  const ratio = view.meter.limit > 0 ? view.meter.sent / view.meter.limit : 0
  const isPrimaryPhones = view.action.kind === 'phones'
  return (
    <section aria-label="Sending phone" className={cn('relative overflow-hidden rounded-2xl border bg-gradient-to-br p-6 shadow-[0_1px_2px_rgba(29,24,21,0.04)]', tone.wash)}>
      <div className="flex items-start gap-5">
        <span className={cn('relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl', tone.tile)} aria-hidden="true">
          <Icon className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className={cn('flex items-center gap-2 text-lg font-semibold tracking-tight', tone.text)}>
              <StatusDot tone={view.tone} isPulsing={isLive} />
              {view.word}
            </p>
            {view.subLine && <span className="text-xs text-wn-stone">{view.subLine}</span>}
          </div>
          <p className="mt-1 max-w-2xl text-[15px] leading-relaxed text-foreground/80">{view.sentence}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <PhoneAvatars phones={phones} onOpen={onPhones} />
          {!isPrimaryPhones && (
            <Button type="button" onClick={onAct} className="min-h-11 rounded-full px-5 sm:min-h-10">
              {view.action.label} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
      {view.state !== 'none' && (
        <div className="mt-5 flex items-center gap-4 border-t border-black/5 pt-4 pl-[76px]">
          <span className="text-xs font-medium uppercase tracking-wide text-wn-stone">Sent today</span>
          <Meter ratio={ratio} tone={ratio >= 1 ? 'amber' : 'emerald'} className="max-w-sm flex-1" />
          <span className="text-sm tabular-nums text-foreground"><span className="font-semibold">{view.meter.sent}</span><span className="text-wn-stone"> of {view.meter.limit}</span></span>
        </div>
      )}
    </section>
  )
}
