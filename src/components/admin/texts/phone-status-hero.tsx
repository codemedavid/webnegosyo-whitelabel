'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { heroView, type HeroView } from '@/lib/texts/view/hero'
import { cn } from '@/lib/utils'
import { HeroCard } from './hero/hero-card'
import { NoPhoneHero } from './hero/no-phone-hero'
import { StatusDot, TONE_CLASSES } from './status-chip'
import { useTexts } from './texts-context'
import { useTickingNow } from './use-ticking-now'

/**
 * "Can my texts go out right now?" — one state word, one sentence, one fix.
 * `role=status` announces only a change of state, never the ticking "1 min ago".
 */
export function PhoneStatusHero({ isCompact, onRetry }: { isCompact: boolean; onRetry: () => void }) {
  const { live, isLiveStale, isDemo, setUrl, downloadUrl } = useTexts()
  const now = useTickingNow(live.sender.now)
  const sender = { ...live.sender, now: new Date(now).toISOString(), ...(isLiveStale ? { heroState: 'unknown' as const } : {}) }
  const view = heroView(sender, isDemo)
  const announcement = useStateAnnouncement(view.word)
  const openPhones = () => setUrl({ phones: true })

  const act = () => {
    const { action } = view
    if (action.kind === 'campaign' && action.campaignId) setUrl({ campaign: action.campaignId, isReport: true })
    else if (action.kind === 'retry') onRetry()
    else openPhones()
  }

  return (
    <>
      <span role="status" className="sr-only">{announcement}</span>
      {/* A phone always gets the one-line hero; a laptop gets the full card on Campaigns and Automatic. */}
      <div className={isCompact ? undefined : 'sm:hidden'}>
        <CompactHero view={view} onOpen={openPhones} />
      </div>
      {!isCompact && (
        <div className="hidden sm:block">
          {view.state === 'none'
            ? <NoPhoneHero downloadUrl={downloadUrl} onConnect={openPhones} />
            : <HeroCard view={view} phones={sender.phones} onAct={act} onPhones={openPhones} />}
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

function CompactHero({ view, onOpen }: { view: HeroView; onOpen: () => void }) {
  const isLive = view.state === 'ready' || view.state === 'sending'
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'flex min-h-14 w-full items-center gap-3 rounded-2xl border bg-gradient-to-r px-4 py-3 text-left shadow-[0_1px_2px_rgba(29,24,21,0.04)] transition-colors hover:border-stone-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        TONE_CLASSES[view.tone].wash
      )}
      aria-label={`${view.word}. ${view.sentence} Open phones`}
    >
      <StatusDot tone={view.tone} isPulsing={isLive} />
      <span className="min-w-0 flex-1 text-sm">
        <span className={cn('block font-semibold', TONE_CLASSES[view.tone].text)}>{view.word}</span>
        <span className="line-clamp-2 text-wn-stone">{view.sentence}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-wn-stone" aria-hidden="true" />
    </button>
  )
}
