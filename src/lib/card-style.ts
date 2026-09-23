/**
 * Card style knobs — merchant controls layered over a card template's design.
 *
 * Each knob is its own nullable `tenants` column rather than one JSONB blob, so
 * the Branding Studio's per-device `mobile_overrides` map (scalar values only)
 * can give any knob a distinct phone value for free.
 *
 * `auto` (or a missing / unknown column) means "use the template's own design".
 * Only the flexible templates (`CardTemplateDefinition.isFlexible`) read these.
 */

export const CARD_IMAGE_RATIOS = ['auto', 'square', 'portrait', 'landscape', 'wide'] as const
export const CARD_IMAGE_FITS = ['auto', 'cover', 'contain'] as const
export const CARD_ADD_BUTTONS = ['auto', 'icon', 'pill', 'bar', 'hidden'] as const
export const CARD_TEXT_ALIGNS = ['auto', 'start', 'center'] as const
export const CARD_DESCRIPTIONS = ['auto', 'show', 'hide'] as const
export const CARD_DENSITIES = ['auto', 'compact', 'comfortable', 'spacious'] as const

type Resolved<T extends readonly string[]> = Exclude<T[number], 'auto'>

/** A fully resolved card style — what a template actually renders. */
export interface CardStyle {
  imageRatio: Resolved<typeof CARD_IMAGE_RATIOS>
  imageFit: Resolved<typeof CARD_IMAGE_FITS>
  addButton: Resolved<typeof CARD_ADD_BUTTONS>
  textAlign: Resolved<typeof CARD_TEXT_ALIGNS>
  description: Resolved<typeof CARD_DESCRIPTIONS>
  density: Resolved<typeof CARD_DENSITIES>
}

/** The merchant's raw choices; `auto` defers to the template. */
export type CardStyleSettings = { [K in keyof CardStyle]: CardStyle[K] | 'auto' }

interface CardStyleField {
  key: keyof CardStyle
  column: string
  label: string
  options: readonly string[]
}

/** Registry of knobs, in the order the Branding Studio shows them. */
export const CARD_STYLE_FIELDS: readonly CardStyleField[] = [
  { key: 'imageRatio', column: 'card_image_ratio', label: 'Image shape', options: CARD_IMAGE_RATIOS },
  { key: 'imageFit', column: 'card_image_fit', label: 'Image fit', options: CARD_IMAGE_FITS },
  { key: 'addButton', column: 'card_add_button', label: 'Add button', options: CARD_ADD_BUTTONS },
  { key: 'textAlign', column: 'card_text_align', label: 'Text alignment', options: CARD_TEXT_ALIGNS },
  { key: 'description', column: 'card_description', label: 'Description', options: CARD_DESCRIPTIONS },
  { key: 'density', column: 'card_density', label: 'Spacing', options: CARD_DENSITIES },
]

export const AUTO_CARD_STYLE: CardStyleSettings = {
  imageRatio: 'auto',
  imageFit: 'auto',
  addButton: 'auto',
  textAlign: 'auto',
  description: 'auto',
  density: 'auto',
}

/** Read the knob columns off a tenant row; anything unrecognised reads as `auto`. */
export function readCardStyleSettings(tenant: Record<string, unknown> | null | undefined): CardStyleSettings {
  if (!tenant) return AUTO_CARD_STYLE
  const entries = CARD_STYLE_FIELDS.map((field) => {
    const value = tenant[field.column]
    const isKnown = typeof value === 'string' && field.options.includes(value)
    return [field.key, isKnown ? value : 'auto'] as const
  })
  return Object.fromEntries(entries) as CardStyleSettings
}

/** Merchant choices over the template's design. Never mutates either input. */
export function resolveCardStyle(settings: CardStyleSettings | undefined, templateDefaults: CardStyle): CardStyle {
  if (!settings) return { ...templateDefaults }
  const pick = <K extends keyof CardStyle>(key: K): CardStyle[K] => {
    const chosen = settings[key]
    return chosen === 'auto' ? templateDefaults[key] : (chosen as CardStyle[K])
  }
  return {
    imageRatio: pick('imageRatio'),
    imageFit: pick('imageFit'),
    addButton: pick('addButton'),
    textAlign: pick('textAlign'),
    description: pick('description'),
    density: pick('density'),
  }
}
