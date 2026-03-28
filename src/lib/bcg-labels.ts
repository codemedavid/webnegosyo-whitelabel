import type { BcgClassification } from '@/types/database'

/**
 * Maps internal BCG classifications to merchant-friendly labels.
 * The BCG engine runs under the hood — merchants never see jargon.
 */

export const BCG_MERCHANT_LABELS: Record<string, { label: string; description: string; color: string }> = {
  star: {
    label: 'Best Seller',
    description: 'High popularity, high profit — your top performers',
    color: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  plowhorse: {
    label: 'Popular',
    description: 'Customers love these — good for driving traffic',
    color: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  puzzle: {
    label: 'Hidden Gem',
    description: 'High profit potential — needs more visibility',
    color: 'bg-purple-100 text-purple-800 border-purple-200',
  },
  dog: {
    label: 'Slow Mover',
    description: 'Low popularity, low profit — consider promoting or removing',
    color: 'bg-red-100 text-red-800 border-red-200',
  },
  unclassified: {
    label: 'New',
    description: 'Not yet classified — needs more sales data',
    color: 'bg-gray-100 text-gray-800 border-gray-200',
  },
}

export const STRATEGY_MERCHANT_LABELS: Record<string, { label: string; description: string; color: string }> = {
  plowhorse_to_star: {
    label: 'Boost your margins',
    description: 'These popular items could pull in higher-profit add-ons',
    color: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  star_to_star: {
    label: 'Maximize order value',
    description: 'Your best sellers paired together',
    color: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  puzzle_to_plowhorse: {
    label: 'Get hidden gems noticed',
    description: 'Pair underrated items with your bestsellers to give them exposure',
    color: 'bg-purple-100 text-purple-800 border-purple-200',
  },
}

export function getBcgLabel(classification?: BcgClassification | string): string {
  if (!classification) return BCG_MERCHANT_LABELS.unclassified.label
  return BCG_MERCHANT_LABELS[classification]?.label ?? BCG_MERCHANT_LABELS.unclassified.label
}

export function getBcgDescription(classification?: BcgClassification | string): string {
  if (!classification) return BCG_MERCHANT_LABELS.unclassified.description
  return BCG_MERCHANT_LABELS[classification]?.description ?? BCG_MERCHANT_LABELS.unclassified.description
}

export function getBcgColor(classification?: BcgClassification | string): string {
  if (!classification) return BCG_MERCHANT_LABELS.unclassified.color
  return BCG_MERCHANT_LABELS[classification]?.color ?? BCG_MERCHANT_LABELS.unclassified.color
}

export function getStrategyLabel(strategy: string): string {
  return STRATEGY_MERCHANT_LABELS[strategy]?.label ?? strategy
}

export function getStrategyDescription(strategy: string): string {
  return STRATEGY_MERCHANT_LABELS[strategy]?.description ?? strategy
}

export function getStrategyColor(strategy: string): string {
  return STRATEGY_MERCHANT_LABELS[strategy]?.color ?? 'bg-gray-100 text-gray-800 border-gray-200'
}
