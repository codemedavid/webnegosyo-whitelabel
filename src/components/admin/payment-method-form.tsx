'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ImageUpload } from '@/components/shared/image-upload'
import { Checkbox } from '@/components/ui/checkbox'
import type { OrderType } from '@/types/database'
import { toast } from 'sonner'
import { z } from 'zod'
import { createPaymentMethodAction, updatePaymentMethodAction, updatePaymentMethodOrderTypesAction } from '@/app/actions/payment-methods'
import type { PaymentMethodWithOrderTypes } from '@/lib/payment-methods-service'

interface PaymentMethodFormProps {
  paymentMethod?: PaymentMethodWithOrderTypes
  orderTypes: OrderType[]
  tenantId: string
  tenantSlug: string
  onSuccess?: () => void
}

const paymentMethodFormSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  details: z.string().optional(),
  qr_code_url: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  is_active: z.boolean(),
})

type FormErrors = {
  name?: string
  details?: string
  qr_code_url?: string
  order_types?: string
}

export function PaymentMethodForm({ paymentMethod, orderTypes, tenantId, tenantSlug, onSuccess }: PaymentMethodFormProps) {
  const router = useRouter()
  const [formData, setFormData] = useState({
    name: paymentMethod?.name || '',
    details: paymentMethod?.details || '',
    qr_code_url: paymentMethod?.qr_code_url || '',
    is_active: paymentMethod?.is_active ?? true,
  })

  const [selectedOrderTypes, setSelectedOrderTypes] = useState<string[]>(
    paymentMethod?.order_types || []
  )
  const [errors, setErrors] = useState<FormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const validateForm = (): boolean => {
    try {
      paymentMethodFormSchema.parse({
        name: formData.name,
        details: formData.details,
        qr_code_url: formData.qr_code_url,
        is_active: formData.is_active,
      })

      if (selectedOrderTypes.length === 0) {
        setErrors({ order_types: 'Please select at least one order type' })
        return false
      }

      setErrors({})
      return true
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: FormErrors = {}
        error.issues.forEach((err) => {
          if (err.path[0]) {
            fieldErrors[err.path[0] as keyof FormErrors] = err.message
          }
        })
        setErrors(fieldErrors)
      }
      return false
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      toast.error('Please fix the form errors')
      return
    }

    // Extra validation: Must have at least one order type selected
    if (selectedOrderTypes.length === 0) {
      toast.error('Please select at least one order type')
      return
    }

    setIsSubmitting(true)

    try {
      if (paymentMethod) {
        // Update existing payment method
        const result = await updatePaymentMethodAction(
          paymentMethod.id,
          tenantId,
          tenantSlug,
          {
            name: formData.name,
            details: formData.details || undefined,
            qr_code_url: formData.qr_code_url || undefined,
            is_active: formData.is_active,
          }
        )

        if (!result.success) {
          const errorMsg = result.error || 'Failed to update payment method'
          
          // Check if it's a migration error
          if (errorMsg.includes('relation') || errorMsg.includes('does not exist')) {
            toast.error('Database migration required. Please apply migration 0012_payment_methods.sql first.')
            return // Don't throw, just stop
          } else {
            console.error('Update error:', errorMsg)
            toast.error(errorMsg)
          }
          return // Don't throw, just stop
        }

        // Update order type associations
        const orderTypesResult = await updatePaymentMethodOrderTypesAction(
          paymentMethod.id,
          tenantId,
          tenantSlug,
          selectedOrderTypes
        )

        if (!orderTypesResult.success) {
          const errorMsg = orderTypesResult.error || 'Failed to update payment method order types'
          
          // Check if it's a migration error
          if (errorMsg.includes('relation') || errorMsg.includes('does not exist')) {
            toast.error('Database migration required. Please apply migration 0012_payment_methods.sql first.')
            return // Don't throw, just stop
          } else {
            console.error('Update order types error:', errorMsg)
            toast.error(errorMsg)
          }
          return // Don't throw, just stop
        }

        toast.success('Payment method updated successfully')
      } else {
        // Create new payment method
        const result = await createPaymentMethodAction(
          tenantId,
          tenantSlug,
          formData.name,
          formData.details || undefined,
          formData.qr_code_url || undefined,
          formData.is_active,
          selectedOrderTypes
        )

        if (!result.success) {
          const errorMsg = result.error || 'Failed to create payment method'
          
          // Check if it's a migration error
          if (errorMsg.includes('relation') || errorMsg.includes('does not exist')) {
            toast.error('Database migration required. Please apply migration 0012_payment_methods.sql first.')
            return // Don't throw, just stop
          } else {
            console.error('Create error:', errorMsg)
            toast.error(errorMsg)
          }
          return // Don't throw, just stop
        }

        toast.success('Payment method created successfully')
      }

      if (onSuccess) {
        onSuccess()
      } else {
        router.push(`/${tenantSlug}/admin/payment-methods`)
      }
    } catch (error) {
      console.error('Error saving payment method:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to save payment method')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleOrderTypeToggle = (orderTypeId: string) => {
    setSelectedOrderTypes((prev) =>
      prev.includes(orderTypeId)
        ? prev.filter((id) => id !== orderTypeId)
        : [...prev, orderTypeId]
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Payment Method Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">
              Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., GCash, PayMaya, Bank Transfer"
              className={errors.name ? 'border-red-500' : ''}
            />
            {errors.name && <p className="text-sm text-red-500">{errors.name}</p>}
          </div>

          {/* Details */}
          <div className="space-y-2">
            <Label htmlFor="details">Details / Instructions</Label>
            <Textarea
              id="details"
              value={formData.details}
              onChange={(e) => setFormData({ ...formData, details: e.target.value })}
              placeholder="Enter payment details, account number, or instructions for customers"
              rows={4}
              className={errors.details ? 'border-red-500' : ''}
            />
            {errors.details && <p className="text-sm text-red-500">{errors.details}</p>}
            <p className="text-sm text-gray-500">
              This information will be shown to customers at checkout
            </p>
          </div>

          {/* QR Code Upload */}
          <div className="space-y-2">
            <Label htmlFor="qr_code">QR Code (Optional)</Label>
            <ImageUpload
              currentImageUrl={formData.qr_code_url}
              onImageUploaded={(url) => setFormData({ ...formData, qr_code_url: url })}
              folder="payment-qr-codes"
            />
            {errors.qr_code_url && <p className="text-sm text-red-500">{errors.qr_code_url}</p>}
            {formData.qr_code_url && (
              <div className="mt-4">
                <p className="text-sm font-medium mb-2">Preview:</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={formData.qr_code_url}
                  alt="QR Code Preview"
                  className="w-48 h-48 object-contain border rounded-lg"
                />
              </div>
            )}
          </div>

          {/* Active Status */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) => 
                setFormData({ ...formData, is_active: checked as boolean })
              }
            />
            <Label htmlFor="is_active" className="cursor-pointer">
              Active (visible to customers)
            </Label>
          </div>
        </CardContent>
      </Card>

      {/* Order Type Availability */}
      <Card>
        <CardHeader>
          <CardTitle>Available for Order Types</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {orderTypes.map((orderType) => (
              <div key={orderType.id} className="flex items-start space-x-3">
                <Checkbox
                  id={`order-type-${orderType.id}`}
                  checked={selectedOrderTypes.includes(orderType.id)}
                  onCheckedChange={() => handleOrderTypeToggle(orderType.id)}
                />
                <div className="grid gap-1.5 leading-none">
                  <Label
                    htmlFor={`order-type-${orderType.id}`}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    {orderType.name}
                  </Label>
                  {orderType.description && (
                    <p className="text-sm text-gray-500">{orderType.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
          {errors.order_types && (
            <p className="text-sm text-red-500 mt-2">{errors.order_types}</p>
          )}
          <p className="text-sm text-gray-500 mt-4">
            This payment method will only be shown for the selected order types
          </p>
        </CardContent>
      </Card>

      {/* Form Actions */}
      <div className="flex justify-end gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : paymentMethod ? 'Update Payment Method' : 'Create Payment Method'}
        </Button>
      </div>
    </form>
  )
}

