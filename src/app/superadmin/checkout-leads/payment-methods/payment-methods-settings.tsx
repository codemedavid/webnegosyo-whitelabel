'use client'

import { useState } from 'react'
import {
  Plus,
  GripVertical,
  Pencil,
  Trash2,
  QrCode,
  Building2,
  CreditCard,
  Loader2,
  Wallet,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SectionHeader, EmptyState } from '@/components/superadmin/ui/primitives'
import { SimpleImageUpload } from '@/components/shared/simple-image-upload'
import {
  addPlatformPaymentMethod,
  editPlatformPaymentMethod,
  removePlatformPaymentMethod,
  savePlatformPaymentMethodOrder,
} from '@/app/actions/checkout-leads'
import type { PlatformPaymentMethod } from '@/types/database'

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  qr_code: QrCode,
  bank_transfer: Building2,
  other: CreditCard,
}

const TYPE_LABELS: Record<string, string> = {
  qr_code: 'QR Code',
  bank_transfer: 'Bank Transfer',
  other: 'Other',
}

const TYPE_ACCENTS: Record<string, string> = {
  qr_code: 'border-indigo-400/20 bg-indigo-400/10 text-indigo-400',
  bank_transfer: 'border-sky-400/20 bg-sky-400/10 text-sky-400',
  other: 'border-white/10 bg-white/[0.06] text-white/55',
}

interface PaymentMethodsSettingsProps {
  initialMethods: PlatformPaymentMethod[]
}

interface FormState {
  name: string
  type: 'qr_code' | 'bank_transfer' | 'other'
  details: string
  qr_code_url: string
}

const emptyForm: FormState = { name: '', type: 'qr_code', details: '', qr_code_url: '' }

