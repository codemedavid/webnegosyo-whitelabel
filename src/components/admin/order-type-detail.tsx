'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  CalendarClock,
  Coins,
  Globe,
  MessageCircle,
  Monitor,
  Percent,
  ReceiptText,
  Settings2,
  Store,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  updateOrderTypeAction,
  deleteCustomerFormFieldAction,
  reorderCustomerFormFieldsAction,
} from '@/app/actions/order-types'
import { toast } from 'sonner'
import { formatLeadTime } from '@/lib/advance-order-utils'
import { ORDER_TYPE_KIND_LABELS } from '@/lib/order-types/order-type-kinds'
import {
  applyMarkup,
  MARKUP_PERCENT_MAX,
  MARKUP_PERCENT_MIN,
} from '@/lib/order-types/order-type-pricing'
import {
  buildOrderTypeFormState,
  orderTypeFormSignature,
  parseMarkupPercent,
  toOrderTypeUpdateInput,
  type OrderTypeFormState,
} from '@/lib/order-types/order-type-form-state'
import { ORDER_TYPE_ACCENTS } from '@/lib/order-types/order-type-accents'
import { OrderTypePricingPanel } from '@/components/admin/order-type-pricing-panel'
import { SettingsSection, ToggleRow, Field } from '@/components/admin/order-types/settings-section'
import { CheckoutFieldsSection } from '@/components/admin/order-types/checkout-fields-section'
import { CheckoutPreview } from '@/components/admin/order-types/checkout-preview'
import { SaveBar } from '@/components/admin/order-types/save-bar'
import { FieldDialog } from '@/components/admin/order-types/field-dialog'
import type { PricingMenuItem } from '@/lib/order-type-pricing-service'
import type { OrderType, CustomerFormField, OrderTypeItemPrice } from '@/types/database'

export { FieldDialog }

interface OrderTypeDetailProps {
  orderType: OrderType & { customer_form_fields: CustomerFormField[] }
  tenantSlug: string
  tenantId: string
  /** Lean menu for the POS pricing panel; omitted = the panel shows its empty state. */
  menuItems?: readonly PricingMenuItem[]
  initialPrices?: readonly OrderTypeItemPrice[]
}

const MARKUP_PREVIEW_BASE = 100
const KEEP_ONE_CHANNEL_MESSAGE = 'Keep at least one channel on'

type AvailabilityChannel = 'available_on_web' | 'available_on_pos'

function formatPesoShort(amount: number): string {
  return Number.isInteger(amount) ? `₱${amount}` : `₱${amount.toFixed(2)}`
}

function describeMarkup(raw: string): string {
  const percent = parseMarkupPercent(raw)
  if (percent === null) return 'Blank — the register charges the store price.'
  return `${formatPesoShort(MARKUP_PREVIEW_BASE)} becomes ${formatPesoShort(
    applyMarkup(MARKUP_PREVIEW_BASE, percent)
  )} on the register.`
}

function sortByOrderIndex(fields: readonly CustomerFormField[]): CustomerFormField[] {
  return [...fields].sort((a, b) => a.order_index - b.order_index)
}

/** Ids only — enough to know whether the server's field list differs from ours. */
function fieldsSignature(fields: readonly CustomerFormField[]): string {
  return JSON.stringify(
    fields.map((f) => [f.id, f.field_label, f.field_type, f.is_required, f.placeholder ?? '', f.order_index])
  )
}

