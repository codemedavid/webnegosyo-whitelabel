'use client'

import { useState } from 'react'
import { TabList, Tab } from '@astryxdesign/core/TabList'
import { VStack } from '@astryxdesign/core/Stack'
import { Badge } from '@astryxdesign/core/Badge'
import { IngredientsTab } from '@/components/admin/inventory/ingredients-tab'
import { UnitsTab } from '@/components/admin/inventory/units-tab'
import type { InventoryItem, InventoryUnitRow } from '@/types/database'

interface InventoryManagerProps {
  tenantId: string
  tenantSlug: string
  initialIngredients: InventoryItem[]
  initialUnits: InventoryUnitRow[]
}

/**
 * Inventory, rebuilt on Astryx.
 *
 * Only the two tabs and the shared state live here; each tab owns its own
 * table, dialogs and server actions. The counts ride on the tabs because the
 * first question a merchant has — "how much am I even tracking?" — should be
 * answerable without opening either.
 */
export function InventoryManager({
  tenantId,
  tenantSlug,
  initialIngredients,
  initialUnits,
}: InventoryManagerProps) {
  const [ingredients, setIngredients] = useState<InventoryItem[]>(initialIngredients)
  const [units, setUnits] = useState<InventoryUnitRow[]>(initialUnits)
  const [tab, setTab] = useState('ingredients')

  return (
    <VStack gap={4}>
      <TabList value={tab} onChange={setTab} hasDivider>
        <Tab
          value="ingredients"
          label="Ingredients"
          endContent={<Badge variant="neutral" label={String(ingredients.length)} />}
        />
        <Tab
          value="units"
          label="Units"
          endContent={<Badge variant="neutral" label={String(units.length)} />}
        />
      </TabList>

      {tab === 'ingredients' ? (
        <IngredientsTab
          tenantId={tenantId}
          tenantSlug={tenantSlug}
          ingredients={ingredients}
          units={units}
          onChange={setIngredients}
        />
      ) : (
        <UnitsTab
          tenantId={tenantId}
          tenantSlug={tenantSlug}
          units={units}
          onChange={setUnits}
        />
      )}
    </VStack>
  )
}
