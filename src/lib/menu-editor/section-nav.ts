/**
 * The dish editor's section list, in page order, each with a short state so an
 * owner can see what is left without scrolling ("2 to fill", "Out of stock").
 */

import { DISH_SECTION_IDS } from '@/components/admin/menu-editor/dish-sections'

export interface JumpNavEntry {
  id: string
  label: string
  /** Short state, e.g. "3 sizes" or "2 to fill". */
  status?: string
  isAttention?: boolean
}

export interface SectionNavInput {
  missingDetailCount: number
  isAvailable: boolean
  /** Stores on the unified editor have one "Sizes & add-ons" section. */
  hasUnifiedOptions: boolean
  choiceStatus?: string
  addonCount: number
  optionGroupCount: number
}

const countStatus = (count: number) => (count > 0 ? String(count) : undefined)

export function buildSectionNav(input: SectionNavInput): JumpNavEntry[] {
  const details: JumpNavEntry = input.missingDetailCount > 0
    ? { id: DISH_SECTION_IDS.details, label: 'Details', status: `${input.missingDetailCount} to fill`, isAttention: true }
    : { id: DISH_SECTION_IDS.details, label: 'Details' }
  const availability: JumpNavEntry = input.isAvailable
    ? { id: DISH_SECTION_IDS.availability, label: 'Availability' }
    : { id: DISH_SECTION_IDS.availability, label: 'Availability', status: 'Out of stock', isAttention: true }
  const options: JumpNavEntry[] = input.hasUnifiedOptions
    ? [{ id: DISH_SECTION_IDS.choices, label: 'Sizes & add-ons', status: countStatus(input.optionGroupCount) }]
    : [
        { id: DISH_SECTION_IDS.choices, label: 'Sizes & choices', status: input.choiceStatus },
        { id: DISH_SECTION_IDS.addons, label: 'Add-ons', status: countStatus(input.addonCount) },
      ]

  return [details, availability, ...options, { id: DISH_SECTION_IDS.more, label: 'More options' }]
}
