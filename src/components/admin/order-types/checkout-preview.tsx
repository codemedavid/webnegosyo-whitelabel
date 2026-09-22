'use client'

import { Eye } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { CustomerFormField } from '@/types/database'

interface CheckoutPreviewProps {
  orderTypeName: string
  /** The policy note customers see above the form, if there is one. */
  note: string
  fields: readonly CustomerFormField[]
  serviceChargeLabel: string | null
  minimumOrderLabel: string | null
}

/**
 * What the customer actually sees, rendered from the same state the form edits.
 *
 * The old screen had this too, but parked in the opposite column from the field
 * list and fed by state that never resynced — so it showed a form that no
 * longer existed. It now sits beside the fields and follows every edit.
 */
export function CheckoutPreview({
  orderTypeName,
  note,
  fields,
  serviceChargeLabel,
  minimumOrderLabel,
}: CheckoutPreviewProps) {
  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <Eye className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Customer sees</h2>
      </header>

      <div className="space-y-4 p-4">
        <div>
          <p className="text-sm font-medium">{orderTypeName || 'Untitled order type'}</p>
          {note && (
            <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
              {note}
            </p>
          )}
        </div>

        {fields.length === 0 ? (
          <p className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
            No fields — checkout asks the customer for nothing.
          </p>
        ) : (
          <div className="space-y-3" aria-hidden="true">
            {fields.map((field) => (
              <div key={field.id} className="space-y-1.5">
                <Label className="text-xs">
                  {field.field_label}
                  {field.is_required && <span className="ml-1 text-destructive">*</span>}
                </Label>
                {field.field_type === 'textarea' ? (
                  <Textarea placeholder={field.placeholder || ''} disabled rows={2} />
                ) : field.field_type === 'select' ? (
                  <Select disabled>
                    <SelectTrigger>
                      <SelectValue placeholder={field.placeholder || 'Select an option'} />
                    </SelectTrigger>
                  </Select>
                ) : (
                  <Input
                    type={field.field_type === 'number' ? 'number' : 'text'}
                    placeholder={field.placeholder || ''}
                    disabled
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {(serviceChargeLabel || minimumOrderLabel) && (
          <dl className="space-y-1.5 border-t pt-3 text-xs">
            {minimumOrderLabel && (
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Minimum order</dt>
                <dd className="font-medium">{minimumOrderLabel}</dd>
              </div>
            )}
            {serviceChargeLabel && (
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Service charge</dt>
                <dd className="font-medium">{serviceChargeLabel}</dd>
              </div>
            )}
          </dl>
        )}
      </div>
    </div>
  )
}
