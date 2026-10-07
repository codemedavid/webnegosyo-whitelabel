'use client'

/**
 * One modifier group: its name, two plain questions — what kind of pick, and
 * is it required — the limits that answer leaves open, and its options as one
 * flat list. The six-way "How do customers choose?" select is the same data
 * (`ChoiceRule`); it is just asked as the two decisions an owner actually makes.
 */

import { useId } from 'react'
import { Library, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import type { ModifierGroup, ModifierOption } from '@/types/database'
import { describeSelectionRule } from '@/lib/modifier-groups'
import {
  applyChoiceRule,
  CHOICE_KINDS,
  deriveChoiceRule,
  isExtrasRule,
  joinChoiceRule,
  splitChoiceRule,
  type ChoiceKind,
  type ChoiceRule,
} from '@/lib/modifier-choice-rule'
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
  const rule = deriveChoiceRule(group)
  const { kind, isRequired } = splitChoiceRule(rule)
  const isExtras = isExtrasRule(rule)
  const groupLabel = group.name || 'new group'
  const setRule = (next: ChoiceRule) => onReplaceGroup(applyChoiceRule(group, next))

  return (
    <div className="space-y-4 py-5 first:pt-0">
      <div className="flex items-center gap-1.5">
        <Input
          aria-label="Group name"
          placeholder={isExtras ? 'Group name, e.g. Add-ons' : 'Group name, e.g. Size'}
          value={group.name}
          onChange={(e) => onUpdateName(e.target.value)}
          className="h-11 font-semibold"
        />
        {onSaveToLibrary && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onSaveToLibrary}
            aria-label={`Save ${groupLabel} to your library`}
            title="Save to library, to reuse on other dishes"
            className="h-11 w-11 shrink-0 text-muted-foreground"
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
          className="h-11 w-11 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <KindPicker
            groupLabel={groupLabel}
            kind={kind}
            onChange={(next) => setRule(joinChoiceRule(next, isRequired))}
          />
          <RequiredSwitch
            groupLabel={groupLabel}
            isRequired={isRequired}
            onChange={(next) => setRule(joinChoiceRule(kind, next))}
          />
        </div>
        <LimitFields rule={rule} group={group} onUpdateMinSelect={onUpdateMinSelect} onUpdateMaxSelect={onUpdateMaxSelect} />
        {/* Exactly what the customer will be told, so a limit's effect is visible here. */}
        <p className="text-xs text-muted-foreground">
          {isExtras
            ? 'Customers tap − / + on each one. Limits count portions per item ordered.'
            : <>Customer sees: <span className="font-medium text-foreground">{describeSelectionRule(group)}</span></>}
        </p>
      </div>

      <div>
        {group.options.length > 0 ? (
          <ul className="divide-y rounded-lg border">
            {group.options.map((option, optionIndex) => (
              <li key={option.id}>
                <ModifierOptionRow
                  option={option}
                  basePrice={basePrice}
                  recipeContext={recipeContext}
                  recipeCost={optionRecipeCosts?.[option.id]}
                  linkableItems={linkableItems}
                  onRemove={() => onRemoveOption(optionIndex)}
                  onUpdate={(field, value) => onUpdateOption(optionIndex, field, value)}
                  onReplace={(next) => onReplaceOption(optionIndex, next)}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed px-3 py-3 text-sm text-muted-foreground">
            {isExtras ? 'Add things like Extra rice or Pearls.' : 'Add choices like Regular and Large, or Hot and Iced.'}
          </p>
        )}
        <Button type="button" variant="ghost" onClick={onAddOption} className="mt-1 h-11 px-2 text-primary hover:text-primary">
          <Plus className="mr-1.5 h-4 w-4" />
          {isExtras ? 'Add an extra' : 'Add an option'}
        </Button>
      </div>
    </div>
  )
}

interface KindPickerProps {
  groupLabel: string
  kind: ChoiceKind
  onChange: (kind: ChoiceKind) => void
}

/** Segmented "Customers pick: One · Several · Amounts", as native radios. */
function KindPicker({ groupLabel, kind, onChange }: KindPickerProps) {
  const name = useId()
  return (
    <fieldset className="flex min-w-0 items-center gap-2">
      <legend className="sr-only">How many can customers pick from {groupLabel}?</legend>
      <span aria-hidden className="text-sm text-muted-foreground">Customers pick</span>
      <div className="inline-flex rounded-lg border bg-muted/50 p-0.5">
        {CHOICE_KINDS.map((choice) => {
          const isActive = choice.value === kind
          return (
            <label
              key={choice.value}
              title={choice.example}
              className={cn(
                'relative inline-flex h-9 cursor-pointer items-center rounded-md px-3 text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                isActive ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <input
                type="radio"
                name={name}
                value={choice.value}
                checked={isActive}
                onChange={() => onChange(choice.value)}
                className="sr-only"
              />
              {choice.label}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

function RequiredSwitch({ groupLabel, isRequired, onChange }: { groupLabel: string; isRequired: boolean; onChange: (next: boolean) => void }) {
  const id = useId()
  return (
    <div className="flex items-center gap-2">
      <Switch id={id} checked={isRequired} onCheckedChange={onChange} aria-label={`Required for ${groupLabel}`} />
      <label htmlFor={id} className="text-sm font-medium">Required</label>
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
        className="h-10 w-24"
      />
    </div>
  )
}
