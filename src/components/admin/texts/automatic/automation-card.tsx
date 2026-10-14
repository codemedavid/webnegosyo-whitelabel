'use client'

import { Clock3, Gift, HeartHandshake, Hourglass, RotateCcw, Star, TrendingDown, type LucideIcon } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { blockerFix, type AutomationCardModel } from '@/lib/texts/view/automations'
import { sentenceFor, unitFor } from '@/lib/texts/view/automation-editor'
import { cn } from '@/lib/utils'
import { IconTile, StatusDot } from '../status-chip'

const TITLES: Record<string, string> = {
  review_request: 'Review request', win_back: 'We miss you', regulars_gone_quiet: 'Regulars gone quiet',
  first_visit_followup: 'Thank first-timers', loyalty_almost_there: 'Almost there',
  loyalty_reward_waiting: 'Reward waiting', loyalty_reward_expiring: 'Reward expiring',
}

const ICONS: Record<string, LucideIcon> = {
  review_request: Star, win_back: RotateCcw, regulars_gone_quiet: TrendingDown, first_visit_followup: HeartHandshake,
  loyalty_almost_there: Hourglass, loyalty_reward_waiting: Gift, loyalty_reward_expiring: Clock3,
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
  const Icon = ICONS[card.recipe.id] ?? Star
  const tone = card.blocker && card.automation ? 'amber' : card.isOn ? 'emerald' : 'grey'
  return (
    <li className={cn(
      'group flex flex-col rounded-2xl border bg-white shadow-[0_1px_2px_rgba(29,24,21,0.04)] transition-[border-color,box-shadow] duration-200 hover:border-stone-300 hover:shadow-[0_8px_24px_-14px_rgba(29,24,21,0.25)] motion-reduce:transition-none',
      card.isOn ? 'border-emerald-200' : 'border-wn-line'
    )}>
      <div className="flex items-start gap-4 p-5">
        <IconTile tone={card.isOn ? 'emerald' : 'grey'}><Icon /></IconTile>
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="block font-semibold group-hover:underline group-hover:decoration-wn-line group-hover:underline-offset-4">{title}</span>
          <span className="mt-0.5 block text-sm leading-relaxed text-wn-stone">
            {sentence.before}{value !== undefined && <> <strong className="font-semibold text-foreground">{value} {unitFor(value, sentence.unit)}</strong></>}{sentence.after ? ` ${sentence.after}` : ''}
          </span>
        </button>
        <Switch
          checked={card.isOn}
          disabled={isBusy}
          onCheckedChange={onToggle}
          aria-label={`${title}: ${card.isOn ? 'on' : 'off'}`}
          className="mt-1 data-[state=checked]:bg-emerald-600"
        />
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-wn-line px-5 py-3">
        <p className={cn('flex items-center gap-2 text-[13px]', card.isOn ? 'text-foreground' : 'text-wn-stone')}>
          <StatusDot tone={tone} />
          {card.statusLine}
        </p>
        {card.blocker && (
          <Button type="button" size="sm" variant="outline" className="min-h-11 rounded-full bg-white sm:min-h-8" onClick={onFix}>
            {blockerFix(card.blocker).label}
          </Button>
        )}
      </div>
    </li>
  )
}
