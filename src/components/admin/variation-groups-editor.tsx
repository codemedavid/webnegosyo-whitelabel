'use client'

/**
 * Choice lists for a dish — "Size", "Spice level", "Sugar level". A customer
 * picks one option from each list; an option can cost extra, carry a photo,
 * and one per list can start pre-selected.
 */

import { useId } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { AddRowButton, OptionList, OptionRow } from '@/components/admin/menu-editor/option-rows'
import type { LegacyOptions } from '@/components/admin/menu-editor/use-legacy-options'
import type { VariationType } from '@/types/database'

type ChoiceHandlers = LegacyOptions['typeHandlers']

interface VariationGroupsEditorProps {
  variationTypes: VariationType[]
  handlers: ChoiceHandlers
}

export function VariationGroupsEditor({ variationTypes, handlers }: VariationGroupsEditorProps) {
  return (
    <div className="space-y-4">
      {variationTypes.map((choice, index) => (
        <ChoiceCard key={choice.id} choice={choice} index={index} handlers={handlers} />
      ))}
      <AddRowButton label="Add another choice" onClick={handlers.add} />
    </div>
  )
}

interface ChoiceCardProps {
  choice: VariationType
  index: number
  handlers: ChoiceHandlers
}

function ChoiceCard({ choice, index, handlers }: ChoiceCardProps) {
  const nameId = useId()
  const requiredId = useId()
  const title = choice.name.trim() || `Choice ${index + 1}`

  return (
    <div className="space-y-3 rounded-xl border bg-muted/30 p-3 sm:p-4">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor={nameId} className="text-xs font-medium text-muted-foreground">
            Choice {index + 1} — what are customers picking?
          </Label>
          <Input
            id={nameId}
            placeholder="e.g. Size, Spice level, Sugar level"
            value={choice.name}
            onChange={(e) => handlers.update(index, 'name', e.target.value)}
            className="h-10 bg-background font-medium"
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Remove ${title}`}
          onClick={() => handlers.remove(index)}
          className="h-10 w-10 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {choice.options.length > 0 ? (
        <OptionList>
          {choice.options.map((option, optionIndex) => (
            <OptionRow
              key={option.id}
              name={option.name}
              onNameChange={(name) => handlers.updateOption(index, optionIndex, 'name', name)}
              nameLabel="Option name"
              namePlaceholder="e.g. Small, Mild, 50% sugar"
              price={option.price_modifier}
              onPriceChange={(price) => handlers.updateOption(index, optionIndex, 'price_modifier', price)}
              priceLabel="Extra charge"
              pricePrefix="+₱"
              isDefault={option.is_default}
              onToggleDefault={() => handlers.setDefaultOption(index, optionIndex)}
              photo={{
                url: option.image_url ?? '',
                onChange: (url) => handlers.updateOption(index, optionIndex, 'image_url', url || undefined),
              }}
              onRemove={() => handlers.removeOption(index, optionIndex)}
            />
          ))}
        </OptionList>
      ) : (
        <p className="text-sm text-muted-foreground">Add the options customers pick from.</p>
      )}
      <AddRowButton label="Add option" onClick={() => handlers.addOption(index)} />

      <div className="flex items-center justify-between gap-4 rounded-lg bg-background px-3 py-2.5">
        <div className="min-w-0">
          <Label htmlFor={requiredId} className="text-sm font-medium">Customers must choose</Label>
          <p className="text-xs text-muted-foreground">
            {choice.is_required ? 'They can’t add the dish without picking one.' : 'Optional — they can skip it.'}
          </p>
        </div>
        <Switch
          id={requiredId}
          checked={choice.is_required}
          onCheckedChange={(checked) => handlers.update(index, 'is_required', checked)}
        />
      </div>
    </div>
  )
}