export function OrderTypeDetail({
  orderType,
  tenantSlug,
  tenantId,
  menuItems = [],
  initialPrices = [],
}: OrderTypeDetailProps) {
  const router = useRouter()
  const accent = ORDER_TYPE_ACCENTS[orderType.type]

  // ---- Settings form -------------------------------------------------------
  //
  // State is seeded from the server row AND resynced whenever that row actually
  // changes. Comparing signatures rather than object identity is what makes the
  // resync safe: an RSC re-render hands back a fresh object every time, so
  // resetting on identity would wipe whatever the merchant is mid-way through
  // typing. Without the resync at all — the old behaviour — a save landed on the
  // server and the screen kept showing the pre-save values forever.

  const serverState = useMemo(() => buildOrderTypeFormState(orderType), [orderType])
  const serverSignature = orderTypeFormSignature(serverState)

  const [formData, setFormData] = useState<OrderTypeFormState>(serverState)
  const [savedState, setSavedState] = useState<OrderTypeFormState>(serverState)
  const appliedSignatureRef = useRef(serverSignature)

  const isDirty = orderTypeFormSignature(formData) !== orderTypeFormSignature(savedState)

  useEffect(() => {
    if (serverSignature === appliedSignatureRef.current) return
    // A dirty form is the merchant's unsaved work. Someone else saving this
    // order type from another tab or device must not silently retype it out
    // from under them — the ref stays where it is, so the moment they save or
    // discard, this runs again and they get the current truth.
    if (isDirty) return
    appliedSignatureRef.current = serverSignature
    const next = JSON.parse(serverSignature) as OrderTypeFormState
    setFormData(next)
    setSavedState(next)
  }, [serverSignature, isDirty])
  const [isSaving, setIsSaving] = useState(false)

  const patch = useCallback((changes: Partial<OrderTypeFormState>) => {
    setFormData((prev) => ({ ...prev, ...changes }))
  }, [])

  // ---- Checkout fields -----------------------------------------------------
  //
  // Same resync, so a field added, edited, or deleted in the dialog shows up the
  // moment the server confirms it instead of on the next hard reload.

  const serverFields = useMemo(
    () => sortByOrderIndex(orderType.customer_form_fields),
    [orderType.customer_form_fields]
  )
  const [formFields, setFormFields] = useState<CustomerFormField[]>(serverFields)
  const appliedFieldsRef = useRef(fieldsSignature(serverFields))

  useEffect(() => {
    const signature = fieldsSignature(serverFields)
    if (signature === appliedFieldsRef.current) return
    appliedFieldsRef.current = signature
    setFormFields(serverFields)
  }, [serverFields])

  /*
   * Field writes are serialised. A reorder sends the WHOLE order as an absolute
   * array, so two overlapping calls race: whichever lands last wins and silently
   * undoes part of what the merchant just did, with both calls reporting
   * success. Serialising also makes the snapshot reverts below correct — a
   * revert can only ever undo its own operation.
   */
  const [isWritingFields, setIsWritingFields] = useState(false)
  const [fieldDialogOpen, setFieldDialogOpen] = useState(false)
  const [editingField, setEditingField] = useState<CustomerFormField | null>(null)
  // Bumped on every open so the dialog remounts and re-reads the field it was
  // handed — a mounted-once dialog kept showing the first field it ever saw.
  const [dialogInstance, setDialogInstance] = useState(0)
  const [fieldToDelete, setFieldToDelete] = useState<CustomerFormField | null>(null)

  const openFieldDialog = (field: CustomerFormField | null) => {
    setEditingField(field)
    setDialogInstance((n) => n + 1)
    setFieldDialogOpen(true)
  }

  const handleFieldSaved = (saved?: CustomerFormField) => {
    setFieldDialogOpen(false)
    // Show the row straight away; the refresh below only confirms it.
    if (saved?.id) {
      setFormFields((prev) => {
        const without = prev.filter((f) => f.id !== saved.id)
        return sortByOrderIndex([...without, saved])
      })
    }
    router.refresh()
  }

  const handleDeleteField = async () => {
    if (!fieldToDelete || isWritingFields) return
    const target = fieldToDelete
    const previous = formFields

    // Optimistic: the row disappears on tap, and comes back if the server refuses.
    setFormFields((prev) => prev.filter((f) => f.id !== target.id))
    setFieldToDelete(null)
    setIsWritingFields(true)

    const result = await deleteCustomerFormFieldAction(
      target.id,
      tenantId,
      tenantSlug,
      orderType.id
    )
    setIsWritingFields(false)

    if (result.success) {
      toast.success(`"${target.field_label}" removed`)
      router.refresh()
    } else {
      setFormFields(previous)
      toast.error(result.error || 'Failed to delete field')
    }
  }

  const handleMoveField = async (fieldId: string, direction: 'up' | 'down') => {
    if (isWritingFields) return
    const currentIndex = formFields.findIndex((f) => f.id === fieldId)
    if (currentIndex === -1) return

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    if (newIndex < 0 || newIndex >= formFields.length) return

    const previous = formFields
    const reordered = [...formFields]
    const [moved] = reordered.splice(currentIndex, 1)
    reordered.splice(newIndex, 0, moved)

    // Move first, confirm after — an arrow tap that waits on a round trip reads
    // as a dead button.
    setFormFields(reordered.map((field, index) => ({ ...field, order_index: index })))
    setIsWritingFields(true)

    const result = await reorderCustomerFormFieldsAction(
      reordered.map((f) => f.id),
      tenantId,
      tenantSlug,
      orderType.id
    )
    setIsWritingFields(false)

    if (result.success) {
      router.refresh()
    } else {
      setFormFields(previous)
      toast.error(result.error || 'Failed to reorder fields')
    }
  }

  // ---- Save ----------------------------------------------------------------

  const handleToggleChannel = (channel: AvailabilityChannel, checked: boolean) => {
    const other: AvailabilityChannel =
      channel === 'available_on_web' ? 'available_on_pos' : 'available_on_web'
    // The DB refuses a row hidden from both channels; refuse here first, in words.
    if (!checked && !formData[other]) {
      toast.warning(KEEP_ONE_CHANNEL_MESSAGE)
      return
    }
    patch({ [channel]: checked } as Partial<OrderTypeFormState>)
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const result = await updateOrderTypeAction(
        orderType.id,
        tenantId,
        tenantSlug,
        toOrderTypeUpdateInput(formData, {
          type: orderType.type,
          order_index: orderType.order_index,
        })
      )

      if (result.success) {
        toast.success('Saved')
        setSavedState(formData)
        appliedSignatureRef.current = orderTypeFormSignature(formData)
        router.refresh()
      } else {
        toast.error(result.error || 'Failed to update order type')
      }
    } catch {
      toast.error('An error occurred')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDiscard = () => {
    setFormData(savedState)
  }

  // ---- Derived labels ------------------------------------------------------

  const markupPercent = parseMarkupPercent(formData.pos_markup_percent)

  const serviceChargeLabel = formData.service_charge_enabled
    ? formData.service_charge_type === 'percentage'
      ? `${formData.service_charge_value}%`
      : formatPesoShort(formData.service_charge_value)
    : null

  const minimumOrderLabel =
    formData.minimum_order_amount > 0 ? formatPesoShort(formData.minimum_order_amount) : null

  return (
    <div className="pb-4">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-xl ${accent.tile}`}
            aria-hidden="true"
          >
            {accent.emoji}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold leading-tight sm:text-3xl">
              {formData.name || 'Untitled order type'}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className={accent.badge}>
                {ORDER_TYPE_KIND_LABELS[orderType.type]}
              </Badge>
              <Badge variant={formData.is_enabled ? 'secondary' : 'outline'}>
                {formData.is_enabled ? 'Live' : 'Hidden'}
              </Badge>
              {formData.available_on_web && (
                <Badge variant="outline" className="font-normal">
                  <Globe className="mr-1 h-3 w-3" />
                  Web
                </Badge>
              )}
              {formData.available_on_pos && (
                <Badge variant="outline" className="font-normal">
                  <Monitor className="mr-1 h-3 w-3" />
                  Register
                </Badge>
              )}
              {formData.advance_order_enabled && (
                <Badge variant="outline" className="font-normal">
                  <CalendarClock className="mr-1 h-3 w-3" />
                  Pre-order
                </Badge>
              )}
            </div>
          </div>
        </div>

        <Link href={`/${tenantSlug}/admin/order-types`}>
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            All order types
          </Button>
        </Link>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Settings */}
        <div className="space-y-6">
          <SettingsSection
            id="basics"
            title="Basics"
            description="How this option is named and explained at checkout."
            icon={Settings2}
          >
            <Field id="name" label="Name" hint="What customers tap to pick this option.">
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder="e.g. Dine In"
              />
            </Field>

            <Field
              id="description"
              label="Description"
              optional
              hint="One line under the name explaining the option."
            >
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => patch({ description: e.target.value })}
                placeholder="e.g. Enjoy your meal at our restaurant"
                rows={2}
              />
            </Field>

            <Field
              id="note"
              label="Policy note"
              optional
              hint="Highlighted warning shown before the customer commits — extra charges, cut-off times, anything they should not be surprised by."
            >
              <Textarea
                id="note"
                value={formData.note}
                onChange={(e) => patch({ note: e.target.value })}
                placeholder="e.g. Additional ₱30 box charge applies"
                rows={2}
              />
            </Field>
          </SettingsSection>

          <SettingsSection
            id="availability"
            title="Where it is offered"
            description="Turn it off entirely, or hide it from one channel. At least one channel stays on."
            icon={Store}
          >
            <ToggleRow
              id="enabled"
              label="Enabled"
              hint={
                formData.is_enabled
                  ? 'Customers and cashiers can choose this order type'
                  : 'Hidden everywhere — nobody can place this kind of order'
              }
              checked={formData.is_enabled}
              onCheckedChange={(checked) => patch({ is_enabled: checked })}
            />

            <ToggleRow
              id="available_on_web"
              label="Available on web"
              icon={Globe}
              hint={
                formData.available_on_web
                  ? 'Customers can pick it on the online storefront and app'
                  : 'Hidden from online ordering'
              }
              checked={formData.available_on_web}
              onCheckedChange={(checked) => handleToggleChannel('available_on_web', checked)}
            />

            <ToggleRow
              id="available_on_pos"
              label="Available on POS"
              icon={Monitor}
              hint={
                formData.available_on_pos
                  ? 'Cashiers can ring it up on the register'
                  : 'Hidden from the register'
              }
              checked={formData.available_on_pos}
              onCheckedChange={(checked) => handleToggleChannel('available_on_pos', checked)}
            />
          </SettingsSection>

          <SettingsSection
            id="checkout-behaviour"
            title="Checkout behaviour"
            description="What happens after the customer taps the final button."
            icon={MessageCircle}
          >
            <ToggleRow
              id="messenger_enabled"
              label="Send via Messenger"
              icon={MessageCircle}
              hint={
                formData.messenger_enabled
                  ? 'Checkout hands the order off to Facebook Messenger'
                  : 'Checkout completes the order in place — the button reads "Complete Order"'
              }
              checked={formData.messenger_enabled}
              onCheckedChange={(checked) => patch({ messenger_enabled: checked })}
            />

            <ToggleRow
              id="after_billing_payment_enabled"
              label="Pay after billing"
              icon={ReceiptText}
              hint={
                formData.after_billing_payment_enabled
                  ? 'Customers pick a method and order right away — payment details are skipped and the bill is settled after service'
                  : 'Customers see payment details (account numbers, QR, proof) before placing the order'
              }
              checked={formData.after_billing_payment_enabled}
              onCheckedChange={(checked) => patch({ after_billing_payment_enabled: checked })}
            />
          </SettingsSection>

          <SettingsSection
            id="charges"
            title="Charges and limits"
            description="What this order type adds to the bill, and the smallest order it accepts."
            icon={Coins}
          >
            <ToggleRow
              id="service_charge_enabled"
              label="Service charge"
              hint={
                formData.service_charge_enabled
                  ? `${serviceChargeLabel} added to every ${formData.name || 'order'}`
                  : 'No service charge on this order type'
              }
              checked={formData.service_charge_enabled}
              onCheckedChange={(checked) => patch({ service_charge_enabled: checked })}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="service_charge_type" label="Charge type">
                  <Select
                    value={formData.service_charge_type}
                    onValueChange={(value: 'percentage' | 'fixed') =>
                      patch({ service_charge_type: value })
                    }
                  >
                    <SelectTrigger id="service_charge_type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage (%)</SelectItem>
                      <SelectItem value="fixed">Fixed amount (₱)</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>

                <Field
                  id="service_charge_value"
                  label={formData.service_charge_type === 'percentage' ? 'Percentage (%)' : 'Amount (₱)'}
                  hint={
                    formData.service_charge_type === 'percentage'
                      ? `Added to the subtotal — ₱1,000 becomes ${formatPesoShort(
                          1000 + (1000 * (Number(formData.service_charge_value) || 0)) / 100
                        )}`
                      : 'Added once per order'
                  }
                >
                  <Input
                    id="service_charge_value"
                    type="number"
                    min="0"
                    max={formData.service_charge_type === 'percentage' ? '100' : undefined}
                    step="0.01"
                    inputMode="decimal"
                    value={formData.service_charge_value}
                    onChange={(e) =>
                      patch({ service_charge_value: parseFloat(e.target.value) || 0 })
                    }
                    placeholder={formData.service_charge_type === 'percentage' ? 'e.g. 10' : 'e.g. 50'}
                  />
                </Field>
              </div>
            </ToggleRow>

            <Field
              id="minimum_order_amount"
              label="Minimum order (₱)"
              hint={
                formData.minimum_order_amount > 0
                  ? `Customers must reach ${formatPesoShort(
                      formData.minimum_order_amount
                    )} before they can check out with ${formData.name || 'this order type'}.`
                  : '0 means no minimum — customers can check out with any amount.'
              }
            >
              <Input
                id="minimum_order_amount"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={formData.minimum_order_amount}
                onChange={(e) => patch({ minimum_order_amount: parseFloat(e.target.value) || 0 })}
                placeholder="e.g. 500"
              />
            </Field>
          </SettingsSection>

          <SettingsSection
            id="scheduling"
            title="Scheduling"
            description="Let customers book this order type for a later time."
            icon={CalendarClock}
          >
            <ToggleRow
              id="advance_order_enabled"
              label="Advance orders"
              icon={CalendarClock}
              hint={
                formData.advance_order_enabled
                  ? 'Customers pick a date and time at checkout'
                  : 'Orders are placed for right now only'
              }
              checked={formData.advance_order_enabled}
              onCheckedChange={(checked) => patch({ advance_order_enabled: checked })}
            >
              <ToggleRow
                id="advance_order_allow_asap"
                label="Allow ASAP orders"
                hint={
                  formData.advance_order_allow_asap
                    ? 'Customers can order now or schedule for later'
                    : 'Schedule-only — no immediate orders (e.g. catering)'
                }
                checked={formData.advance_order_allow_asap}
                onCheckedChange={(checked) => patch({ advance_order_allow_asap: checked })}
              />

              <div className="grid gap-4 sm:grid-cols-3">
                <Field
                  id="advance_order_lead_time_minutes"
                  label="Lead time"
                  hint={`Earliest slot: ${formatLeadTime(
                    formData.advance_order_lead_time_minutes
                  )} from now`}
                >
                  <Input
                    id="advance_order_lead_time_minutes"
                    type="number"
                    min="0"
                    max="10080"
                    step="5"
                    inputMode="numeric"
                    value={formData.advance_order_lead_time_minutes}
                    onChange={(e) =>
                      patch({ advance_order_lead_time_minutes: Number(e.target.value) || 0 })
                    }
                  />
                </Field>

                <Field
                  id="advance_order_max_days_ahead"
                  label="Days ahead"
                  hint="How far out a slot can be booked"
                >
                  <Input
                    id="advance_order_max_days_ahead"
                    type="number"
                    min="0"
                    max="60"
                    step="1"
                    inputMode="numeric"
                    value={formData.advance_order_max_days_ahead}
                    onChange={(e) =>
                      patch({ advance_order_max_days_ahead: Number(e.target.value) || 0 })
                    }
                  />
                </Field>

                <Field
                  id="advance_order_slot_interval_minutes"
                  label="Slot spacing"
                  hint="Minutes between selectable times"
                >
                  <Input
                    id="advance_order_slot_interval_minutes"
                    type="number"
                    min="5"
                    max="240"
                    step="5"
                    inputMode="numeric"
                    value={formData.advance_order_slot_interval_minutes}
                    onChange={(e) =>
                      patch({ advance_order_slot_interval_minutes: Number(e.target.value) || 0 })
                    }
                  />
                </Field>
              </div>
            </ToggleRow>
          </SettingsSection>

          <SettingsSection
            id="pos-pricing"
            title="Register pricing"
            description="Register only. Web and app orders always use store prices."
            icon={Percent}
          >
            <Field
              id="pos_markup_percent"
              label="POS markup (%)"
              optional
              hint={`${describeMarkup(
                formData.pos_markup_percent
              )} Applies to base prices and add-ons; exact prices below replace the base only.`}
            >
              <Input
                id="pos_markup_percent"
                type="number"
                min={MARKUP_PERCENT_MIN}
                max={MARKUP_PERCENT_MAX}
                step="0.01"
                inputMode="decimal"
                value={formData.pos_markup_percent}
                onChange={(e) => patch({ pos_markup_percent: e.target.value })}
                placeholder="Leave blank for store price"
              />
            </Field>
          </SettingsSection>

          <CheckoutFieldsSection
            fields={formFields}
            onAdd={() => openFieldDialog(null)}
            onEdit={(field) => openFieldDialog(field)}
            onDelete={(field) => setFieldToDelete(field)}
            onMove={handleMoveField}
            isBusy={isWritingFields}
          />

          <OrderTypePricingPanel
            tenantId={tenantId}
            tenantSlug={tenantSlug}
            orderTypeId={orderType.id}
            markupPercent={markupPercent}
            menuItems={menuItems}
            initialPrices={initialPrices}
          />
        </div>

        {/* Live preview */}
        <div className="lg:sticky lg:top-6">
          <CheckoutPreview
            orderTypeName={formData.name}
            note={formData.note}
            fields={formFields}
            serviceChargeLabel={serviceChargeLabel}
            minimumOrderLabel={minimumOrderLabel}
          />
        </div>
      </div>

      <SaveBar
        isDirty={isDirty}
        isSaving={isSaving}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />

      <FieldDialog
        key={`${editingField?.id ?? 'new'}-${dialogInstance}`}
        open={fieldDialogOpen}
        onOpenChange={setFieldDialogOpen}
        field={editingField}
        orderTypeId={orderType.id}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        existingFields={formFields}
        onSuccess={handleFieldSaved}
      />

      <AlertDialog
        open={fieldToDelete !== null}
        onOpenChange={(open) => !open && setFieldToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove &ldquo;{fieldToDelete?.field_label}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              Customers will no longer be asked for this at checkout. Answers already saved on past
              orders are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteField}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove field
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
