'use client'

import { ChevronDown, ChevronUp, ClipboardList, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getFieldBadgeLabel } from '@/lib/checkout-field-presets'
import { SettingsSection } from '@/components/admin/order-types/settings-section'
import type { CustomerFormField } from '@/types/database'

interface CheckoutFieldsSectionProps {
  fields: readonly CustomerFormField[]
  onAdd: () => void
  onEdit: (field: CustomerFormField) => void
  onDelete: (field: CustomerFormField) => void
  onMove: (fieldId: string, direction: 'up' | 'down') => void
  /** A field write is in flight; every mutating control is held until it lands. */
  isBusy: boolean
}

/**
 * The fields this order type asks for at checkout, in the order they appear.
 *
 * Reordering used to be two unlabelled rotated back-arrows; deleting was a bare
 * trash icon with no idea of what it would remove. Each row now names the
 * field, what it is, and whether it is required, and the row itself opens the
 * editor.
 */
export function CheckoutFieldsSection({
  fields,
  onAdd,
  onEdit,
  onDelete,
  onMove,
  isBusy,
}: CheckoutFieldsSectionProps) {
  return (
    <SettingsSection
      id="checkout-form"
      title="Checkout form"
      description="What customers are asked for when they pick this order type."
      icon={ClipboardList}
    >
      {fields.length === 0 ? (
        <div className="rounded-lg border border-dashed px-4 py-10 text-center">
          <p className="text-sm font-medium">No checkout fields yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Customers will place this order without giving you a name, a number, or anything
            else. Add at least one field so you know whose order it is.
          </p>
          <Button onClick={onAdd} className="mt-4">
            <Plus className="mr-2 h-4 w-4" />
            Add a field
          </Button>
        </div>
      ) : (
        <>
          <ul aria-label="Checkout fields" className="divide-y rounded-lg border">
            {fields.map((field, index) => (
              <li
                key={field.id}
                className="flex items-center gap-3 p-3 transition-colors hover:bg-muted/40"
              >
                <span className="w-5 shrink-0 text-center text-xs tabular-nums text-muted-foreground">
                  {index + 1}
                </span>

                <button
                  type="button"
                  onClick={() => onEdit(field)}
                  className="min-w-0 flex-1 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="truncate text-sm font-medium">{field.field_label}</span>
                    <Badge variant="secondary" className="text-xs font-normal">
                      {getFieldBadgeLabel(field)}
                    </Badge>
                    {field.is_required && (
                      <Badge
                        variant="outline"
                        className="border-amber-300 bg-amber-50 text-xs font-normal text-amber-800"
                      >
                        Required
                      </Badge>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {field.placeholder || field.field_name}
                  </span>
                </button>

                <div className="flex shrink-0 items-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onMove(field.id, 'up')}
                    disabled={index === 0 || isBusy}
                    aria-label={`Move ${field.field_label} up`}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onMove(field.id, 'down')}
                    disabled={index === fields.length - 1 || isBusy}
                    aria-label={`Move ${field.field_label} down`}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onEdit(field)}
                    aria-label={`Edit ${field.field_label}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => onDelete(field)}
                    disabled={isBusy}
                    aria-label={`Delete ${field.field_label}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>

          <Button variant="outline" onClick={onAdd} className="w-full">
            <Plus className="mr-2 h-4 w-4" />
            Add field
          </Button>
        </>
      )}
    </SettingsSection>
  )
}
