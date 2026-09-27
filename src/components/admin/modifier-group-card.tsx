'use client'

/**
 * One modifier group: its name, one "How do customers choose?" question, the
 * limit fields that question needs, and its options.
 */

import { useId } from 'react'
import { Library, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ModifierGroup, ModifierOption } from '@/types/database'
import { describeSelectionRule } from '@/lib/modifier-groups'
import { applyChoiceRule, CHOICE_RULES, deriveChoiceRule, isExtrasRule, type ChoiceRule } from '@/lib/modifier-choice-rule'
import { ModifierOptionRow } from '@/components/admin/modifier-option-row'
import type { LinkableMenuItem, ModifierRecipeContext } from '@/components/admin/modifier-groups-editor'

interface ModifierGroupCardProps {
  group: ModifierGroup
  basePrice: number
  recipeContext?: ModifierRecipeContext
  optionRecipeCosts?: Record<string, number>
  linkableItems?: LinkableMenuItem[]
  onSaveToLibrary?: () => void
  onRemoveGroup: () => void
  onReplaceGroup: (next: ModifierGroup) => void
  onUpdateName: (name: string) => void
  onUpdateMinSelect: (min: number) => void
  onUpdateMaxSelect: (max: number | null) => void
  onAddOption: () => void
  onRemoveOption: (optionIndex: number) => void
  onUpdateOption: <K extends keyof ModifierOption>(optionIndex: number, field: K, value: ModifierOption[K]) => void
  onReplaceOption: (optionIndex: number, next: ModifierOption) => void
}

const SELECT_CLASS =
  'h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function ModifierGroupCard({
  group,
  basePrice,
  recipeContext,
  optionRecipeCosts,
  linkableItems,
  onSaveToLibrary,
  onRemoveGroup,
  onReplaceGroup,
  onUpdateName,
  onUpdateMinSelect,
  onUpdateMaxSelect,
  onAddOption,
  onRemoveOption,
  onUpdateOption,
  onReplaceOption,
}: ModifierGroupCardProps) {
  const ruleId = useId()
  const rule = deriveChoiceRule(group)
  const isExtras = isExtrasRule(rule)
  const groupLabel = group.name || 'new group'

  return (
    <div className="space-y-4 rounded-xl border bg-muted/30 p-3 sm:p-4">
      <div className="flex items-center gap-2">
        <Input
          aria-label="Group name"
          placeholder={isExtras ? 'Name, e.g. Extras' : 'Name, e.g. Size'}
          value={group.name}
          onChange={(e) => onUpdateName(e.target.value)}
          className="h-10 bg-background font-semibold"
        />
        {onSaveToLibrary && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onSaveToLibrary}
            aria-label={`Save ${groupLabel} to your library`}
            title="Save to library, to reuse on other dishes"
            className="h-10 w-10 shrink-0 text-muted-foreground"
          >
            <Library className="h-4 w-4" />
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemoveGroup}
          aria-label={`Delete ${groupLabel}`}
          className="h-10 w-10 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-2">
        <label htmlFor={ruleId} className="text-sm font-medium">How do customers choose?</label>
        <select
          id={ruleId}
          aria-label={`How do customers choose? (${groupLabel})`}
          value={rule}
          onChange={(e) => onReplaceGroup(applyChoiceRule(group, e.target.value as ChoiceRule))}
          className={SELECT_CLASS}
        >
          {CHOICE_RULES.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
        <LimitFields rule={rule} group={group} onUpdateMinSelect={onUpdateMinSelect} onUpdateMaxSelect={onUpdateMaxSelect} />
        {/* Exactly what the customer will be told, so the effect of a limit is
            visible without leaving the editor. */}
        <p className="text-xs text-muted-foreground">
          {isExtras
            ? 'Customers tap − / + on each extra. Limits count portions per item ordered; leave blank for no limit.'
            : <>Customer sees: <span className="font-medium text-foreground">{describeSelectionRule(group)}</span></>}
        </p>
      </div>

      <div className="space-y-2">
        {group.options.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {isExtras ? 'Add extras like Extra rice or Egg.' : 'Add options like Regular and Large.'}
          </p>
        )}
        {group.options.map((option, optionIndex) => (
          <ModifierOptionRow
            key={option.id}
            option={option}
            basePrice={basePrice}
            recipeContext={recipeContext}
            recipeCost={optionRecipeCosts?.[option.id]}
            linkableItems={linkableItems}
            onRemove={() => onRemoveOption(optionIndex)}
            onUpdate={(field, value) => onUpdateOption(optionIndex, field, value)}
            onReplace={(next) => onReplaceOption(optionIndex, next)}
          />
        ))}
        <Button type="button" variant="outline" onClick={onAddOption} className="h-10 w-full border-dashed bg-background">
          <Plus className="mr-1.5 h-4 w-4" />
          {isExtras ? 'Add an extra' : 'Add an option'}
        </Button>
      </div>
    </div>
  )
}

interface LimitFieldsProps {
  rule: ChoiceRule
  group: ModifierGroup
  onUpdateMinSelect: (min: number) => void
  onUpdateMaxSelect: (max: number | null) => void
}

/** Only the limits the chosen rule leaves open; single picks have none. */
function LimitFields({ rule, group, onUpdateMinSelect, onUpdateMaxSelect }: LimitFieldsProps) {
  if (rule === 'pick-one' || rule === 'pick-one-optional') return null

  const isExtras = isExtrasRule(rule)
  const isRequired = rule === 'pick-some' || rule === 'extras-required'

  return (
    <div className="flex flex-wrap gap-3">
      {isRequired && (
        <LimitInput
          label={isExtras ? 'Min portions' : 'At least'}
          min={1}
          placeholder="1"
          value={group.min_select}
          onChange={(raw) => onUpdateMinSelect(raw === '' ? 0 : Math.max(0, parseInt(raw, 10) || 0))}
        />
      )}
      <LimitInput
        label={isExtras ? 'Max portions' : 'At most'}
        min={1}
        placeholder="No limit"
        value={group.max_select ?? ''}
        onChange={(raw) => onUpdateMaxSelect(raw === '' ? null : Math.max(1, parseInt(raw, 10) || 1))}
      />
    </div>
  )
}

interface LimitInputProps {
  label: string
  min: number
  placeholder: string
  value: number | ''
  onChange: (raw: string) => void
}

function LimitInput({ label, min, placeholder, value, onChange }: LimitInputProps) {
  const id = useId()
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-sm text-muted-foreground">{label}</label>
      <Input
        id={id}
        type="number"
        min={min}
        inputMode="numeric"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value.trim())}
        className="h-10 w-24 bg-background"
      />
    </div>
  )
}
