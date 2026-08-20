/**
 * Per-category card template resolution.
 *
 * Categories may override the tenant-wide `card_template` (e.g. a featured
 * "Burgers" row rendered with the storefront card while the rest of the menu
 * keeps the classic card). Unknown or missing values inherit the tenant
 * template, which itself falls back to the platform default.
 */

import { CARD_TEMPLATES, DEFAULT_CARD_TEMPLATE, type CardTemplate } from '@/lib/card-templates'
import type { Category } from '@/types/database'

const KNOWN_TEMPLATE_IDS = new Set<string>(CARD_TEMPLATES.map((t) => t.id))

function asCardTemplate(value: unknown): CardTemplate | null {
  return typeof value === 'string' && KNOWN_TEMPLATE_IDS.has(value)
    ? (value as CardTemplate)
    : null
}

export function resolveCategoryCardTemplate(
  category: Pick<Category, 'card_template'> | null | undefined,
  tenantTemplate: string | null | undefined
): CardTemplate {
  return (
    asCardTemplate(category?.card_template) ??
    asCardTemplate(tenantTemplate) ??
    DEFAULT_CARD_TEMPLATE
  )
}
