'use client'

import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { BoostIdea } from '@/lib/boost/ideas'
import { DishStack } from './dish'
import { BOOST_MOMENTS, listNames, peso, type ItemLookup, type OfferKind } from './boost-model'

interface BoostWelcomeProps {
  ideas: readonly BoostIdea[]
  itemsById: ItemLookup
  canEnable: boolean
  isEnabling: boolean
  onEnable: () => void
}

function exampleFor(kind: OfferKind, ideas: readonly BoostIdea[], itemsById: ItemLookup) {
  const idea = ideas.find((candidate) => candidate.kind === kind)
  if (!idea) return null
  switch (idea.kind) {
    case 'combo':
      return { ids: idea.itemIds, text: `${idea.name} for ${peso(idea.price)}${idea.savings ? ` — saves ${peso(idea.savings.amount)}` : ''}` }
    case 'upgrade':
      return { ids: idea.itemIds, text: `${itemsById.get(idea.sourceId)?.name} → ${itemsById.get(idea.targetId)?.name}, +${peso(idea.priceDifference)}` }
    case 'pairing':
      return { ids: idea.targetIds, text: `After any ${idea.categoryName}: ${listNames(idea.targetIds, itemsById, 2)}` }
    case 'last_call':
      return { ids: idea.itemIds, text: `${listNames(idea.itemIds, itemsById, 2)} in the cart` }
  }
}

/**
 * First run. Instead of explaining upselling in the abstract, it shows the
 * merchant their own dishes at each moment of the customer's order — drafted
 * already, waiting for one tap.
 */
export function BoostWelcome({ ideas, itemsById, canEnable, isEnabling, onEnable }: BoostWelcomeProps) {
  const drafted = ideas.length
  return (
    <section className="grid gap-8 rounded-3xl border bg-card p-6 sm:p-10 lg:grid-cols-[1fr_minmax(0,440px)] lg:items-center lg:gap-14">
      <div className="max-w-xl">
        <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
          Make every order a little bigger.
        </h1>
        <p className="mt-4 text-pretty text-base leading-relaxed text-muted-foreground">
          Boost Sales puts the right offer in front of customers at the moment they are most likely to say yes —
          a combo on the menu, the meal version on the item, a drink right after they add, a quick dessert in the cart.
        </p>
        {drafted > 0 && (
          <p className="mt-3 text-pretty text-base leading-relaxed">
            We already drafted {drafted === 1 ? 'one offer' : `${drafted} offers`} from your menu. Nothing reaches customers until you turn it on.
          </p>
        )}
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button size="lg" onClick={onEnable} disabled={!canEnable || isEnabling} className="h-12 rounded-full px-7 text-base">
            {isEnabling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEnabling ? 'Turning on…' : 'Turn on Boost Sales'}
          </Button>
          {!canEnable && (
            <p className="text-sm text-muted-foreground">Ask the store owner to turn this on.</p>
          )}
        </div>
      </div>

      <ol className="relative space-y-2" aria-label="Where customers will see offers">
        <span aria-hidden="true" className="absolute bottom-8 left-[27px] top-8 w-px bg-border" />
        {BOOST_MOMENTS.map((moment) => {
          const Icon = moment.icon
          const example = exampleFor(moment.kind, ideas, itemsById)
          return (
            <li key={moment.id} className="relative flex items-center gap-4 rounded-2xl p-2">
              <span className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-background">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{moment.place}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {example ? example.text : moment.blurb}
                </p>
              </div>
              {example && <DishStack items={example.ids.map((id) => itemsById.get(id))} size="sm" />}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
