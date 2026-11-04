'use client'

import { useId, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export interface CashBranchSelectProps {
  value: string | null
  options: Array<{ value: string; label: string }>
  /** href for each choice ('' = every branch), built on the server. */
  hrefs: Record<string, string>
}

const ALL = ''

/** Every branch, or one. Navigates (the page reads on the server). */
export function CashBranchSelect({ value, options, hrefs }: CashBranchSelectProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const id = useId()
  return (
    <div className="flex items-center">
      <label htmlFor={id} className="sr-only">
        Branch
      </label>
      <select
        id={id}
        value={value ?? ALL}
        disabled={isPending}
        onChange={(event) => {
          const href = hrefs[event.target.value]
          if (href) startTransition(() => router.push(href))
        }}
        className="min-h-11 rounded-full bg-white px-4 pr-9 text-[14px] font-bold text-wn-ink ring-1 ring-border outline-none hover:ring-wn-ink focus-visible:ring-2 focus-visible:ring-wn-ink disabled:opacity-60"
      >
        <option value={ALL}>All branches</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}
