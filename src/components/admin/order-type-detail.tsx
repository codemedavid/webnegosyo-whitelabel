'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Trash2, GripVertical, Eye, EyeOff, Save } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  updateOrderTypeAction,
  createCustomerFormFieldAction,
  updateCustomerFormFieldAction,
  deleteCustomerFormFieldAction,
  reorderCustomerFormFieldsAction,
} from '@/app/actions/order-types'
import { toast } from 'sonner'
import type { OrderType, CustomerFormField } from '@/types/database'

interface OrderTypeDetailProps {
  orderType: OrderType & { customer_form_fields: CustomerFormField[] }
  tenantSlug: string
  tenantId: string
}

const orderTypeColors = {
  dine_in: 'bg-green-100 text-green-800 border-green-300',
  pickup: 'bg-blue-100 text-blue-800 border-blue-300',
  delivery: 'bg-orange-100 text-orange-800 border-orange-300',
}

const fieldTypeLabels = {
  text: 'Text',
  email: 'Email',
  phone: 'Phone',
  textarea: 'Textarea',
  select: 'Select',
  number: 'Number',
}

export function OrderTypeDetail({ orderType, tenantSlug, tenantId }: OrderTypeDetailProps) {
  const router = useRouter()
  const [isSaving, setIsSaving] = useState(false)
  const [deleteFieldDialogOpen, setDeleteFieldDialogOpen] = useState(false)
  const [fieldToDelete, setFieldToDelete] = useState<string | null>(null)
  const [fieldDialogOpen, setFieldDialogOpen] = useState(false)
  const [editingField, setEditingField] = useState<CustomerFormField | null>(null)

  const [formData, setFormData] = useState({
    name: orderType.name,
    description: orderType.description || '',
    is_enabled: orderType.is_enabled,
  })

  const [formFields, setFormFields] = useState<CustomerFormField[]>(
    [...orderType.customer_form_fields].sort((a, b) => a.order_index - b.order_index)
  )

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const result = await updateOrderTypeAction(
        orderType.id,
        tenantId,
        tenantSlug,
        {
          type: orderType.type,
          name: formData.name,
          description: formData.description || undefined,
          is_enabled: formData.is_enabled,
          order_index: orderType.order_index,
        }
      )

      if (result.success) {
        toast.success('Order type updated successfully')
        router.refresh()
      } else {
        toast.error(result.error || 'Failed to update order type')
      }
    } catch (error) {
      toast.error('An error occurred')
    } finally {
      setIsSaving(false)
    }
  }

  const handleAddField = () => {
    setEditingField(null)
    setFieldDialogOpen(true)
  }

  const handleEditField = (field: CustomerFormField) => {
    setEditingField(field)
    setFieldDialogOpen(true)
  }

  const handleDeleteField = async () => {
    if (!fieldToDelete) return

    const result = await deleteCustomerFormFieldAction(
      fieldToDelete,
      tenantId,
      tenantSlug,
      orderType.id
    )

    if (result.success) {
      toast.success('Form field deleted')
      setDeleteFieldDialogOpen(false)
      setFieldToDelete(null)
      router.refresh()
    } else {
      toast.error(result.error || 'Failed to delete field')
    }
  }

  const handleMoveField = async (fieldId: string, direction: 'up' | 'down') => {
    const currentIndex = formFields.findIndex(f => f.id === fieldId)
    if (currentIndex === -1) return

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    if (newIndex < 0 || newIndex >= formFields.length) return

    const newFields = [...formFields]
    const [moved] = newFields.splice(currentIndex, 1)
    newFields.splice(newIndex, 0, moved)

    // Update order_index for all fields
    const fieldIds = newFields.map(f => f.id)

    const result = await reorderCustomerFormFieldsAction(fieldIds, tenantId, tenantSlug)

    if (result.success) {
      setFormFields(newFields)
      toast.success('Field order updated')
      router.refresh()
    } else {
      toast.error(result.error || 'Failed to reorder fields')
    }
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Configure Order Type</h1>
          <p className="text-muted-foreground">Manage order type settings and form fields</p>
        </div>
        <Link href={`/${tenantSlug}/admin/order-types`}>
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Order Type Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Order Type Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <Badge className={orderTypeColors[orderType.type]} variant="outline">
                {orderType.type.replace('_', ' ')}
              </Badge>
              <span className="text-sm text-muted-foreground">Type cannot be changed</span>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Dine In, Pick Up, Delivery"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description shown to customers"
                rows={3}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="enabled">Enabled</Label>
                <p className="text-sm text-muted-foreground">
                  {formData.is_enabled ? 'Visible to customers' : 'Hidden from customers'}
                </p>
              </div>
              <Switch
                id="enabled"
                checked={formData.is_enabled}
                onCheckedChange={(checked) => setFormData({ ...formData, is_enabled: checked })}
              />
            </div>

            <Button onClick={handleSave} disabled={isSaving} className="w-full">
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </CardContent>
        </Card>

        {/* Form Fields Preview */}
        <Card>
          <CardHeader>
            <CardTitle>Customer Form Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 border rounded-lg p-4 bg-muted/50">
              {formFields.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No form fields configured. Add fields below.
                </p>
              ) : (
                formFields.map((field) => (
                  <div key={field.id} className="space-y-2">
                    <Label className="text-sm">
                      {field.field_label}
                      {field.is_required && <span className="text-red-500 ml-1">*</span>}
                    </Label>
                    {field.field_type === 'textarea' ? (
                      <Textarea placeholder={field.placeholder || ''} disabled rows={3} />
                    ) : field.field_type === 'select' && field.options && field.options.length > 0 ? (
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
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Form Fields Management */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Customer Form Fields</CardTitle>
            <Button onClick={handleAddField}>
              <Plus className="mr-2 h-4 w-4" />
              Add Field
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {formFields.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No form fields configured yet.</p>
              <p className="text-sm mt-2">Click "Add Field" to create a form field for this order type.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {formFields.map((field, index) => (
                <div
                  key={field.id}
                  className="flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <GripVertical className="h-5 w-5 cursor-move" />
                    <span className="text-sm font-mono">{index + 1}</span>
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{field.field_label}</span>
                      <Badge variant="outline" className="text-xs">
                        {fieldTypeLabels[field.field_type]}
                      </Badge>
                      {field.is_required && (
                        <Badge variant="outline" className="text-xs bg-red-50 text-red-700">
                          Required
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {field.field_name} {field.placeholder && `• ${field.placeholder}`}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleMoveField(field.id, 'up')}
                      disabled={index === 0}
                      title="Move up"
                    >
                      <ArrowLeft className="h-4 w-4 rotate-90" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleMoveField(field.id, 'down')}
                      disabled={index === formFields.length - 1}
                      title="Move down"
                    >
                      <ArrowLeft className="h-4 w-4 -rotate-90" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEditField(field)}
                      title="Edit"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      onClick={() => {
                        setFieldToDelete(field.id)
                        setDeleteFieldDialogOpen(true)
                      }}
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Field Dialog */}
      <FieldDialog
        open={fieldDialogOpen}
        onOpenChange={setFieldDialogOpen}
        field={editingField}
        orderTypeId={orderType.id}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        existingFields={formFields}
        onSuccess={() => {
          setFieldDialogOpen(false)
          router.refresh()
        }}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteFieldDialogOpen} onOpenChange={setDeleteFieldDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Form Field?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this form field. Customers will no longer see it during checkout.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteField}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// Field Dialog Component
interface FieldDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  field: CustomerFormField | null
  orderTypeId: string
  tenantId: string
  tenantSlug: string
  existingFields: CustomerFormField[]
  onSuccess: () => void
}

function FieldDialog({
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
    field_name: field?.field_name || '',
    field_label: field?.field_label || '',
    field_type: (field?.field_type || 'text') as CustomerFormField['field_type'],
    is_required: field?.is_required ?? false,
    placeholder: field?.placeholder || '',
    options: Array.isArray(field?.options) ? field.options.join(', ') : '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)

    try {
      const options = formData.field_type === 'select' && formData.options
        ? formData.options.split(',').map(s => s.trim()).filter(s => s.length > 0)
        : formData.field_type !== 'select' ? undefined : []

      const input = {
        field_name: formData.field_name,
        field_label: formData.field_label,
        field_type: formData.field_type,
        is_required: formData.is_required,
        placeholder: formData.placeholder || undefined,
        order_index: field?.order_index ?? existingFields.length,
        options,
      }

      let result
      if (field) {
        result = await updateCustomerFormFieldAction(
          field.id,
          tenantId,
          tenantSlug,
          orderTypeId,
          input
        )
      } else {
        result = await createCustomerFormFieldAction(
          tenantId,
          tenantSlug,
          orderTypeId,
          input
        )
      }

      if (result.success) {
        toast.success(field ? 'Field updated' : 'Field created')
        onSuccess()
      } else {
        toast.error(result.error || 'Failed to save field')
      }
    } catch (error) {
      toast.error('An error occurred')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{field ? 'Edit Form Field' : 'Add Form Field'}</DialogTitle>
          <DialogDescription>
            Configure the form field that customers will see during checkout
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="field_name">Field Name (Internal)</Label>
              <Input
                id="field_name"
                value={formData.field_name}
                onChange={(e) => setFormData({ ...formData, field_name: e.target.value })}
                placeholder="e.g., customer_name, delivery_address"
                required
                disabled={!!field}
              />
              <p className="text-xs text-muted-foreground">
                Internal identifier (cannot be changed after creation)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="field_label">Field Label</Label>
              <Input
                id="field_label"
                value={formData.field_label}
                onChange={(e) => setFormData({ ...formData, field_label: e.target.value })}
                placeholder="e.g., Full Name, Delivery Address"
                required
              />
              <p className="text-xs text-muted-foreground">Display label for customers</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="field_type">Field Type</Label>
            <Select
              value={formData.field_type}
              onValueChange={(value) =>
                setFormData({ ...formData, field_type: value as CustomerFormField['field_type'] })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="text">Text</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="phone">Phone</SelectItem>
                <SelectItem value="textarea">Textarea</SelectItem>
                <SelectItem value="select">Select (Dropdown)</SelectItem>
                <SelectItem value="number">Number</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="placeholder">Placeholder Text</Label>
            <Input
              id="placeholder"
              value={formData.placeholder}
              onChange={(e) => setFormData({ ...formData, placeholder: e.target.value })}
              placeholder="e.g., Enter your name"
            />
          </div>

          {formData.field_type === 'select' && (
            <div className="space-y-2">
              <Label htmlFor="options">Options (comma-separated)</Label>
              <Input
                id="options"
                value={formData.options}
                onChange={(e) => setFormData({ ...formData, options: e.target.value })}
                placeholder="e.g., Small, Medium, Large"
              />
              <p className="text-xs text-muted-foreground">
                Enter options separated by commas for select dropdown
              </p>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="required">Required Field</Label>
              <p className="text-sm text-muted-foreground">
                Customers must fill this field to complete checkout
              </p>
            </div>
            <Switch
              id="required"
              checked={formData.is_required}
              onCheckedChange={(checked) => setFormData({ ...formData, is_required: checked })}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? 'Saving...' : field ? 'Update Field' : 'Create Field'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

