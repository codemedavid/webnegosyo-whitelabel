'use client'

import { useState } from 'react'
import { Plus, GripVertical, Pencil, Trash2, QrCode, Building2, CreditCard, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
        if (result.error) { toast.error(result.error); return }
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
        if (result.error) { toast.error(result.error); return }
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
      if (result.error) { toast.error(result.error); return }
      setMethods((prev) => prev.filter((m) => m.id !== id))
      toast.success('Payment method deleted')
    } finally {
      setDeletingId(null)
    }
  }

  async function handleToggleActive(id: string, isActive: boolean) {
    const result = await editPlatformPaymentMethod(id, { is_active: isActive })
    if (result.error) { toast.error(result.error); return }
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
      <div className="rounded-xl border bg-white shadow-sm">
        <div className="flex items-center justify-between border-b p-4">
          <h3 className="font-semibold">Payment Methods</h3>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Method
          </Button>
        </div>

        {methods.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No payment methods yet. Add one to show on the checkout page.
          </div>
        ) : (
          <div className="divide-y">
            {methods.map((method, idx) => {
              const Icon = TYPE_ICONS[method.type] ?? CreditCard
              return (
                <div
                  key={method.id}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center gap-3 px-4 py-3 ${
                    !method.is_active ? 'opacity-50' : ''
                  }`}
                >
                  <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground" />
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
                    <Icon className="h-5 w-5 text-gray-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{method.name}</p>
                    <p className="text-xs text-muted-foreground">{TYPE_LABELS[method.type]}</p>
                  </div>
                  {method.qr_code_url && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={method.qr_code_url} alt="" className="h-10 w-10 rounded border object-contain" />
                  )}
                  <Switch
                    checked={method.is_active}
                    onCheckedChange={(checked) => handleToggleActive(method.id, checked)}
                  />
                  <Button variant="ghost" size="icon" onClick={() => openEdit(method)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(method.id)}
                    disabled={deletingId === method.id}
                  >
                    {deletingId === method.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Payment Method' : 'Add Payment Method'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. GCash, BPI Bank Transfer"
              />
            </div>

            <div className="space-y-2">
              <Label>Type</Label>
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
              <Label>Account Details</Label>
              <Textarea
                value={form.details}
                onChange={(e) => setForm((f) => ({ ...f, details: e.target.value }))}
                placeholder="Account name, account number, instructions..."
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

            <Button onClick={handleSave} disabled={isSaving} className="w-full">
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : editingId ? (
                'Save Changes'
              ) : (
                'Add Payment Method'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
