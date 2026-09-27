'use client'

/**
 * State for the pre-modifier-groups option editors: a flat size list, grouped
 * variation types, and add-ons. Only stores without `modifier_groups_enabled`
 * see these editors, but the form always sends the columns, so the state
 * lives here whether or not the editors render.
 *
 * Every update returns new arrays — the old handlers pushed into the existing
 * option array, which React could miss.
 */

import { useState } from 'react'
import type { MenuItem, Variation, VariationOption, VariationType } from '@/types/database'

export interface LegacyAddon {
  id: string
  name: string
  price: number
}

type Field = string | number | boolean | undefined

function replaceAt<T>(list: readonly T[], index: number, next: T): T[] {
  return list.map((entry, i) => (i === index ? next : entry))
}

export function useLegacyOptions(item?: MenuItem) {
  const [variations, setVariations] = useState<Variation[]>(item?.variations || [])
  const [variationTypes, setVariationTypes] = useState<VariationType[]>(item?.variation_types || [])
  const [addons, setAddons] = useState<LegacyAddon[]>(item?.addons || [])
  const [useGroupedVariations, setUseGroupedVariations] = useState(
    Boolean(item?.variation_types && item.variation_types.length > 0),
  )

  const variationHandlers = {
    add: () =>
      setVariations((prev) => [
        ...prev,
        { id: `temp-${Date.now()}`, name: '', price_modifier: 0, is_default: prev.length === 0 },
      ]),
    remove: (index: number) => setVariations((prev) => prev.filter((_, i) => i !== index)),
    update: (index: number, field: string, value: Field) =>
      setVariations((prev) => replaceAt(prev, index, { ...prev[index], [field]: value })),
  }

  const addonHandlers = {
    add: () => setAddons((prev) => [...prev, { id: `temp-${Date.now()}`, name: '', price: 0 }]),
    remove: (index: number) => setAddons((prev) => prev.filter((_, i) => i !== index)),
    update: (index: number, field: string, value: Field) =>
      setAddons((prev) => replaceAt(prev, index, { ...prev[index], [field]: value })),
  }

  const typeHandlers = {
    add: () =>
      setVariationTypes((prev) => [
        ...prev,
        { id: `type-temp-${Date.now()}`, name: '', is_required: false, display_order: prev.length, options: [] },
      ]),
    remove: (index: number) => setVariationTypes((prev) => prev.filter((_, i) => i !== index)),
    update: (index: number, field: keyof VariationType, value: string | boolean | number) =>
      setVariationTypes((prev) => replaceAt(prev, index, { ...prev[index], [field]: value })),
    addOption: (typeIndex: number) =>
      setVariationTypes((prev) => {
        const type = prev[typeIndex]
        const option: VariationOption = {
          id: `opt-temp-${Date.now()}`,
          name: '',
          price_modifier: 0,
          image_url: undefined,
          is_default: type.options.length === 0,
          display_order: type.options.length,
        }
        return replaceAt(prev, typeIndex, { ...type, options: [...type.options, option] })
      }),
    removeOption: (typeIndex: number, optionIndex: number) =>
      setVariationTypes((prev) => {
        const type = prev[typeIndex]
        return replaceAt(prev, typeIndex, { ...type, options: type.options.filter((_, i) => i !== optionIndex) })
      }),
    updateOption: (typeIndex: number, optionIndex: number, field: keyof VariationOption, value: Field) =>
      setVariationTypes((prev) => {
        const type = prev[typeIndex]
        const options = replaceAt(type.options, optionIndex, { ...type.options[optionIndex], [field]: value })
        return replaceAt(prev, typeIndex, { ...type, options })
      }),
  }

  return {
    variations,
    variationTypes,
    addons,
    setAddons,
    useGroupedVariations,
    setUseGroupedVariations,
    variationHandlers,
    addonHandlers,
    typeHandlers,
  }
}

export type LegacyOptions = ReturnType<typeof useLegacyOptions>
