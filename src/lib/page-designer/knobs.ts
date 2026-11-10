// ---------------------------------------------------------------------------
// Block knobs: the design, colour and layout settings every page block can
// offer, built the same way so the inspector shows them the same way.
//
// A knob is a block option (stored in the widget's `content.options`, keyed
// by `key`), so it rides in the page design — no column, no migration. The
// FIRST choice of every design knob is the block as it looked before knobs
// existed, so a stored design without the key renders exactly as before.
// ---------------------------------------------------------------------------

import { LIMITS } from '@/lib/hero-builder/constants'
import { safeMediaUrl } from '@/lib/hero-builder/safe-values'

import type { BlockChoice, BlockOption, BlockOptionValue } from './types'

/** The longest image URL a block may store (options are otherwise short). */
export const BLOCK_IMAGE_URL_MAX = LIMITS.blockOptionChars

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

/** True for a hex colour a block knob may hold (#rgb or #rrggbb). */
export function isKnobColor(value: unknown): value is string {
  return typeof value === 'string' && HEX.test(value)
}

/** Whether `value` is a valid stored value for `option`. */
export function isValidOptionValue(option: BlockOption, value: unknown): value is BlockOptionValue {
  switch (option.type) {
    case 'boolean':
      return typeof value === 'boolean'
    case 'choice':
      return typeof value === 'string' && option.choices.some((c) => c.value === value)
    case 'color':
      return value === '' || isKnobColor(value)
    case 'image':
      return value === '' || (typeof value === 'string' && value.length <= BLOCK_IMAGE_URL_MAX && safeMediaUrl(value) !== null)
  }
}

/** The inspector group an option sits in. */
export function optionGroup(option: BlockOption): NonNullable<BlockOption['group']> {
  if (option.group) return option.group
  if (option.type === 'color') return 'colors'
  if (option.type === 'choice' && option.display === 'gallery') return 'design'
  return 'options'
}

// ── Factories ──────────────────────────────────────────────────────────────

/** The block's design gallery. The first design is the block's original look. */
export function designKnob(choices: readonly BlockChoice[], label = 'Design'): BlockOption {
  return { key: 'variant', label, type: 'choice', display: 'gallery', group: 'design', default: choices[0].value, choices }
}

export function colorKnob(key: `color_${string}`, label: string, follows: string): BlockOption {
  return { key, label, type: 'color', default: '', follows, group: 'colors' }
}

export function choiceKnob(
  key: string,
  label: string,
  choices: readonly BlockChoice[],
  extra: Partial<Pick<Extract<BlockOption, { type: 'choice' }>, 'group' | 'showWhen' | 'hint'>> = {},
): BlockOption {
  return { key, label, type: 'choice', display: 'segmented', default: choices[0].value, choices, group: 'options', ...extra }
}

/** Corner rounding: `auto` keeps the block's own corners. */
export const CORNERS_KNOB: BlockOption = choiceKnob('corners', 'Corners', [
  { value: 'auto', label: 'Standard' },
  { value: 'square', label: 'Square' },
  { value: 'soft', label: 'Soft' },
  { value: 'round', label: 'Round' },
])

export type CornersChoice = 'auto' | 'square' | 'soft' | 'round'

/** Tailwind radius classes per corners choice; `auto` = the caller's own. */
export function cornersClass(choice: unknown, auto: string): string {
  switch (choice) {
    case 'square':
      return 'rounded-none'
    case 'soft':
      return 'rounded-lg'
    case 'round':
      return 'rounded-3xl'
    default:
      return auto
  }
}

