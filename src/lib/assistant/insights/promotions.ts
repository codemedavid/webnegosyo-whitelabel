/**
 * Promotion ideas grounded in the store's own numbers. Pure: the tool gathers
 * the facts, this decides which plays fit and prices each with break-even, so
 * the model explains and chooses rather than inventing offers.
 */

import { computeBreakeven, type BreakevenLine, type CostedItem } from '@/lib/assistant/insights/breakeven'

export const PROMO_GOALS = ['fill_quiet_times', 'move_slow_dishes', 'win_back', 'raise_order_value'] as const
export type PromoGoal = (typeof PROMO_GOALS)[number]

export interface PromoFacts {
  bestSeller: CostedItem | null
  slowDishes: CostedItem[]
  quietestHour: string | null
  quietestDay: string | null
  avgOrderValue: number | null
  slippingRegulars: number | null
}

export interface PromoIdea {
  title: string
  why: string
  mechanic: string
  breakeven: BreakevenLine | null
  /** A follow-up the owner can tap to act on it. */
  nextPrompt: string
}

const HAPPY_HOUR_PCT = 10
const WIN_BACK_PCT = 10
const COMBO_DISCOUNT = 0.1

function roundPeso(value: number, step = 10): number {
  return Math.max(step, Math.round(value / step) * step)
}

function charm(value: number): number {
  return Math.max(9, Math.floor(value / 10) * 10 - 1)
}

export function buildPromoIdeas(goal: PromoGoal, facts: PromoFacts): PromoIdea[] {
  const ideas: PromoIdea[] = []
  const best = facts.bestSeller

  if (goal === 'fill_quiet_times' && best && (facts.quietestHour || facts.quietestDay)) {
    const when = [facts.quietestDay, facts.quietestHour ? `around ${facts.quietestHour}` : null].filter(Boolean).join(' ')
    ideas.push({
      title: `Quiet-time ${HAPPY_HOUR_PCT}% off ${best.name}`,
      why: `Your quietest time is ${when}; ${best.name} is what people already come for.`,
      mechanic: `${HAPPY_HOUR_PCT}% off ${best.name} only during that window`,
      breakeven: computeBreakeven([best], { kind: 'percent_off', value: HAPPY_HOUR_PCT })[0] ?? null,
      nextPrompt: `Create a ${HAPPY_HOUR_PCT}% voucher for ${best.name} for my quiet hours.`,
    })
  }

  if (goal === 'move_slow_dishes' && best) {
    for (const slow of facts.slowDishes.slice(0, 2)) {
      const comboPrice = charm((best.price + slow.price) * (1 - COMBO_DISCOUNT))
      ideas.push({
        title: `${best.name} + ${slow.name} combo`,
        why: `${slow.name} rarely sells alone; riding along with your best seller gets it tasted.`,
        mechanic: `Combo at ₱${comboPrice} (regular ₱${best.price + slow.price})`,
        breakeven: computeBreakeven([best, slow], { kind: 'combo_price', value: comboPrice })[0] ?? null,
        nextPrompt: `Make a combo of ${best.name} and ${slow.name} at ₱${comboPrice}.`,
      })
    }
  }

  if (goal === 'win_back' && facts.avgOrderValue) {
    const minSpend = roundPeso(facts.avgOrderValue, 50)
    const typicalOrder: CostedItem = { name: 'a typical order', price: facts.avgOrderValue, unitCost: null }
    ideas.push({
      title: `Come-back ${WIN_BACK_PCT}% off (min ₱${minSpend})`,
      why: facts.slippingRegulars
        ? `${facts.slippingRegulars} regulars have gone quiet; a reason to return beats a reminder.`
        : 'A reason to return beats a reminder.',
      mechanic: `${WIN_BACK_PCT}% off orders of ₱${minSpend}+, texted to quiet regulars as an SMS draft`,
      breakeven: computeBreakeven([typicalOrder], { kind: 'percent_off', value: WIN_BACK_PCT })[0] ?? null,
      nextPrompt: `Draft an SMS to win back my slipping regulars with a ${WIN_BACK_PCT}% voucher.`,
    })
  }

  if (goal === 'raise_order_value' && facts.avgOrderValue) {
    const threshold = roundPeso(facts.avgOrderValue * 1.25, 50)
    ideas.push({
      title: `Free delivery over ₱${threshold}`,
      why: `Your average order is ₱${Math.round(facts.avgOrderValue)}; a goal just above it nudges one more item.`,
      mechanic: `Free delivery on orders of ₱${threshold}+`,
      breakeven: null,
      nextPrompt: `Create a free-delivery voucher for orders over ₱${threshold}.`,
    })
    if (best) {
      ideas.push({
        title: 'Upgrade and add-on offers',
        why: 'Offering a bigger size or a side at the moment of ordering raises the bill without a discount.',
        mechanic: 'Boost Sales upgrades / pairings',
        breakeven: null,
        nextPrompt: 'Give me upgrade and pairing ideas.',
      })
    }
  }

  return ideas
}