export function PaymentMethodsSettings({ initialMethods }: PaymentMethodsSettingsProps) {
  const [methods, setMethods] = useState(initialMethods)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [isSaving, setIsSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null)

  const activeCount = methods.filter((m) => m.is_active).length

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  function openEdit(method: PlatformPaymentMethod) {
    setEditingId(method.id)
    setForm({
      name: method.name,
      type: method.type,
      details: method.details ?? '',
      qr_code_url: method.qr_code_url ?? '',
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error('Name is required')
      return
    }
    setIsSaving(true)
    try {
      if (editingId) {
        const result = await editPlatformPaymentMethod(editingId, {
          name: form.name,
          type: form.type,
          details: form.details || undefined,
          qr_code_url: form.qr_code_url || null,
        })
        if (result.error) {
          toast.error(result.error)
          return
        }
        setMethods((prev) =>
          prev.map((m) =>
            m.id === editingId
              ? { ...m, name: form.name, type: form.type, details: form.details, qr_code_url: form.qr_code_url || null }
              : m
          )
        )
        toast.success('Payment method updated')
      } else {
        const result = await addPlatformPaymentMethod({
          name: form.name,
          type: form.type,
          details: form.details || undefined,
          qr_code_url: form.qr_code_url || undefined,
        })
        if (result.error) {
          toast.error(result.error)
          return
        }
        if (result.data) {
          setMethods((prev) => [...prev, result.data!])
          toast.success('Payment method added')
        }
      }
      setDialogOpen(false)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      const result = await removePlatformPaymentMethod(id)
      if (result.error) {
        toast.error(result.error)
        return
      }
      setMethods((prev) => prev.filter((m) => m.id !== id))
      toast.success('Payment method deleted')
    } finally {
      setDeletingId(null)
    }
  }

  async function handleToggleActive(id: string, isActive: boolean) {
    const result = await editPlatformPaymentMethod(id, { is_active: isActive })
    if (result.error) {
      toast.error(result.error)
      return
    }
    setMethods((prev) => prev.map((m) => (m.id === id ? { ...m, is_active: isActive } : m)))
  }

  function handleDragStart(idx: number) {
    setDraggedIdx(idx)
  }

  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault()
    if (draggedIdx === null || draggedIdx === idx) return
    const reordered = [...methods]
    const [moved] = reordered.splice(draggedIdx, 1)
    reordered.splice(idx, 0, moved)
    setMethods(reordered)
    setDraggedIdx(idx)
  }

  async function handleDragEnd() {
    setDraggedIdx(null)
    const orderedIds = methods.map((m) => m.id)
    const result = await savePlatformPaymentMethodOrder(orderedIds)
    if (result.error) toast.error(result.error)
  }

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
        <div className="border-b border-white/10 p-5">
          <SectionHeader
            icon={Wallet}
            title="Payment methods"
            subtitle={
              methods.length === 0
                ? 'Shown to customers at checkout'
                : `${methods.length} configured · ${activeCount} active · drag to reorder`
            }
            action={
              <Button size="sm" onClick={openCreate}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add Method
              </Button>
            }
          />
        </div>

        {methods.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="No payment methods yet"
            description="Add one to display it on the checkout page."
            action={
              <Button size="sm" onClick={openCreate}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add Method
              </Button>
            }
          />
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {methods.map((method, idx) => {
              const Icon = TYPE_ICONS[method.type] ?? CreditCard
              const isDragging = draggedIdx === idx
              return (
                <div
                  key={method.id}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-white/[0.04] ${
                    !method.is_active ? 'opacity-50' : ''
                  } ${isDragging ? 'bg-white/[0.04]' : ''}`}
                >
                  <button
                    type="button"
                    className="cursor-grab text-white/30 transition-colors hover:text-white/60 active:cursor-grabbing"
                    aria-label={`Reorder ${method.name}`}
                  >
                    <GripVertical className="h-4 w-4" />
                  </button>

                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
                    <Icon className="h-5 w-5 text-white" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-white">{method.name}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                          TYPE_ACCENTS[method.type] ?? TYPE_ACCENTS.other
                        }`}
                      >
                        {TYPE_LABELS[method.type]}
                      </span>
                      {method.details && (
                        <span className="truncate text-xs text-white/40">{method.details}</span>
                      )}
                    </div>
                  </div>

                  {method.qr_code_url && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={method.qr_code_url}
                      alt=""
                      className="hidden h-10 w-10 shrink-0 rounded-lg border border-white/10 object-contain sm:block"
                    />
                  )}

                  <Switch
                    checked={method.is_active}
                    onCheckedChange={(checked) => handleToggleActive(method.id, checked)}
                    aria-label={`Toggle ${method.name} active`}
                  />

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEdit(method)}
                    aria-label={`Edit ${method.name}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(method.id)}
                    disabled={deletingId === method.id}
                    aria-label={`Delete ${method.name}`}
                  >
                    {deletingId === method.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5 text-red-400" />
                    )}
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="border-white/10">
          <DialogHeader>
            <DialogTitle className="text-white">
              {editingId ? 'Edit payment method' : 'Add payment method'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label className="text-white/70">Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. GCash, BPI Bank Transfer"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-white/70">Type</Label>
              <Select
                value={form.type}
                onValueChange={(val) => setForm((f) => ({ ...f, type: val as FormState['type'] }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="qr_code">QR Code</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-white/70">Account Details</Label>
              <Textarea
                value={form.details}
                onChange={(e) => setForm((f) => ({ ...f, details: e.target.value }))}
                placeholder="Account name, account number, instructions…"
                rows={3}
              />
            </div>

            {form.type === 'qr_code' && (
              <SimpleImageUpload
                currentImageUrl={form.qr_code_url}
                onImageUploaded={(url) => setForm((f) => ({ ...f, qr_code_url: url }))}
                folder="platform-payment-qr"
                label="QR Code Image"
                description="Upload the QR code image for this payment method"
              />
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isSaving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : editingId ? (
                  'Save Changes'
                ) : (
                  'Add Payment Method'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
