'use client'

/**
 * The two containers the dish editor is built from.
 *
 * `EditorSection` is a plain titled card for what every merchant fills in.
 * `OptionalSection` is one row of the "More options" list: closed by default,
 * with a one-line summary of its current state, so a merchant who never uses
 * pre-orders or recipes never has to read past them — and one who does can
 * see "On" or "Not linked" without opening anything.
 */

import { useId, useState, type ReactNode } from 'react'
import { ChevronDown, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EditorSectionProps {
  /** Anchor for the editor's section navigation. */
  id?: string
  title: string
  description?: string
  /** Short state beside the title, e.g. "3 sizes". */
  meta?: string
  /** Rendered on the heading's right, e.g. an "Add" button. */
  action?: ReactNode
  children: ReactNode
  className?: string
}

/** Clears the sticky mobile header + section chips when jumped to. */
export const SECTION_SCROLL_MARGIN = 'scroll-mt-32 lg:scroll-mt-6'

/**
 * One titled card. Deliberately plain: the heading carries the section, so
 * there is no icon tile competing with it — five identical icon-heading-text
 * cards read as a template, not as a dish.
 */
export function EditorSection({ id, title, description, meta, action, children, className }: EditorSectionProps) {
  const headingId = useId()
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn('rounded-xl border bg-card p-4 sm:p-5', SECTION_SCROLL_MARGIN, className)}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={headingId} className="text-[15px] font-semibold leading-tight">{title}</h2>
            {meta && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">{meta}</span>
            )}
          </div>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
      </div>
      {children}
    </section>
  )
}

export type SummaryTone = 'muted' | 'good' | 'warning'

const SUMMARY_TONE: Record<SummaryTone, string> = {
  muted: 'text-muted-foreground',
  good: 'text-emerald-700 dark:text-emerald-400',
  warning: 'text-amber-700 dark:text-amber-400',
}

interface OptionalSectionProps {
  icon: LucideIcon
  title: string
  /** One line under the title saying what this is for. */
  hint: string
  /** The current state, shown on the closed row ("On", "Not linked"). */
  summary?: string
  summaryTone?: SummaryTone
  defaultOpen?: boolean
  children: ReactNode
}

/**
 * Content mounts on first open and then stays mounted, only hidden: several
 * of these panels fire server reads on mount (recipes, tags), and collapsing
 * must not throw away half-typed input or pay for the read again.
 */
export function OptionalSection({
  icon: Icon,
  title,
  hint,
  summary,
  summaryTone = 'muted',
  defaultOpen = false,
  children,
}: OptionalSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const [wasOpened, setWasOpened] = useState(defaultOpen)
  const panelId = useId()

  const toggle = () => {
    setWasOpened(true)
    setIsOpen((open) => !open)
  }

  return (
    <div className="border-b last:border-b-0">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none sm:px-5"
      >
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{title}</span>
          <span className="block truncate text-xs text-muted-foreground">{hint}</span>
        </span>
        {summary && (
          <span className={cn('shrink-0 text-xs font-medium', SUMMARY_TONE[summaryTone])}>{summary}</span>
        )}
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200', isOpen && 'rotate-180')}
          aria-hidden
        />
      </button>
      {wasOpened && (
        <div id={panelId} hidden={!isOpen} className="space-y-4 px-4 pb-5 pt-1 sm:px-5">
          {children}
        </div>
      )}
    </div>
  )
}

/** The card that holds a stack of `OptionalSection` rows. */
export function OptionalSectionList({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  const headingId = useId()
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn('overflow-hidden rounded-xl border bg-card', SECTION_SCROLL_MARGIN)}
    >
      <h2 id={headingId} className="border-b px-4 py-3.5 text-[15px] font-semibold sm:px-5">{title}</h2>
      {children}
    </section>
  )
}
