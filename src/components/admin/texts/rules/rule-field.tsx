import type { ReactNode } from 'react'

interface RuleFieldProps {
  id: string
  label: string
  hint?: string
  error?: string | null
  note?: string | null
  children: ReactNode
}

/** One rule: label, control, hint; an error replaces nothing, it is added in words. */
export function RuleField({ id, label, hint, error, note, children }: RuleFieldProps) {
  return (
    <div className="space-y-2 border-b py-5 first:pt-0 last:border-b-0 last:pb-0">
      <label htmlFor={id} className="text-sm font-semibold">{label}</label>
      {children}
      {hint && <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>}
      {note && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">{note}</p>}
      {error && <p id={`${id}-error`} role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
    </div>
  )
}

export function describedBy(id: string, error: string | null | undefined): string {
  return error ? `${id}-hint ${id}-error` : `${id}-hint`
}
