'use client'

import { useState, useTransition } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { setStartStepTickAction } from '@/app/actions/start-here'

/** "I did it" for a step no data can prove. The page re-reads after it saves. */
export function TickButton({ tenantId, tenantSlug, stepId }: { tenantId: string; tenantSlug: string; stepId: string }) {
  const [isPending, startTransition] = useTransition()
  const [isDone, setIsDone] = useState(false)

  function tick() {
    startTransition(async () => {
      try {
        const result = await setStartStepTickAction(tenantId, tenantSlug, stepId, true)
        if (!result.success) {
          toast.error(result.error)
          return
        }
        setIsDone(true)
      } catch {
        // A rejected action must not reach the error boundary and replace the page.
        toast.error('Could not save. Check your connection and try again.')
      }
    })
  }

  return (
    <button
      type="button"
      onClick={tick}
      disabled={isPending || isDone}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border-2 border-wn-line bg-white px-3.5 text-[13px] font-bold text-wn-ink transition-[transform,box-shadow] [box-shadow:0_3px_0_var(--color-wn-line)] hover:bg-wn-sand active:translate-y-[2px] active:[box-shadow:0_1px_0_var(--color-wn-line)] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wn-coral focus-visible:ring-offset-2"
    >
      {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />}
      I did it
    </button>
  )
}
