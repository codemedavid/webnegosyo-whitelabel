'use client'

import type { ModifierGroup, ModifierOption } from '@/types/database'
import { isOptionAvailable } from '@/lib/modifier-groups'
import type { ModifierSelection } from '@/lib/modifier-groups-cart'
import { formatPrice } from '@/lib/cart-utils'
import { cn } from '@/lib/utils'

interface ModifierGroupsSelectorProps {
  groups: ModifierGroup[]
  selection: ModifierSelection
  onToggle: (group: ModifierGroup, optionId: string) => void
  hideCurrencySymbol?: boolean
}

/**
 * Storefront selector for the unified modifier-groups model. Presentational:
 * it renders each group's options and forwards a toggle; all selection rules
 * and pricing live in the tested adapter/hook. Single- and multi-select groups
 * render identically (chips) — the difference is enforced upstream by
 * `toggleOption`, which replaces vs. accumulates.
 */
export function ModifierGroupsSelector({
  groups,
  selection,
  onToggle,
  hideCurrencySymbol,
}: ModifierGroupsSelectorProps) {
  if (groups.length === 0) {
    return null
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => {
        const selectedIds = selection[group.id] ?? []
        const isRequired = group.min_select > 0

        return (
          <div key={group.id} className="mb-2" data-branding-scope="product/variations">
            <div className="mb-3 flex items-center gap-2">
              <h3
                className="text-base font-semibold"
                style={{
                  color: 'var(--pd-variation-title)',
                  fontSize: 'var(--pd-variation-title-font-size)',
                }}
              >
                {group.name}
              </h3>
              <span
                className="rounded px-2 py-0.5 text-xs font-medium"
                style={{ color: 'var(--pd-variation-required)' }}
              >
                {isRequired ? 'Required' : 'Optional'}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {group.options.map((option) => (
                <ModifierOptionChip
                  key={option.id}
                  option={option}
                  isSelected={selectedIds.includes(option.id)}
                  onToggle={() => onToggle(group, option.id)}
                  hideCurrencySymbol={hideCurrencySymbol}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

interface ModifierOptionChipProps {
  option: ModifierOption
  isSelected: boolean
  onToggle: () => void
  hideCurrencySymbol?: boolean
}

function ModifierOptionChip({
  option,
  isSelected,
  onToggle,
  hideCurrencySymbol,
}: ModifierOptionChipProps) {
  const available = isOptionAvailable(option)
  const priceLabel =
    option.price_modifier > 0
      ? `+${formatPrice(option.price_modifier, { hideCurrencySymbol })}`
      : null

  return (
    <button
      type="button"
      aria-pressed={isSelected}
      disabled={!available}
      onClick={onToggle}
      className={cn(
        'flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
        isSelected ? 'border-2' : 'border',
        !available && 'cursor-not-allowed opacity-50',
      )}
      style={{
        borderColor: isSelected ? 'var(--pd-variation-selected-border)' : 'var(--pd-border)',
        backgroundColor: isSelected
          ? 'var(--pd-variation-selected-bg)'
          : 'var(--pd-variation-bg)',
        color: isSelected ? 'var(--pd-variation-selected-text)' : 'var(--pd-variation-text)',
      }}
    >
      <span>{option.name}</span>
      {priceLabel && <span className="opacity-80">{priceLabel}</span>}
      {!available && <span className="text-xs opacity-70">(sold out)</span>}
    </button>
  )
}
