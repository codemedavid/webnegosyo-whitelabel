'use client'

import { useRouter } from 'next/navigation'
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

  return (
    <div className="space-y-4">
      {isNoneOn && (
        <p className="rounded-2xl border bg-muted/40 px-4 py-3 text-sm">None on yet. Most stores start with Review request and We miss you.</p>
      )}
      <ul className="grid gap-3 md:grid-cols-2">
        {cards.map((card) => (
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
      {flow.dialogs}
    </div>
  )
}
