'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { saveVoucherAction } from '@/app/actions/voucher-admin'
import {
  normalizeVoucherCode,
  validateVoucherDraft,
  type VoucherDraft,
} from '@/lib/vouchers/admin-validation'
import type { Voucher, VoucherChannel, VoucherDiscountType, VoucherScope } from '@/lib/vouchers/types'

interface VoucherFormProps {
  tenantId: string
  /** Null when creating. */
  voucher: Voucher | null
  onSaved: () => void
  onCancel: () => void
}

const DISCOUNT_TYPES: Array<{ value: VoucherDiscountType; label: string }> = [
  { value: 'percent', label: 'Percentage off' },
  { value: 'fixed', label: 'Peso amount off' },
  { value: 'free_delivery', label: 'Free delivery' },
]

const SCOPES: Array<{ value: VoucherScope; label: string; hint: string }> = [
  { value: 'universal', label: 'Whole order', hint: 'Applies to everything in the cart' },
  { value: 'products', label: 'Chosen products', hint: 'Only the products you pick' },
  { value: 'categories', label: 'Chosen categories', hint: 'Only items in the categories you pick' },
]

const CHANNELS: Array<{ value: VoucherChannel; label: string }> = [
  { value: 'checkout', label: 'Online checkout' },
  { value: 'pos', label: 'Counter (POS)' },
  { value: 'admin', label: 'Admin' },
]

function toDraft(voucher: Voucher | null): VoucherDraft {
  if (!voucher) {
    return {
      code: '',
      name: '',
      discountType: 'percent',
      discountValue: 10,
      scope: 'universal',
      isStackable: false,
      channels: ['checkout', 'pos'],
    }
  }

  return {
    code: voucher.code,
    name: voucher.name,
    discountType: voucher.discountType,
    discountValue: voucher.discountValue,
    maxDiscountAmount: voucher.maxDiscountAmount ?? null,
    minOrderAmount: voucher.minOrderAmount ?? null,
    scope: voucher.scope,
    targetIds: voucher.targetIds ?? [],
    isStackable: voucher.isStackable,
    usageLimitTotal: voucher.usageLimitTotal ?? null,
    usageLimitPerCustomer: voucher.usageLimitPerCustomer ?? null,
    startsAt: voucher.startsAt ?? null,
    endsAt: voucher.endsAt ?? null,
    channels: voucher.channels,
  }
}

