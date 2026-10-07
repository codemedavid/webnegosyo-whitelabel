'use client'

/**
 * One modifier group: its name, two plain questions — what kind of pick, and
 * is it required — the limits that answer leaves open, and its options as one
 * flat list. The six-way "How do customers choose?" select is the same data
 * (`ChoiceRule`); it is just asked as the two decisions an owner actually makes.
 */

import { useId, useState } from 'react'
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
  // A "Several" group capped at 1 IS a "One" group, and a cap under the
  // minimum lowers the minimum. Both are right for a finished number but wrong
  // for a keystroke on the way to one ("1" before "12"), so such a cap waits
  // for the owner to leave the field.
  const lowestLiveMax = Math.max(group.min_select, isExtras ? 1 : 2)

  return (
    <div className="flex flex-wrap gap-3">
      {isRequired && (
        <LimitInput
          label={isExtras ? 'Min portions' : 'At least'}
          placeholder="1"
          value={group.min_select}
          // An emptied or zero minimum is never stored: it would turn the
          // group optional and remove this field mid-edit.
          parse={(raw) => parsePositiveInt(raw) ?? undefined}
          canApplyWhileTyping={() => true}
          onCommit={(min) => {
            if (min !== null) onUpdateMinSelect(min)
          }}
        />
      )}
      <LimitInput
        label={isExtras ? 'Max portions' : 'At most'}
        placeholder="No limit"
        value={group.max_select}
        parse={(raw) => (raw === '' ? null : parsePositiveInt(raw) ?? undefined)}
        canApplyWhileTyping={(max) => max === null || max >= lowestLiveMax}
        onCommit={onUpdateMaxSelect}
      />
    </div>
  )
}

/** A whole number of at least 1, or null when the text is not one. */
function parsePositiveInt(raw: string): number | null {
  const parsed = parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : null
}

interface LimitInputProps {
  label: string
  placeholder: string
  value: number | null
  /** The stored value for the typed text; `undefined` when it cannot be stored. */
  parse: (raw: string) => number | null | undefined
  /** Whether a value may be stored mid-typing, or only once the field is left. */
  canApplyWhileTyping: (value: number | null) => boolean
  onCommit: (value: number | null) => void
}

/**
 * Backed by the text the owner typed, so a half-typed limit is never forced
 * into the stored rule. Leaving the field stores what can be stored and shows
 * the stored value again.
 */
function LimitInput({ label, placeholder, value, parse, canApplyWhileTyping, onCommit }: LimitInputProps) {
  const id = useId()
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? (value === null ? '' : String(value))

  const handleChange = (raw: string) => {
    setDraft(raw)
    const parsed = parse(raw.trim())
    if (parsed !== undefined && parsed !== value && canApplyWhileTyping(parsed)) onCommit(parsed)
  }

  const handleBlur = () => {
    if (draft === null) return
    const parsed = parse(draft.trim())
    setDraft(null)
    if (parsed !== undefined && parsed !== value) onCommit(parsed)
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-sm text-muted-foreground">{label}</label>
      <Input
        id={id}
        type="number"
        min={1}
        inputMode="numeric"
        placeholder={placeholder}
        value={shown}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
        className="h-10 w-24"
      />
    </div>
  )
}
