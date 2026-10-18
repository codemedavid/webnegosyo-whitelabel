'use client'

import type { ModifierGroup, ModifierOption } from '@/types/database'
import { describeSelectionRule, isOptionAvailable, isSelectionAtMax } from '@/lib/modifier-groups'
import type { ModifierSelection } from '@/lib/modifier-groups-cart'
import { formatPrice } from '@/lib/cart-utils'
import { cn } from '@/lib/utils'
import type { ModifierLabels } from '@/lib/product-detail-labels'
import { AddonQuantityControl } from './addon-quantity-control'

const PRICE_STYLE = { color: 'var(--pd-variation-price)' } as const
// A chosen chip's price stays in the chosen text colour, readable on its fill.
const CHOSEN_PRICE_STYLE = { opacity: 0.85 } as const

interface ModifierGroupsSelectorProps {
  groups: ModifierGroup[]
  selection: ModifierSelection
  onToggle: (group: ModifierGroup, optionId: string) => void
  onQuantityChange?: (group: ModifierGroup, optionId: string, quantity: number) => void
  parentQuantity?: number
  hideCurrencySymbol?: boolean
  /** The store's own rule and ₱0 labels (Studio → Product Detail). */
  labels?: ModifierLabels
}

const NO_LABELS: ModifierLabels = { rule: {}, freeLabel: undefined }

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
  onQuantityChange,
  parentQuantity = 1,
  hideCurrencySymbol,
  labels = NO_LABELS,
}: ModifierGroupsSelectorProps) {
  if (groups.length === 0) {
    return null
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => {
        const selectedIds = selection[group.id] ?? []
        const quantityMode = group.selection_mode === 'quantity'
        const isMultiSelect = group.max_select !== 1
        const atMax = isSelectionAtMax(group, selectedIds.length)
        const progress = describeSelectionProgress(group, selectedIds.length)

        return (
          <div key={group.id} className="mb-2" data-branding-scope={quantityMode ? 'product/addons' : 'product/variations'}>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h3
                className="text-base font-semibold"
                style={quantityMode
                  ? { color: 'var(--pd-addon-title)', fontFamily: 'var(--pd-font-heading)', fontSize: 'var(--pd-addon-title-font-size)' }
                  : { color: 'var(--pd-variation-title)', fontFamily: 'var(--pd-font-heading)', fontSize: 'var(--pd-variation-title-font-size)' }}
              >
                {group.name}
              </h3>
              <span
                className="rounded px-2 py-0.5 text-xs font-medium"
                style={{ color: 'var(--pd-variation-required)' }}
              >
                {describeSelectionRule(group, labels.rule)}
              </span>
              {progress && (
                <span className="text-xs" style={{ color: 'var(--pd-text-muted)' }}>
                  {progress}
                </span>
              )}
            </div>

            {quantityMode && <p className="mb-3 text-xs" style={{ color: 'var(--pd-text-muted)' }}>Quantities are per item. Choose how many of each extra to add.</p>}

            <div className="flex flex-wrap gap-2">
              {group.options.map((option) => {
                const isSelected = selectedIds.includes(option.id)
                if (quantityMode) {
                  const portions = selectedIds.filter(id => id === option.id).length
                  return <AddonQuantityControl key={option.id} name={option.name} price={option.price_modifier}
                    quantity={portions} disabled={!isOptionAvailable(option)} hideCurrencySymbol={hideCurrencySymbol} freeLabel={labels.freeLabel}
                    atMax={(group.max_select !== null && selectedIds.length >= group.max_select)
                      || (option.stock_mode === 'simple' && (portions + 1) * parentQuantity > (option.stock_qty ?? 0))}
                    onChange={value => onQuantityChange?.(group, option.id, value)} />
                }
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
                    freeLabel={labels.freeLabel}
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
  freeLabel?: string
}

function ModifierOptionChip({
  option,
  isSelected,
  isMultiSelect,
  isCapped,
  onToggle,
  hideCurrencySymbol,
  freeLabel,
}: ModifierOptionChipProps) {
  const available = isOptionAvailable(option)
  const disabled = !available || isCapped
  const priceLabel =
    option.price_modifier > 0
      ? `+${formatPrice(option.price_modifier, { hideCurrencySymbol })}`
      : option.price_modifier === 0 ? (freeLabel ?? 'No extra charge') : null

  return (
    <button
      type="button"
      aria-pressed={isSelected}
      // Multi-select chips read as a set of independent toggles; single-select
      // chips as an exclusive choice. `aria-pressed` is correct for both (the
      // role stays `button`), so the mode is exposed for styling and tests
      // rather than by swapping in an invalid role/attribute pairing.
      data-select-mode={isMultiSelect ? 'multi' : 'single'}
      data-branding-scope="product/variation-option"
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        'flex items-center gap-1.5 border px-4 py-2 text-sm font-medium transition-colors',
        isSelected ? 'border-2' : 'border',
        disabled && 'cursor-not-allowed opacity-50',
      )}
      style={{
        borderRadius: 'var(--pd-chip-radius, 0.5rem)',
        transitionDuration: 'var(--pd-transition-duration)',
        borderColor: isSelected ? 'var(--pd-variation-selected-border, var(--border))' : 'var(--pd-variation-option-border, var(--border))',
        backgroundColor: isSelected
          ? 'var(--pd-variation-selected-bg)'
          : 'var(--pd-variation-option-bg)',
        color: isSelected ? 'var(--pd-variation-selected-text)' : 'var(--pd-variation-option-text)',
      }}
    >
      {isMultiSelect && (
        <span
          aria-hidden="true"
          className={cn(
            'flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] leading-none',
            isSelected && 'font-bold',
          )}
          style={isSelected
            ? { borderColor: 'var(--pd-addon-check)', color: 'var(--pd-addon-check)' }
            : { borderColor: 'currentColor' }}
        >
          {isSelected ? '✓' : ''}
        </span>
      )}
      <span>{option.name}</span>
      {priceLabel && <span style={isSelected ? CHOSEN_PRICE_STYLE : PRICE_STYLE}>{priceLabel}</span>}
      {!available && <span className="text-xs opacity-70">(sold out)</span>}
    </button>
  )
}
