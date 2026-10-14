'use client'

import { useState } from 'react'
import { ChevronDown, Loader2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { audienceCountText, skippedLines, skippedTotal, zeroReachReason } from '@/lib/texts/view/audience'
import { useTexts } from '../texts-context'
import type { PreviewState } from './use-audience-preview'

/** "148 guests will get this · 62 skipped ▾", announced once the count settles. */
export function AudienceCount({ state, onRetry }: { state: PreviewState; onRetry: () => void }) {
  const { rules, tenantSlug } = useTexts()
  const [isOpen, setOpen] = useState(false)
  const preview = state.preview

  if (state.status === 'error' && !preview) {
    return (
      <div className="flex items-center gap-3 rounded-xl border px-4 py-3 text-sm" role="alert">
        <span className="flex-1">Couldn&apos;t count guests.</span>
        <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-8" onClick={onRetry}>Try again</Button>
      </div>
    )
  }
  if (!preview) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> Counting guests…
      </p>
    )
  }

  const total = skippedTotal(preview.skipped)
  const lines = skippedLines(preview.skipped, rules.guestCapDays)
  const announcement = state.status === 'ready'
    ? `${audienceCountText(preview.reach)}${total > 0 ? `, ${total} skipped` : ''}`
    : ''

  return (
    <div id="composer-audience-count" tabIndex={-1} className="space-y-2 rounded-xl border bg-muted/30 px-4 py-3 outline-none">
      <p className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm">
          <span className="text-base font-semibold tabular-nums">{preview.reach.toLocaleString('en-US')} {preview.reach === 1 ? 'guest' : 'guests'}</span>{' '}
          will get this
        </p>
        {state.status === 'loading' && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground motion-reduce:animate-none" aria-label="Updating" />}
        {total > 0 && (
          <button type="button" aria-expanded={isOpen} onClick={() => setOpen((open) => !open)} className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground sm:min-h-0">
            {total.toLocaleString('en-US')} skipped <ChevronDown className={`h-3.5 w-3.5 transition-transform motion-reduce:transition-none ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
        )}
      </div>
      {preview.reach === 0 && (
        <p className="text-sm text-amber-800 dark:text-amber-300">
          No one to text yet. {zeroReachReason(preview.skipped).text}{' '}
          {zeroReachReason(preview.skipped).linksToCustomers && (
            <a href={`/${tenantSlug}/admin/customers`} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">Open Customers</a>
          )}
        </p>
      )}
      {isOpen && (
        <ul className="space-y-1 border-t pt-2 text-sm text-muted-foreground">
          {lines.map((line) => <li key={line}>{line}</li>)}
        </ul>
      )}
      {state.status === 'error' && <p className="text-xs text-muted-foreground" role="alert">Couldn&apos;t update the count. Your draft is safe.</p>}
      <p className="text-xs text-muted-foreground">We check again right before it sends, so the number can change a little.</p>
    </div>
  )
}
