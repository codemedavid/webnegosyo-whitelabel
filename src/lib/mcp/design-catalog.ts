/**
 * The storefront design catalog an AI designer reads before choosing a look:
 * every card template and page layout with what it looks like, plus the
 * card-style knobs the flexible templates respond to.
 *
 * `get_branding` already lists the bare ids under `options`; ids alone don't
 * tell a model that "menuboard" is a text-first café row or that the knobs do
 * nothing on a fixed template. Everything here is derived from the template
 * registries, so a new or retired design reaches the MCP without an edit.
 */

import { CARD_TEMPLATES, CARD_TEMPLATE_IDS } from '@/lib/card-templates'
import { PAGE_LAYOUTS, PAGE_LAYOUT_IDS } from '@/lib/page-layouts'
import { CARD_STYLE_FIELDS } from '@/lib/card-style'

export interface CardTemplateEntry {
  id: string
  name: string
  description: string
  features: readonly string[]
  /** Responds to the card-style knobs. */
  flexible: boolean
}

export interface PageLayoutEntry {
  id: string
  name: string
  description: string
  features: readonly string[]
}

export interface CardStyleKnobEntry {
  field: string
  label: string
  options: readonly string[]
}

export interface DesignCatalog {
  cardTemplates: CardTemplateEntry[]
  pageLayouts: PageLayoutEntry[]
  cardStyleKnobs: CardStyleKnobEntry[]
  notes: string[]
}

/** Retired ids a client may still send, mapped to the design that replaced them. */
const RETIRED_CARD_TEMPLATES: Readonly<Record<string, string>> = { compact: 'menuboard' }

const FLEXIBLE_NAMES = CARD_TEMPLATES.filter((t) => t.isFlexible).map((t) => t.name).join(', ')

export function describeDesignCatalog(): DesignCatalog {
  return {
    cardTemplates: CARD_TEMPLATES.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      features: t.features,
      flexible: t.isFlexible === true,
    })),
    pageLayouts: PAGE_LAYOUTS.map((l) => ({
      id: l.id,
      name: l.name,
      description: l.description,
      features: l.features,
    })),
    cardStyleKnobs: CARD_STYLE_FIELDS.map((k) => ({ field: k.column, label: k.label, options: k.options })),
    notes: [
      `The card-style knobs (card_image_ratio, card_image_fit, card_add_button, card_text_align, card_description, card_density) only change the flexible templates: ${FLEXIBLE_NAMES}. "auto" keeps the template's own design.`,
      'card_template and page_layout apply to every device; mobile_card_template / mobile_page_layout (or the same keys inside mobile_overrides) give phones a different choice.',
      'A category can use its own card template via update_category card_template (null inherits the store template).',
    ],
  }
}

const CARD_IDS: ReadonlySet<string> = new Set(CARD_TEMPLATE_IDS)
const LAYOUT_IDS: ReadonlySet<string> = new Set(PAGE_LAYOUT_IDS)

interface DesignField {
  path: string
  value: unknown
  known: ReadonlySet<string>
  allowed: readonly string[]
}

function designFieldsOf(patch: Record<string, unknown>): DesignField[] {
  const overrides = (patch.mobile_overrides ?? {}) as Record<string, unknown>
  const card = (path: string, value: unknown): DesignField => ({ path, value, known: CARD_IDS, allowed: CARD_TEMPLATE_IDS })
  const layout = (path: string, value: unknown): DesignField => ({ path, value, known: LAYOUT_IDS, allowed: PAGE_LAYOUT_IDS })
  return [
    card('card_template', patch.card_template),
    card('mobile_card_template', patch.mobile_card_template),
    card('mobile_overrides.card_template', overrides.card_template),
    layout('page_layout', patch.page_layout),
    layout('mobile_page_layout', patch.mobile_page_layout),
    layout('mobile_overrides.page_layout', overrides.page_layout),
  ]
}

function refusalFor(field: DesignField): string {
  const value = String(field.value)
  const replacement = field.known === CARD_IDS ? RETIRED_CARD_TEMPLATES[value] : undefined
  const hint = replacement ? ` "${value}" was retired; use "${replacement}" instead.` : ''
  return `Unknown ${field.path} "${value}".${hint} Allowed: ${field.allowed.join(', ')}.`
}

/**
 * Refuse a branding patch that names a card template or page layout the
 * storefront can't render. The writer types these columns as plain strings, and
 * an unknown value would save and then silently render as the default design.
 * Absent and null values pass (null clears a phone-only choice).
 */
export function assertKnownDesignIds(patch: Record<string, unknown>): void {
  const unknown = designFieldsOf(patch).filter(
    (f) => typeof f.value === 'string' && !f.known.has(f.value)
  )
  if (unknown.length > 0) {
    throw new Error(unknown.map(refusalFor).join(' '))
  }
}
