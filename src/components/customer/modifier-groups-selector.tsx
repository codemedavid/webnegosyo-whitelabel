'use client'

import type { ModifierGroup, ModifierOption } from '@/types/database'
import { describeSelectionRule, isOptionAvailable, isSelectionAtMax } from '@/lib/modifier-groups'
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
 * and pricing live in the tested adapter/hook.
 *
 * Multi-select groups (`max_select !== 1`) get checkbox semantics, the group's
 * min/max rule spelled out, live progress toward it, and their unchosen options
 * disabled at the cap. Single-select groups stay radio-style chips: toggling
 * one replaces the current pick, so they are never "full".
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
        const isMultiSelect = group.max_select !== 1
        const atMax = isSelectionAtMax(group, selectedIds.length)
        const progress = describeSelectionProgress(group, selectedIds.length)

        return (
          <div key={group.id} className="mb-2" data-branding-scope="product/variations">
            <div className="mb-3 flex flex-wrap items-center gap-2">
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
                {describeSelectionRule(group)}
              </span>
              {progress && (
                <span className="text-xs opacity-70" style={{ color: 'var(--pd-variation-text)' }}>
                  {progress}
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {group.options.map((option) => {
                const isSelected = selectedIds.includes(option.id)
                return (
                  <ModifierOptionChip
                    key={option.id}
                    option={option}
                    isSelected={isSelected}
                    isMultiSelect={isMultiSelect}
                    // Selected options stay clickable at the cap so the customer
                    // can swap one out instead of being stuck.
                    isCapped={atMax && !isSelected}
                    onToggle={() => onToggle(group, option.id)}
                    hideCurrencySymbol={hideCurrencySymbol}
                  />
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Live progress toward a multi-select group's rule, e.g. "1 more to go" or
 * "2 of 3 selected". Returns null for single-select groups and for optional
 * uncapped groups, where a running count would be noise.
 */
function describeSelectionProgress(group: ModifierGroup, selectedCount: number): string | null {
  if (group.max_select === 1) {
    return null
  }

  const remaining = group.min_select - selectedCount
  if (remaining > 0) {
    return `${remaining} more to go`
  }
  if (group.max_select === null) {
    return selectedCount > 0 ? `${selectedCount} selected` : null
  }
  return `${selectedCount} of ${group.max_select} selected`
}

interface ModifierOptionChipProps {
  option: ModifierOption
  isSelected: boolean
  isMultiSelect: boolean
  isCapped: boolean
  onToggle: () => void
  hideCurrencySymbol?: boolean
}

function ModifierOptionChip({
  option,
  isSelected,
  isMultiSelect,
  isCapped,
  onToggle,
  hideCurrencySymbol,
}: ModifierOptionChipProps) {
  const available = isOptionAvailable(option)
  const disabled = !available || isCapped
  const priceLabel =
    option.price_modifier > 0
      ? `+${formatPrice(option.price_modifier, { hideCurrencySymbol })}`
      : null

  return (
    <button
      type="button"
      aria-pressed={isSelected}
      // Multi-select chips read as a set of independent toggles; single-select
      // chips as an exclusive choice. `aria-pressed` is correct for both (the
      // role stays `button`), so the mode is exposed for styling and tests
      // rather than by swapping in an invalid role/attribute pairing.
      data-select-mode={isMultiSelect ? 'multi' : 'single'}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        'flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
        isSelected ? 'border-2' : 'border',
        disabled && 'cursor-not-allowed opacity-50',
      )}
      style={{
        borderColor: isSelected ? 'var(--pd-variation-selected-border)' : 'var(--pd-border)',
        backgroundColor: isSelected
          ? 'var(--pd-variation-selected-bg)'
          : 'var(--pd-variation-bg)',
        color: isSelected ? 'var(--pd-variation-selected-text)' : 'var(--pd-variation-text)',
      }}
    >
      {isMultiSelect && (
        <span
          aria-hidden="true"
          className={cn(
            'flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] leading-none',
            isSelected && 'font-bold',
          )}
          style={{ borderColor: 'currentColor' }}
        >
          {isSelected ? '✓' : ''}
        </span>
      )}
      <span>{option.name}</span>
      {priceLabel && <span className="opacity-80">{priceLabel}</span>}
      {!available && <span className="text-xs opacity-70">(sold out)</span>}
    </button>
  )
}
