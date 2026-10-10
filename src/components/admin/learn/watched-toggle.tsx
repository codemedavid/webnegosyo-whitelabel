'use client'

import { useState, useTransition } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { setLessonWatchedAction } from '@/app/actions/learn'

interface WatchedToggleProps {
  tenantId: string
  tenantSlug: string
  courseSlug: string
  lessonSlug: string
  isWatched: boolean
}

/** "Mark as watched": counts toward Start here on every device. */
export function WatchedToggle({ tenantId, tenantSlug, courseSlug, lessonSlug, isWatched: initial }: WatchedToggleProps) {
  const [isWatched, setIsWatched] = useState(initial)
  const [isPending, startTransition] = useTransition()

  function toggle() {
    const next = !isWatched
    startTransition(async () => {
      try {
        const result = await setLessonWatchedAction(tenantId, tenantSlug, courseSlug, lessonSlug, next)
        if (!result.success) {
          toast.error(result.error)
          return
        }
        setIsWatched(next)
        if (next) toast.success('Marked as watched')
      } catch {
        // A rejected action must not reach the error boundary and replace the page.
        toast.error('Could not save. Check your connection and try again.')
      }
    })
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={isPending}
      aria-pressed={isWatched}
      className={
        isWatched
          ? 'inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-wn-line bg-white px-4 text-[14px] font-bold text-wn-ink hover:bg-wn-sand disabled:opacity-60'
          : 'inline-flex min-h-11 items-center gap-2 rounded-xl bg-wn-coral px-4 text-[14px] font-bold text-white transition-[transform,box-shadow] [box-shadow:0_3px_0_var(--color-wn-coral-deep)] active:translate-y-[2px] active:[box-shadow:0_1px_0_var(--color-wn-coral-deep)] disabled:opacity-60'
      }
    >
      {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" strokeWidth={3} aria-hidden />}
      {isWatched ? 'Watched' : 'Mark as watched'}
    </button>
  )
}
