// Reading a checkout block's design settings. The renderer already turns an
// invalid stored value into the option's default; these readers re-check
// against the component's own list, so a view can never be handed a value it
// has no design for.

import type { PageBlockRenderProps } from '@/components/hero-builder/renderer/page-runtime'
import { choiceOr } from '@/lib/page-designer/checkout-block-options'
import type { CornersChoice } from '@/lib/page-designer/knobs'

const CORNERS: readonly { value: CornersChoice }[] = [{ value: 'auto' }, { value: 'square' }, { value: 'soft' }, { value: 'round' }]

/** The block's value for a choice option, or the first (standard) choice. */
export function blockChoice<T extends string>(block: PageBlockRenderProps, key: string, choices: readonly { value: T }[]): T {
  return choiceOr(choices, block.option(key))
}

export function cornersOf(block: PageBlockRenderProps): CornersChoice {
  return blockChoice(block, 'corners', CORNERS)
}

/** A switch that defaults to on (missing = on). */
export function isOn(block: PageBlockRenderProps, key: string): boolean {
  return block.option(key) !== false
}
