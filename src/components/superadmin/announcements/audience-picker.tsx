'use client'

import { useMemo, useState } from 'react'
import { Check, Search, Store, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AudienceTenant } from '@/lib/announcements/service'

interface Props {
  tenants: AudienceTenant[]
  /** null = every store; an array = only those stores. */
  value: string[] | null
  onChange: (value: string[] | null) => void
}

/**
 * Who the post reaches. "Every store" is the default; "Chosen stores" opens a
 * searchable list with select-all/clear so a targeted release (say, a beta for
 * five merchants) is a few clicks, not a scroll through 175 rows.
 */
export function AudiencePicker({ tenants, value, onChange }: Props) {
  const [query, setQuery] = useState('')
  const isEveryone = value === null
  const selected = useMemo(() => new Set(value ?? []), [value])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return tenants
    return tenants.filter((t) => t.name.toLowerCase().includes(needle) || t.slug.toLowerCase().includes(needle))
  }, [tenants, query])

  const toggle = (id: string) => {
    const next = selected.has(id) ? (value ?? []).filter((t) => t !== id) : [...(value ?? []), id]
    onChange(next)
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <ChoiceCard
          icon={Users}
          title="Every store"
          hint={`All ${tenants.length} merchants`}
          isActive={isEveryone}
          onClick={() => onChange(null)}
        />
        <ChoiceCard
          icon={Store}
          title="Chosen stores"
          hint={isEveryone ? 'Pick specific merchants' : `${selected.size} selected`}
          isActive={!isEveryone}
          onClick={() => onChange(value ?? [])}
        />
      </div>

      {isEveryone ? null : (
        <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
            <Search className="h-3.5 w-3.5 text-white/40" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search stores"
              className="w-full bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"
            />
            <button type="button" onClick={() => onChange(visible.map((t) => t.id))} className="shrink-0 text-xs font-medium text-white/60 hover:text-white">
              Select {query ? 'shown' : 'all'}
            </button>
            <span className="text-white/20">·</span>
            <button type="button" onClick={() => onChange([])} className="shrink-0 text-xs font-medium text-white/60 hover:text-white">
              Clear
            </button>
          </div>
          <ul className="max-h-60 divide-y divide-white/5 overflow-y-auto">
            {visible.length === 0 ? (
              <li className="px-3 py-6 text-center text-xs text-white/40">No store matches &ldquo;{query}&rdquo;</li>
            ) : (
              visible.map((tenant) => {
                const isChecked = selected.has(tenant.id)
                return (
                  <li key={tenant.id}>
                    <button
                      type="button"
                      onClick={() => toggle(tenant.id)}
                      className={cn(
                        'flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-white/[0.05]',
                        isChecked ? 'text-white' : 'text-white/70',
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                          isChecked ? 'border-white bg-white text-black' : 'border-white/25',
                        )}
                      >
                        {isChecked ? <Check className="h-3 w-3" /> : null}
                      </span>
                      <span className="truncate">{tenant.name}</span>
                      <span className="ml-auto shrink-0 font-mono text-[11px] text-white/35">{tenant.slug}</span>
                    </button>
                  </li>
                )
              })
            )}
          </ul>
          <div className="border-t border-white/10 px-3 py-2 text-xs text-white/45">
            {selected.size === 0 ? 'Nobody selected yet — pick at least one store.' : `${selected.size} of ${tenants.length} stores will see this.`}
          </div>
        </div>
      )}
    </div>
  )
}

export function ChoiceCard({
  icon: Icon,
  title,
  hint,
  isActive,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  hint: string
  isActive: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className={cn(
        'flex items-center gap-3 rounded-xl border p-3 text-left transition-colors',
        isActive ? 'border-white bg-white text-black' : 'border-white/10 bg-white/[0.02] text-white hover:border-white/25 hover:bg-white/[0.05]',
      )}
    >
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', isActive ? 'bg-black/10' : 'border border-white/10 bg-white/[0.04]')}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <span className={cn('block truncate text-xs', isActive ? 'text-black/60' : 'text-white/45')}>{hint}</span>
      </span>
    </button>
  )
}
