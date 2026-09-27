'use client'

import { useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { BoostIdea } from '@/lib/boost/ideas'
import { DishStack } from './dish'
import { MOMENT_BY_KIND, listNames, peso, type ItemLookup } from './boost-model'

const INITIAL_SHOWN = 3

interface BoostIdeasProps {
  ideas: readonly BoostIdea[]
  itemsById: ItemLookup
  historyOrders: number | null
  busyId: string | null
  onActivate: (idea: BoostIdea) => void
  onEdit: (idea: BoostIdea) => void
  onDismiss: (idea: BoostIdea) => void
}

function describe(idea: BoostIdea, itemsById: ItemLookup): { title: string; detail: string } {
  switch (idea.kind) {
    case 'combo':
      return {
        title: idea.name,
        detail: [
          idea.picks
            .map((pick) => (pick.itemIds.length > 1
              ? `any ${pick.count ?? 1} ${pick.label.toLowerCase()}`
              : itemsById.get(pick.itemIds[0])?.name ?? pick.label))
            .join(' + '),
          `${peso(idea.price)}${idea.savings ? `, saves ${peso(idea.savings.amount)}` : ''}`,
        ].join(' · '),
      }
    case 'upgrade':
      return {
        title: `${itemsById.get(idea.sourceId)?.name} → ${itemsById.get(idea.targetId)?.name}`,
        detail: `“${idea.header}” · +${peso(idea.priceDifference)} each time`,
      }
    case 'pairing':
      return {
        title: `After any ${idea.categoryName}`,
        detail: `Suggest ${listNames(idea.targetIds, itemsById)}`,
      }
    case 'last_call':
      return { title: 'Quick add-ons in the cart', detail: 'Picked for each cart automatically' }
  }
}

/**
 * "Ready to go" — offers drafted from the merchant's own menu and orders, each
 * one tap from live. The fastest path from an empty page to a working upsell,
 * and the answer to "I don't know what to set up".
 */
export function BoostIdeas({ ideas, itemsById, historyOrders, busyId, onActivate, onEdit, onDismiss }: BoostIdeasProps) {
  const [isExpanded, setExpanded] = useState(false)
  if (ideas.length === 0) return null
  const shown = isExpanded ? ideas : ideas.slice(0, INITIAL_SHOWN)
  const source = historyOrders && historyOrders > 0
    ? `Drafted from your menu and your last ${historyOrders.toLocaleString('en-PH')} orders.`
    : 'Drafted from your menu.'

  return (
    <section aria-labelledby="boost-ideas-title">
      <div className="mb-3">
        <h2 id="boost-ideas-title" className="text-base font-semibold">Ready to go</h2>
        <p className="text-sm text-muted-foreground">{source} Turn one on now — you can change it any time.</p>
      </div>
      <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 md:pb-0 xl:grid-cols-3 [scrollbar-width:none]">
        {shown.map((idea) => {
          const { title, detail } = describe(idea, itemsById)
          const moment = MOMENT_BY_KIND[idea.kind]
          const Icon = moment.icon
          const isBusy = busyId === idea.id
          return (
            <li
              key={idea.id}
              className="relative flex w-[85%] shrink-0 snap-start flex-col rounded-2xl border bg-card p-4 md:w-auto"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <DishStack items={idea.itemIds.map((id) => itemsById.get(id))} size="md" />
                  <span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span className="truncate">{moment.offer}</span>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onDismiss(idea)}
                  className="-mr-1 -mt-1 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={`Not now: ${title}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <h3 className="mt-3 line-clamp-2 text-[15px] font-semibold leading-snug">{title}</h3>
              <p className="mt-1 line-clamp-2 text-sm text-foreground/80">{detail}</p>
              <p className="mt-2 line-clamp-2 flex-1 text-xs text-muted-foreground">{idea.reason}</p>
              <div className="mt-4 flex gap-2">
                <Button type="button" size="sm" onClick={() => onActivate(idea)} disabled={busyId !== null} className="flex-1">
                  {isBusy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  {isBusy ? 'Turning on…' : 'Turn on'}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => onEdit(idea)} disabled={busyId !== null}>
                  Edit first
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
      {ideas.length > INITIAL_SHOWN && (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          className="mt-3 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {isExpanded ? 'Show fewer ideas' : `Show ${ideas.length - INITIAL_SHOWN} more ideas`}
        </button>
      )}
    </section>
  )
}
