'use client'

import { useRouter } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { automationCards } from '@/lib/texts/view/automations'
import { useTexts } from '../texts-context'
import { AutomationCard } from './automation-card'
import { useAutomationSwitch } from './use-automation-switch'

/** Every automatic text as a card with its switch; the ones that are on come first. */
export function AutomaticTab() {
  const { automations, setUrl, tenantSlug } = useTexts()
  const router = useRouter()
  const flow = useAutomationSwitch()
  const cards = automationCards(automations)
  const isNoneOn = !cards.some((card) => card.isOn)
  const groups = [
    { title: 'Running', cards: cards.filter((card) => card.isOn) },
    { title: 'Ready to set up', cards: cards.filter((card) => !card.isOn) },
  ]

  return (
    <div className="space-y-6">
      {isNoneOn && (
        <p className="flex items-center gap-3 rounded-2xl border border-wn-line bg-gradient-to-r from-wn-coral-wash/70 to-white px-4 py-3.5 text-sm">
          <Sparkles className="h-4 w-4 shrink-0 text-wn-coral-deep" aria-hidden="true" />
          None on yet. Most stores start with Review request and We miss you.
        </p>
      )}
      {groups.map((group) => group.cards.length > 0 && (
        <section key={group.title} aria-label={group.title} className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wide text-wn-stone">{group.title} · {group.cards.length}</h2>
          <ul className="grid gap-3 md:grid-cols-2">
            {group.cards.map((card) => (
              <AutomationCard
                key={card.recipe.id}
                card={card}
                isBusy={card.automation !== null && flow.busyId === card.automation.id}
                onOpen={() => setUrl({ automatic: card.recipe.id })}
                onToggle={(isOn) => {
                  if (!card.automation) return setUrl({ automatic: card.recipe.id })
                  if (isOn) flow.turnOn(card.automation)
                  else flow.turnOff(card.automation)
                }}
                onFix={() => {
                  if (card.blocker?.kind === 'review_link') setUrl({ tab: 'rules', focus: 'review_link' })
                  else router.push(`/${tenantSlug}/admin/loyalty`)
                }}
              />
            ))}
          </ul>
        </section>
      ))}
      {flow.dialogs}
    </div>
  )
}
