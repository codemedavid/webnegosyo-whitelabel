'use client'

import { useState } from 'react'
import { CircleAlert, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { AttentionItem } from '@/lib/texts/types'
import { IconTile } from './status-chip'
import { useTexts } from './texts-context'

const VISIBLE = 3

/** Only what needs fixing, as one quiet card; nothing at all when all is well. */
export function NeedsAttentionStrip({ items }: { items: AttentionItem[] }) {
  const { go } = useTexts()
  const [isExpanded, setExpanded] = useState(false)
  if (items.length === 0) return null

  const sorted = [...items].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'urgent' ? -1 : 1))
  const shown = isExpanded ? sorted : sorted.slice(0, VISIBLE)
  const hidden = sorted.length - shown.length

  return (
    <section aria-label="Needs attention" className="overflow-hidden rounded-2xl border bg-card shadow-[0_1px_2px_rgba(29,24,21,0.04)]">
      <ul className="divide-y divide-wn-line">
        {shown.map((item) => {
          const isUrgent = item.severity === 'urgent'
          const Icon = isUrgent ? CircleAlert : TriangleAlert
          return (
            <li key={item.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <span className="flex min-w-0 flex-1 items-center gap-3">
                <IconTile tone={isUrgent ? 'red' : 'amber'} size="sm"><Icon /></IconTile>
                <span className="text-sm">
                  <span className="sr-only">{isUrgent ? 'Urgent: ' : 'Needs a look: '}</span>
                  {item.text}
                </span>
              </span>
              <Button type="button" size="sm" variant="outline" className="min-h-11 shrink-0 rounded-full bg-white px-4 sm:min-h-8" onClick={() => go(item.action.href)}>
                {item.action.label}
              </Button>
            </li>
          )
        })}
      </ul>
      {hidden > 0 && (
        <Button type="button" variant="ghost" size="sm" className="min-h-11 w-full rounded-none border-t border-wn-line text-wn-stone sm:min-h-9" onClick={() => setExpanded(true)}>
          {hidden} more
        </Button>
      )}
    </section>
  )
}
