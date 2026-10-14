'use client'

import { useState } from 'react'
import { CircleAlert, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { AttentionItem } from '@/lib/texts/types'
import { cn } from '@/lib/utils'
import { useTexts } from './texts-context'

const VISIBLE = 3

/** Only what needs fixing; nothing at all when all is well (the hero already says Ready). */
export function NeedsAttentionStrip({ items }: { items: AttentionItem[] }) {
  const { go } = useTexts()
  const [isExpanded, setExpanded] = useState(false)
  if (items.length === 0) return null

  const sorted = [...items].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'urgent' ? -1 : 1))
  const shown = isExpanded ? sorted : sorted.slice(0, VISIBLE)
  const hidden = sorted.length - shown.length

  return (
    <section aria-label="Needs attention" className="space-y-2">
      <ul className="space-y-2">
        {shown.map((item) => {
          const isUrgent = item.severity === 'urgent'
          const Icon = isUrgent ? CircleAlert : TriangleAlert
          return (
            <li
              key={item.id}
              className={cn(
                'flex flex-col gap-2 rounded-xl border border-l-4 bg-card px-4 py-3 text-sm sm:flex-row sm:items-center',
                isUrgent ? 'border-l-destructive' : 'border-l-amber-500'
              )}
            >
              <span className="flex min-w-0 flex-1 items-start gap-2.5">
                <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', isUrgent ? 'text-destructive' : 'text-amber-600')} aria-hidden="true" />
                <span>
                  <span className="sr-only">{isUrgent ? 'Urgent: ' : 'Needs a look: '}</span>
                  {item.text}
                </span>
              </span>
              <Button type="button" size="sm" variant="outline" className="min-h-11 self-start sm:min-h-8 sm:self-auto" onClick={() => go(item.action.href)}>
                {item.action.label}
              </Button>
            </li>
          )
        })}
      </ul>
      {hidden > 0 && (
        <Button type="button" variant="link" size="sm" className="min-h-11 px-0 sm:min-h-8" onClick={() => setExpanded(true)}>
          {hidden} more
        </Button>
      )}
    </section>
  )
}
