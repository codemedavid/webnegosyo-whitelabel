import { Check } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface ComposerSectionProps {
  id: string
  step: number
  title: string
  /** Shown as a check on the rail once this part is complete. */
  isDone?: boolean
  isLast?: boolean
  action?: ReactNode
  children: ReactNode
}

/** "1 Who gets it" — one numbered part of the form, on a rail that ticks off as it completes. */
export function ComposerSection({ id, step, title, isDone = false, isLast = false, action, children }: ComposerSectionProps) {
  return (
    <section aria-labelledby={`${id}-title`} id={id} tabIndex={-1} className="relative scroll-mt-4 outline-none sm:pl-11">
      <span
        aria-hidden="true"
        className={cn(
          'absolute left-0 top-0 flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors duration-200 motion-reduce:transition-none',
          isDone ? 'bg-emerald-600 text-white' : 'bg-wn-ink text-white'
        )}
      >
        {isDone ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : step}
      </span>
      {!isLast && <span aria-hidden="true" className="absolute bottom-[-2.5rem] left-[13px] top-9 hidden w-px bg-wn-line sm:block" />}
      <div className="space-y-4">
        <div className="flex min-h-7 items-center justify-between gap-3 pl-10 sm:pl-0">
          <h3 id={`${id}-title`} className="text-[15px] font-semibold tracking-tight">
            {title}
            {isDone && <span className="sr-only"> (done)</span>}
          </h3>
          {action}
        </div>
        {children}
      </div>
    </section>
  )
}
