import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { IconTile } from '../status-chip'

interface RuleFieldProps {
  id: string
  label: string
  icon: LucideIcon
  hint?: string
  error?: string | null
  note?: string | null
  children: ReactNode
}

/** One rule: an icon, the label and why it exists, then the control; problems are added in words. */
export function RuleField({ id, label, icon: Icon, hint, error, note, children }: RuleFieldProps) {
  return (
    <div className="flex gap-4 border-b border-wn-line py-5 first:pt-0 last:border-b-0 last:pb-0">
      <IconTile size="sm" className="mt-0.5"><Icon /></IconTile>
      <div className="min-w-0 flex-1 space-y-2.5">
        <div>
          <label htmlFor={id} className="text-[15px] font-semibold tracking-tight">{label}</label>
          {hint && <p id={`${id}-hint`} className="mt-0.5 text-[13px] text-wn-stone">{hint}</p>}
        </div>
        {children}
        {note && <p className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">{note}</p>}
        {error && <p id={`${id}-error`} role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-800">{error}</p>}
      </div>
    </div>
  )
}

export function describedBy(id: string, error: string | null | undefined): string {
  return error ? `${id}-hint ${id}-error` : `${id}-hint`
}
