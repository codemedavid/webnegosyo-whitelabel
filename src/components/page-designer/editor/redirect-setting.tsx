'use client'

import { useState, useTransition } from 'react'
import { Loader2, Timer } from 'lucide-react'
import { toast } from 'sonner'

import { saveConfirmationRedirectAction } from '@/app/actions/page-designer'
import { REDIRECT_SECONDS, type ConfirmationRedirect, type ConfirmationRedirectSetting } from '@/lib/page-designer/page-mode'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

const MODES: readonly { mode: ConfirmationRedirect; title: string; body: string }[] = [
  { mode: 'instant', title: 'Skip it', body: 'Go straight to order tracking once the order is saved.' },
  { mode: 'countdown', title: 'Show it, then move on', body: 'Show the thank-you page with a countdown, then open tracking.' },
  { mode: 'stay', title: 'Keep it on screen', body: 'Stay on the thank-you page until the customer taps Track order.' },
]

/**
 * Thank-you page only: what happens after the order is saved. Messenger
 * hand-off, kiosks and orders that didn't go through always stay on the
 * thank-you page — those customers have something to do there.
 */
export function RedirectSetting({ tenantId, initial }: { tenantId: string; initial: ConfirmationRedirectSetting }) {
  const [saved, setSaved] = useState(initial)
  const [draft, setDraft] = useState(initial)
  const [isOpen, setIsOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const isDirty = draft.mode !== saved.mode || (draft.mode === 'countdown' && draft.seconds !== saved.seconds)
  const summary = saved.mode === 'instant' ? 'Skip to tracking' : saved.mode === 'stay' ? 'Stays on screen' : `Tracking after ${saved.seconds}s`

  const save = () =>
    startTransition(async () => {
      const result = await saveConfirmationRedirectAction(tenantId, draft)
      if (!result.success) {
        toast.error(result.error ?? 'Could not save')
        return
      }
      setSaved(draft)
      setIsOpen(false)
      toast.success('Saved — applies to the next order')
    })

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger className="flex h-9 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-100" title="After the order is placed">
        <Timer className="h-4 w-4" />
        <span className="hidden whitespace-nowrap 2xl:inline">{summary}</span>
      </DialogTrigger>
      <DialogContent className="max-w-sm space-y-3 p-5">
        <div>
          <DialogTitle className="text-sm font-semibold text-neutral-900">After the order is placed</DialogTitle>
          <DialogDescription className="text-[11px] leading-snug text-neutral-500">
            Messenger orders, kiosks and orders that didn&apos;t go through always stay on this page.
          </DialogDescription>
        </div>
        <div className="space-y-1.5" role="radiogroup" aria-label="After the order is placed">
          {MODES.map(({ mode, title, body }) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={draft.mode === mode}
              onClick={() => setDraft((d) => ({ ...d, mode }))}
              className={
                draft.mode === mode
                  ? 'w-full rounded-lg border-2 border-neutral-900 bg-neutral-50 px-3 py-2 text-left'
                  : 'w-full rounded-lg border-2 border-neutral-200 px-3 py-2 text-left hover:border-neutral-300'
              }
            >
              <span className="block text-xs font-semibold text-neutral-900">{title}</span>
              <span className="block text-[11px] leading-snug text-neutral-500">{body}</span>
            </button>
          ))}
        </div>
        {draft.mode === 'countdown' && (
          <label className="flex items-center justify-between gap-3 text-xs font-medium text-neutral-700">
            Seconds before tracking opens
            <input
              type="number"
              min={REDIRECT_SECONDS.min}
              max={REDIRECT_SECONDS.max}
              value={draft.seconds}
              onChange={(e) => setDraft((d) => ({ ...d, seconds: Math.round(Number(e.target.value)) || REDIRECT_SECONDS.fallback }))}
              className="h-8 w-20 rounded-md border border-neutral-200 px-2 text-right text-sm"
            />
          </label>
        )}
        <button
          type="button"
          onClick={save}
          disabled={!isDirty || isPending}
          className="flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-neutral-900 text-sm font-semibold text-white disabled:bg-neutral-300"
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />} Save
        </button>
      </DialogContent>
    </Dialog>
  )
}
