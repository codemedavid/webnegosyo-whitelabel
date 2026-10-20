import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface InsightCardProps {
  /** The one-sentence story: "Sales were up 12% on last week, led by Friday dinner." */
  headline: ReactNode
  /** A second, quieter sentence. */
  detail?: ReactNode
  /** A next step: a link or button ("See items", "Ask Owl why"). */
  action?: ReactNode
  className?: string
}

/** The sentence at the top of a report page: insight first, numbers second. */
export function InsightCard({ headline, detail, action, className }: InsightCardProps) {
  return (
    <section
      aria-label="In short"
      className={cn(
        'flex flex-col gap-3 rounded-2xl bg-white p-5 ring-1 ring-border sm:flex-row sm:items-center sm:justify-between sm:gap-6',
        className,
      )}
    >
      <div className="min-w-0">
        <p className="text-[17px] font-extrabold leading-snug tracking-[-0.01em] text-wn-ink text-pretty sm:text-[19px]">
          {headline}
        </p>
        {detail && <p className="mt-1 text-[14px] leading-snug text-muted-foreground text-pretty">{detail}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </section>
  )
}
