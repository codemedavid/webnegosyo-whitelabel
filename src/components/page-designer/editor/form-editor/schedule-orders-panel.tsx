'use client'

import { AlertTriangle } from 'lucide-react'

import { Group } from '@/components/hero-builder/editor/controls'
import { Switch } from '@/components/ui/switch'

import { useCheckoutFormEditor } from './form-context'

/**
 * The Schedule block's Content panel. The block shows only on order types with
 * pre-orders on, and the checkout refuses a time on any other (createOrderAction),
 * so this is where an owner sees why it's missing from an order type and fixes it.
 */
export function ScheduleOrdersPanel() {
  const editor = useCheckoutFormEditor()
  if (!editor) return null
  // Register-only types never reach this checkout, so they have no say here.
  const tabs = editor.form.tabs.filter((tab) => tab.isOnWeb)
  const isOnSomewhere = tabs.some((tab) => tab.advanceOrderEnabled)

  return (
    <Group title="Shows on these orders">
      <p className="mb-2 text-[11px] leading-snug text-neutral-500">
        Customers only get this choice on the order types switched on here. The preview always shows it. Changes apply to your store right away.
      </p>
      <ul className="space-y-1.5">
        {tabs.map((tab) => (
          <li key={tab.id} className="flex items-center justify-between gap-2 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-800">
            <span className="min-w-0 truncate">{tab.name}</span>
            <Switch
              aria-label={`Pre-orders for ${tab.name}`}
              checked={tab.advanceOrderEnabled}
              onCheckedChange={(isOn) => editor.onToggleAdvanceOrder(tab.id, isOn)}
            />
          </li>
        ))}
      </ul>
      {!isOnSomewhere && (
        <p role="status" className="mt-2 flex items-start gap-1 text-[11px] font-medium leading-snug text-amber-800">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          Off on every order type, so customers never see this block.
        </p>
      )}
    </Group>
  )
}
