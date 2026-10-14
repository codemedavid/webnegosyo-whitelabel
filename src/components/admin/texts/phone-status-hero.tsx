'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronRight, Moon, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { heroView, type HeroView } from '@/lib/texts/view/hero'
import { cn } from '@/lib/utils'
import { StatusDot, TONE_CLASSES } from './status-chip'
import { useTexts } from './texts-context'

/**
 * "Can my texts go out right now?" — one state word, one sentence, one fix.
 * `role=status` announces only a change of state, never the ticking "1 min ago".
 */
export function PhoneStatusHero({ isCompact, onRetry }: { isCompact: boolean; onRetry: () => void }) {
  const { live, isLiveStale, isDemo, setUrl } = useTexts()
  const sender = isLiveStale ? { ...live.sender, heroState: 'unknown' as const } : live.sender
  const view = heroView(sender, isDemo)
  const announcement = useStateAnnouncement(view.word)

  const act = () => {
    const { action } = view
    if (action.kind === 'campaign' && action.campaignId) setUrl({ campaign: action.campaignId })
    else if (action.kind === 'retry') onRetry()
    else setUrl({ phones: true })
  }

  return (
    <>
      <span role="status" className="sr-only">{announcement}</span>
      {/* A phone always gets the one-line hero; a laptop gets the full card on Campaigns and Automatic. */}
      <div className={isCompact ? undefined : 'sm:hidden'}>
        <CompactHero view={view} onOpen={() => setUrl({ phones: true })} />
      </div>
      {!isCompact && (
        <div className="hidden sm:block">
          <FullHero view={view} onAct={act} onPhones={() => setUrl({ phones: true })} />
        </div>
      )}
    </>
  )
}

/** Announce "Phone: Offline" when the word changes, not on first paint. */
function useStateAnnouncement(word: string): string {
  const [text, setText] = useState('')
  const last = useRef(word)
  useEffect(() => {
    if (last.current === word) return
    last.current = word
    setText(`Phone: ${word}`)
  }, [word])
  return text
}

function HeroIcon({ view, size }: { view: HeroView; size: 'sm' | 'lg' }) {
  const Icon = view.icon === 'moon' ? Moon : Smartphone
  return (
    <span className={cn('relative flex shrink-0 items-center justify-center rounded-full bg-muted', size === 'lg' ? 'h-11 w-11' : 'h-8 w-8')}>
      <Icon className={size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'} aria-hidden="true" />
      <StatusDot tone={view.tone} className="absolute -right-0.5 -top-0.5 ring-2 ring-card" />
    </span>
  )
}

function FullHero({ view, onAct, onPhones }: { view: HeroView; onAct: () => void; onPhones: () => void }) {
  const ratio = view.meter.limit > 0 ? Math.min(1, view.meter.sent / view.meter.limit) : 0
  const isPhonesAction = view.action.kind === 'phones'
  // "How to connect" and "Fix it" already open Phones: a second Phones button would be the same door twice.
  const opensPhones = isPhonesAction || view.action.kind === 'connect' || view.action.kind === 'fix'
  return (
    <section aria-label="Sending phone" className="rounded-2xl border bg-card p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 gap-4">
          <HeroIcon view={view} size="lg" />
          <div className="min-w-0 flex-1 space-y-1">
            <p className={cn('text-base font-semibold', TONE_CLASSES[view.tone].text)}>{view.word}</p>
            <p className="text-sm text-muted-foreground">{view.sentence}</p>
            {view.subLine && <p className="text-xs text-muted-foreground">{view.subLine}</p>}
            {view.state !== 'none' && (
              <div className="flex items-center gap-3 pt-2">
                <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <div className="h-full rounded-full bg-foreground/70 transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${ratio * 100}%` }} />
                </div>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{view.meter.text}</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-2 sm:flex-col sm:items-end">
          <Button type="button" onClick={onAct} variant={isPhonesAction ? 'outline' : 'default'} className="min-h-11 rounded-full sm:min-h-9">
            {view.action.label}
          </Button>
          {!opensPhones && (
            <Button type="button" variant="ghost" onClick={onPhones} className="min-h-11 rounded-full sm:min-h-9">
              Phones
            </Button>
          )}
        </div>
      </div>
    </section>
  )
}

function CompactHero({ view, onOpen }: { view: HeroView; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-11 w-full items-center gap-3 rounded-2xl border bg-card px-4 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`${view.word}. ${view.sentence} Open phones`}
    >
      <StatusDot tone={view.tone} />
      <span className="min-w-0 flex-1 truncate text-sm">
        <span className={cn('font-semibold', TONE_CLASSES[view.tone].text)}>{view.word}</span>
        <span className="text-muted-foreground"> · {view.sentence}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  )
}
