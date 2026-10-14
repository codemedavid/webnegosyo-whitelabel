'use client'

import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { blockerFix, type AutomationCardModel } from '@/lib/texts/view/automations'
import { sentenceFor, unitFor } from '@/lib/texts/view/automation-editor'
import { cn } from '@/lib/utils'
import { StatusDot } from '../status-chip'

const TITLES: Record<string, string> = {
  review_request: 'Review request', win_back: 'We miss you', regulars_gone_quiet: 'Regulars gone quiet',
  first_visit_followup: 'Thank first-timers', loyalty_almost_there: 'Almost there',
  loyalty_reward_waiting: 'Reward waiting', loyalty_reward_expiring: 'Reward expiring',
}

export function recipeTitle(recipe: string, fallback: string): string {
  return TITLES[recipe] ?? fallback
}

interface AutomationCardProps {
  card: AutomationCardModel
  isBusy: boolean
  onOpen: () => void
  onToggle: (isOn: boolean) => void
  onFix: () => void
}

/** A sentence with its switch, and what it actually did. */
export function AutomationCard({ card, isBusy, onOpen, onToggle, onFix }: AutomationCardProps) {
  const sentence = sentenceFor(card.recipe.id)
  const params = (card.automation?.params ?? card.recipe.defaults) as Record<string, number | undefined>
  const value = params[sentence.knob]
  const title = recipeTitle(card.recipe.id, card.recipe.title)
  return (
    <li className="flex flex-col gap-3 rounded-2xl border bg-card p-5">
      <div className="flex items-start gap-3">
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="block font-semibold">{title}</span>
          <span className="block text-sm text-muted-foreground">
            {sentence.before}{value !== undefined && <> <strong className="font-semibold text-foreground">{value} {unitFor(value, sentence.unit)}</strong></>}{sentence.after ? ` ${sentence.after}` : ''}
          </span>
        </button>
        <Switch
          checked={card.isOn}
          disabled={isBusy}
          onCheckedChange={onToggle}
          aria-label={`${title}: ${card.isOn ? 'on' : 'off'}`}
          className="mt-1"
        />
      </div>
      <p className={cn('flex items-center gap-2 text-sm', card.isOn ? 'text-foreground' : 'text-muted-foreground')}>
        <StatusDot tone={card.blocker && card.automation ? 'amber' : card.isOn ? 'emerald' : 'grey'} />
        {card.statusLine}
      </p>
      {card.blocker && (
        <Button type="button" size="sm" variant="outline" className="min-h-11 self-start sm:min-h-8" onClick={onFix}>
          {blockerFix(card.blocker).label}
        </Button>
      )}
    </li>
  )
}
