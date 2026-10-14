import type { ReactNode } from 'react'

interface ComposerSectionProps {
  id: string
  step: number
  title: string
  action?: ReactNode
  children: ReactNode
}

/** "1 Who gets it" — a numbered part of the one scrolling form. */
export function ComposerSection({ id, step, title, action, children }: ComposerSectionProps) {
  return (
    <section aria-labelledby={`${id}-title`} id={id} tabIndex={-1} className="scroll-mt-4 space-y-4 outline-none">
      <div className="flex items-center justify-between gap-3">
        <h3 id={`${id}-title`} className="flex items-center gap-2.5 text-sm font-semibold">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-xs text-background" aria-hidden="true">{step}</span>
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  )
}
