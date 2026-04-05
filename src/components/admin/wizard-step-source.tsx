'use client'

import { Lightbulb } from 'lucide-react'
import { WizardItemGrid } from '@/components/admin/wizard-item-grid'
import type { MenuItem } from '@/types/database'

interface MenuItemWithCategory extends MenuItem {
  category: { id: string; name: string } | null
}

export interface WizardStepSourceProps {
  items: MenuItemWithCategory[]
  selectedItemId: string | null
  onSelect: (itemId: string) => void
}

export function WizardStepSource({
  items,
  selectedItemId,
  onSelect,
}: WizardStepSourceProps) {
  return (
    <div>
      {/* Explainer */}
      <div className="mx-4 mt-4 flex gap-3 rounded-lg bg-green-50 p-3.5 dark:bg-green-950/30 sm:mx-5">
        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
        <div>
          <p className="text-sm font-semibold text-green-800 dark:text-green-300">
            What&apos;s the basic item?
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-green-700 dark:text-green-400">
            This is the item your customer originally orders — like a single
            burger or a regular coffee. You&apos;ll pick the upgrade option in the
            next step.
          </p>
        </div>
      </div>

      {/* Item Grid */}
      <WizardItemGrid
        items={items}
        selectedItemId={selectedItemId}
        onSelect={onSelect}
      />
    </div>
  )
}