/** Empty input means "no limit", which is not the same as zero. */
function toNullableNumber(raw: string): number | null {
  if (raw.trim() === '') return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

export function VoucherForm({ tenantId, voucher, onSaved, onCancel }: VoucherFormProps) {
  const [draft, setDraft] = useState<VoucherDraft>(() => toDraft(voucher))
  const [isSaving, setIsSaving] = useState(false)
  const [hasSubmitted, setHasSubmitted] = useState(false)

  const { errors, warnings } = useMemo(() => validateVoucherDraft(draft), [draft])
  const errorFor = (field: string) => errors.find((e) => e.field === field)?.message

  const update = (patch: Partial<VoucherDraft>) => setDraft((prev) => ({ ...prev, ...patch }))

  const handleSave = async () => {
    setHasSubmitted(true)
    if (errors.length > 0) {
      toast.error('Please fix the highlighted fields.')
      return
    }

    setIsSaving(true)
    const result = await saveVoucherAction(tenantId, draft, voucher?.id)
    setIsSaving(false)

    if (!result.success) {
      toast.error(result.error ?? 'Could not save the voucher')
      return
    }

    toast.success(voucher ? 'Voucher updated' : 'Voucher created')
    onSaved()
  }

  const showError = (field: string) => (hasSubmitted ? errorFor(field) : undefined)

  return (
    <div className="max-w-2xl space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="voucher-code">Code</Label>
          <Input
            id="voucher-code"
            value={draft.code}
            placeholder="SAVE10"
            className="font-mono"
            onChange={(e) => update({ code: normalizeVoucherCode(e.target.value) })}
          />
          <FieldError message={showError('code')} />
        </div>

        <div>
          <Label htmlFor="voucher-name">Name</Label>
          <Input
            id="voucher-name"
            value={draft.name}
            placeholder="Launch week promo"
            onChange={(e) => update({ name: e.target.value })}
          />
          <FieldError message={showError('name')} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="voucher-type">Discount</Label>
          <select
            id="voucher-type"
            className="w-full h-10 rounded-md border border-gray-300 px-3 text-sm"
            value={draft.discountType}
            onChange={(e) => update({ discountType: e.target.value as VoucherDiscountType })}
          >
            {DISCOUNT_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        {draft.discountType !== 'free_delivery' && (
          <div>
            <Label htmlFor="voucher-value">
              {draft.discountType === 'percent' ? 'Percent off' : 'Pesos off'}
            </Label>
            <Input
              id="voucher-value"
              type="number"
              value={draft.discountValue}
              onChange={(e) => update({ discountValue: Number(e.target.value) })}
            />
            <FieldError message={showError('discountValue')} />
          </div>
        )}
      </div>

      {draft.discountType === 'percent' && (
        <div>
          <Label htmlFor="voucher-cap">Maximum discount (optional)</Label>
          <Input
            id="voucher-cap"
            type="number"
            placeholder="No cap"
            value={draft.maxDiscountAmount ?? ''}
            onChange={(e) => update({ maxDiscountAmount: toNullableNumber(e.target.value) })}
          />
          {warnings
            .filter((w) => w.field === 'maxDiscountAmount')
            .map((w) => (
              <p key={w.message} className="mt-1 flex items-start gap-1.5 text-sm text-amber-700">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                {w.message}
              </p>
            ))}
        </div>
      )}

      <fieldset>
        <legend className="text-sm font-medium text-gray-900">Applies to</legend>
        <div className="mt-2 space-y-2">
          {SCOPES.map((scope) => (
            <label key={scope.value} className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="voucher-scope"
                className="mt-1"
                checked={draft.scope === scope.value}
                onChange={() => update({ scope: scope.value, targetIds: [] })}
              />
              <span>
                <span className="font-medium text-gray-900">{scope.label}</span>
                <span className="block text-gray-600">{scope.hint}</span>
              </span>
            </label>
          ))}
        </div>
        <FieldError message={showError('targetIds')} />
        {draft.scope !== 'universal' && (
          // Deliberately not a picker yet: the engine reads an empty target
          // list as "matches nothing", and validation blocks saving one, so a
          // half-built picker would be worse than none.
          <p className="mt-2 text-sm text-gray-600">
            Product and category pickers are not built yet — use a whole-order voucher
            for now.
          </p>
        )}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="voucher-min">Minimum order (optional)</Label>
          <Input
            id="voucher-min"
            type="number"
            placeholder="No minimum"
            value={draft.minOrderAmount ?? ''}
            onChange={(e) => update({ minOrderAmount: toNullableNumber(e.target.value) })}
          />
          <FieldError message={showError('minOrderAmount')} />
        </div>

        <div>
          <Label htmlFor="voucher-limit">Total uses (optional)</Label>
          <Input
            id="voucher-limit"
            type="number"
            placeholder="Unlimited"
            value={draft.usageLimitTotal ?? ''}
            onChange={(e) => update({ usageLimitTotal: toNullableNumber(e.target.value) })}
          />
          <FieldError message={showError('usageLimitTotal')} />
        </div>

        <div>
          <Label htmlFor="voucher-per-customer">Uses per customer (optional)</Label>
          <Input
            id="voucher-per-customer"
            type="number"
            placeholder="Unlimited"
            value={draft.usageLimitPerCustomer ?? ''}
            onChange={(e) => update({ usageLimitPerCustomer: toNullableNumber(e.target.value) })}
          />
          <FieldError message={showError('usageLimitPerCustomer')} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="voucher-starts">Starts (optional)</Label>
          <Input
            id="voucher-starts"
            type="datetime-local"
            value={draft.startsAt?.slice(0, 16) ?? ''}
            onChange={(e) =>
              update({ startsAt: e.target.value ? new Date(e.target.value).toISOString() : null })
            }
          />
        </div>
        <div>
          <Label htmlFor="voucher-ends">Ends (optional)</Label>
          <Input
            id="voucher-ends"
            type="datetime-local"
            value={draft.endsAt?.slice(0, 16) ?? ''}
            onChange={(e) =>
              update({ endsAt: e.target.value ? new Date(e.target.value).toISOString() : null })
            }
          />
          <FieldError message={showError('endsAt')} />
        </div>
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-gray-900">Where it can be used</legend>
        <div className="mt-2 flex flex-wrap gap-4">
          {CHANNELS.map((channel) => (
            <label key={channel.value} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.channels?.includes(channel.value) ?? false}
                onChange={(e) => {
                  const current = new Set(draft.channels ?? [])
                  if (e.target.checked) current.add(channel.value)
                  else current.delete(channel.value)
                  update({ channels: [...current] })
                }}
              />
              {channel.label}
            </label>
          ))}
        </div>
        <FieldError message={showError('channels')} />
      </fieldset>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={draft.isStackable}
          onChange={(e) => update({ isStackable: e.target.checked })}
        />
        <span>
          <span className="font-medium text-gray-900">Can be combined with other codes</span>
          <span className="block text-gray-600">
            Leave off to make this code refuse to share an order. Combined codes apply in
            turn — the second discounts what the first left.
          </span>
        </span>
      </label>

      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Saving…' : voucher ? 'Save changes' : 'Create voucher'}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="mt-1 text-sm text-red-600">{message}</p>
}
