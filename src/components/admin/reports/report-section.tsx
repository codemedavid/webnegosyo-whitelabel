import { useId, type ReactNode } from 'react'
import { CircleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ReportSectionProps {
  title: string
  description?: ReactNode
  /** Right side of the header: a link, a toggle. */
  action?: ReactNode
  children?: ReactNode
  /** This card's read failed; the rest of the page still renders. */
  isError?: boolean
  errorMessage?: string
  className?: string
}

const DEFAULT_ERROR = "We couldn't load this part of the report. Refresh the page to try again."

/** The report card shell. Errors stay inside the one card that failed. */
export function ReportSection({
  title,
  description,
  action,
  children,
  isError = false,
  errorMessage,
  className,
}: ReportSectionProps) {
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className={cn('flex flex-col rounded-2xl bg-white ring-1 ring-border', className)}>
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 pb-3 pt-4 sm:px-5">
        <div className="min-w-0">
          <h2 id={titleId} className="text-[15px] font-extrabold tracking-[-0.01em] text-wn-ink">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div className="flex-1 px-4 pb-4 sm:px-5 sm:pb-5">
        {isError ? (
          <div
            data-testid="report-section-error"
            className="flex items-start gap-2.5 rounded-xl bg-red-50 px-3.5 py-3 text-[13.5px] leading-snug text-red-800"
          >
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>{errorMessage ?? DEFAULT_ERROR}</p>
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  )
}
