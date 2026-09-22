'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  createCustomerFormFieldAction,
  updateCustomerFormFieldAction,
} from '@/app/actions/order-types'
import { toast } from 'sonner'
import {
  buildFieldFromPreset,
  getAvailableFieldPresets,
  getCheckoutFieldPreset,
  resolvePresetIdForField,
} from '@/lib/checkout-field-presets'
import type { CustomerFormField } from '@/types/database'

export interface FieldDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The field being edited, or null to add a new one. */
  field: CustomerFormField | null
  orderTypeId: string
  tenantId: string
  tenantSlug: string
  existingFields: CustomerFormField[]
  /**
   * The saved row, handed back so the caller can show it immediately instead of
   * waiting on a refresh round trip.
   */
  onSuccess: (saved?: CustomerFormField) => void
}

/**
 * Add or edit one checkout field.
 *
 * The draft lives in `useState` seeded from `field`, which is read once per
 * mount — so the caller MUST remount this on every open (a `key` that changes
 * with the field and the open count). Without that, opening "Edit" on a second
 * field showed the first field's values, and re-opening after a cancel showed
 * the abandoned draft.
 */
export function FieldDialog({
  open,
  onOpenChange,
  field,
  orderTypeId,
  tenantId,
  tenantSlug,
  existingFields,
  onSuccess,
}: FieldDialogProps) {
  const [isSaving, setIsSaving] = useState(false)
  const [formData, setFormData] = useState({
    preset_id: field ? resolvePresetIdForField(field) : 'text',
    field_name: field?.field_name || '',
    field_label: field?.field_label || '',
    field_type: (field?.field_type || 'text') as CustomerFormField['field_type'],
    is_required: field?.is_required ?? false,
    placeholder: field?.placeholder || '',
    options: Array.isArray(field?.options) ? field.options.join(', ') : '',
  })

  // A reserved preset (delivery address, table number) already on this order
  // type is hidden, unless it is the field currently being edited.
  const availablePresets = getAvailableFieldPresets(existingFields, field?.field_name)
  const selectedPreset = getCheckoutFieldPreset(formData.preset_id)
  const isReservedName = Boolean(selectedPreset?.reservedFieldName)

  const handlePresetChange = (presetId: string) => {
    const defaults = buildFieldFromPreset(presetId)
    setFormData((prev) => {
      const previousPreset = getCheckoutFieldPreset(prev.preset_id)
      // Leaving a reserved preset frees the name the merchant never typed.
      const keptName = previousPreset?.reservedFieldName ? '' : prev.field_name
      return {
        ...prev,
        preset_id: presetId,
        field_type: defaults.field_type,
        field_name: defaults.field_name || keptName,
        field_label: prev.field_label || defaults.field_label,
        placeholder: prev.placeholder || defaults.placeholder,
      }
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)

    try {
      const options = formData.field_type === 'select' && formData.options
        ? formData.options.split(',').map(s => s.trim()).filter(s => s.length > 0)
        : formData.field_type !== 'select' ? undefined : []

      // `field` is the snapshot taken when the dialog opened; `existingFields` is
      // live. Reading the position from the live list means an edit submitted
      // after someone else reordered the form cannot rewrite this field back to
      // where it used to sit.
      const currentIndex = field
        ? existingFields.find((f) => f.id === field.id)?.order_index ?? field.order_index
        : existingFields.length

      const input = {
        field_name: formData.field_name,
        field_label: formData.field_label,
        field_type: formData.field_type,
        is_required: formData.is_required,
        placeholder: formData.placeholder || undefined,
        order_index: currentIndex,
        options,
      }

      const result = field
        ? await updateCustomerFormFieldAction(field.id, tenantId, tenantSlug, orderTypeId, input)
        : await createCustomerFormFieldAction(tenantId, tenantSlug, orderTypeId, input)

      if (result.success) {
        toast.success(field ? 'Field updated' : 'Field added')
        onSuccess(result.data)
      } else {
        toast.error(result.error || 'Failed to save field')
      }
    } catch {
      toast.error('An error occurred')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{field ? 'Edit checkout field' : 'Add checkout field'}</DialogTitle>
          <DialogDescription>
            Customers fill this in when they choose this order type.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="field_type">Field type</Label>
            <Select
              value={formData.preset_id}
              onValueChange={handlePresetChange}
              disabled={!!field && isReservedName}
            >
              <SelectTrigger id="field_type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availablePresets.map((preset) => (
                  <SelectItem key={preset.id} value={preset.id}>
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedPreset?.description && (
              <p className="text-xs text-muted-foreground">{selectedPreset.description}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="field_label">Label customers see</Label>
            <Input
              id="field_label"
              value={formData.field_label}
              onChange={(e) => setFormData({ ...formData, field_label: e.target.value })}
              placeholder="e.g. Full Name"
              required
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="placeholder">
              Placeholder <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="placeholder"
              value={formData.placeholder}
              onChange={(e) => setFormData({ ...formData, placeholder: e.target.value })}
              placeholder="e.g. Enter your name"
            />
            <p className="text-xs text-muted-foreground">Grey hint text shown inside the empty box.</p>
          </div>

          {formData.field_type === 'select' && (
            <div className="space-y-2">
              <Label htmlFor="options">Choices</Label>
              <Input
                id="options"
                value={formData.options}
                onChange={(e) => setFormData({ ...formData, options: e.target.value })}
                placeholder="e.g. Small, Medium, Large"
              />
              <p className="text-xs text-muted-foreground">Separate each choice with a comma.</p>
            </div>
          )}

          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="required">Required</Label>
              <p className="text-xs text-muted-foreground">
                {formData.is_required
                  ? 'Customers cannot check out without filling this in'
                  : 'Customers may leave this blank'}
              </p>
            </div>
            <Switch
              id="required"
              checked={formData.is_required}
              onCheckedChange={(checked) => setFormData({ ...formData, is_required: checked })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="field_name">
              Internal name{' '}
              <span className="font-normal text-muted-foreground">(advanced)</span>
            </Label>
            <Input
              id="field_name"
              value={formData.field_name}
              onChange={(e) => setFormData({ ...formData, field_name: e.target.value })}
              placeholder="e.g. customer_name"
              required
              disabled={!!field || isReservedName}
            />
            <p className="text-xs text-muted-foreground">
              {isReservedName
                ? 'Reserved identifier — the checkout looks for this exact name'
                : field
                  ? 'Fixed once the field exists, so saved orders keep their answers'
                  : 'How the answer is stored. Lowercase with underscores.'}
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? 'Saving…' : field ? 'Save field' : 'Add field'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
