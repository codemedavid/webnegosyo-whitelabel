/**
 * The dish editor's header: a back arrow to the menu and the dish's name.
 * Replaces breadcrumbs + a large title + a subtitle that restated the title.
 */

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

interface EditorPageHeaderProps {
  backHref: string
  title: string
  /** Short state beside the title, e.g. "Out of stock". */
  status?: string
}

export function EditorPageHeader({ backHref, title, status }: EditorPageHeaderProps) {
  return (
    <div className="mx-auto flex max-w-6xl items-center gap-3">
      <Link
        href={backHref}
        aria-label="Back to menu"
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="h-5 w-5" />
      </Link>
      <h1 className="min-w-0 truncate text-xl font-bold sm:text-2xl">{title}</h1>
      {status && (
        <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
          {status}
        </span>
      )}
    </div>
  )
}
