'use client'

/**
 * State for the pre-modifier-groups option editors: a flat size list, grouped
 * variation types, and add-ons. Only stores without `modifier_groups_enabled`
 * see these editors, but the form always sends the columns, so the state
 * lives here whether or not the editors render.
 *
 * Every update returns new arrays — the old handlers pushed into the existing
 * option array, which React could miss.
 *
 * Which shape is saved follows `useGroupedVariations`. The owner never picks a
 * shape: a dish starts as a plain size list and becomes choice lists only when
 * a second choice is added, with the sizes carried into the first list. (The
 * old two-way switch saved an empty list for whichever shape was not shown, so
 * flipping it silently dropped the sizes.)
 */

import { useState } from 'react'
import type { MenuItem, Variation, VariationOption, VariationType } from '@/types/database'
import { sizesToChoiceGroup, withExclusiveDefault } from '@/lib/menu-editor/legacy-option-convert'

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

  const newSize = (isFirst: boolean): Variation => ({
    id: `temp-${Date.now()}`,
    name: '',
    price_modifier: 0,
    is_default: isFirst,
  })

  const newChoice = (displayOrder: number): VariationType => ({
    id: `type-temp-${Date.now()}`,
    name: '',
    is_required: false,
    display_order: displayOrder,
    options: [],
  })

  const variationHandlers = {
    add: () => setVariations((prev) => [...prev, newSize(prev.length === 0)]),
    setDefault: (index: number) => setVariations((prev) => withExclusiveDefault(prev, index)),
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
    add: () => setVariationTypes((prev) => [...prev, newChoice(prev.length)]),
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
    setDefaultOption: (typeIndex: number, optionIndex: number) =>
      setVariationTypes((prev) => {
        const type = prev[typeIndex]
        return replaceAt(prev, typeIndex, { ...type, options: withExclusiveDefault(type.options, optionIndex) })
      }),
  }

  /** Ways into an empty "Sizes & choices" section. */
  const startSizes = () => {
    setUseGroupedVariations(false)
    setVariations((prev) => (prev.length > 0 ? prev : [newSize(true)]))
  }

  const startChoices = () => {
    setUseGroupedVariations(true)
    setVariationTypes((prev) => (prev.length > 0 ? prev : [newChoice(0)]))
  }

  /** "Add another choice" from a size list: the sizes become the "Size" choice. */
  const addChoiceAfterSizes = () => {
    const named = variations.filter((size) => size.name.trim().length > 0)
    const sizeGroup = named.length > 0 ? [sizesToChoiceGroup(named, `type-temp-size-${Date.now()}`)] : []
    setVariationTypes([...sizeGroup, newChoice(sizeGroup.length)])
    setVariations([])
    setUseGroupedVariations(true)
  }

  return {
    variations,
    variationTypes,
    addons,
    setAddons,
    useGroupedVariations,
    startSizes,
    startChoices,
    addChoiceAfterSizes,
    variationHandlers,
    addonHandlers,
    typeHandlers,
  }
}

export type LegacyOptions = ReturnType<typeof useLegacyOptions>
