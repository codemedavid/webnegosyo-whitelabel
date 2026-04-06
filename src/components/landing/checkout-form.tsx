'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { z } from 'zod'
import { toast } from 'sonner'
import { Loader2, CreditCard, QrCode, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { submitCheckoutForm, fetchActivePlatformPaymentMethods } from '@/app/actions/checkout-leads'
import type { PlatformPaymentMethod } from '@/types/database'

const checkoutFormSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  phone: z
    .string()
    .min(10, 'Phone number must be at least 10 digits')
    .regex(/^[0-9]+$/, 'Phone number must contain only digits'),
  businessName: z.string().min(2, 'Business name must be at least 2 characters'),
  paymentMethodId: z.string().min(1, 'Please select a payment method'),
  notes: z.string().optional(),
})

type FormData = z.infer<typeof checkoutFormSchema>

const PAYMENT_TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  qr_code: QrCode,
  bank_transfer: Building2,
  other: CreditCard,
}

export function CheckoutForm() {
  const router = useRouter()
  const [paymentMethods, setPaymentMethods] = useState<PlatformPaymentMethod[]>([])
  const [isLoadingMethods, setIsLoadingMethods] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    phone: '',
    businessName: '',
    paymentMethodId: '',
    notes: '',
  })
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({})

  useEffect(() => {
    fetchActivePlatformPaymentMethods().then((methods) => {
      setPaymentMethods(methods)
      if (methods.length === 1) {
        setFormData((prev) => ({ ...prev, paymentMethodId: methods[0].id }))
      }
      setIsLoadingMethods(false)
    }).catch(() => {
      setIsLoadingMethods(false)
    })
  }, [])

  const handleChange = (field: keyof FormData, value: string) => {
    const newValue = field === 'phone' ? value.replace(/\D/g, '') : value
    setFormData((prev) => ({ ...prev, [field]: newValue }))
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }))
    }
  }

  const validateForm = (): boolean => {
    const result = checkoutFormSchema.safeParse(formData)
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof FormData, string>> = {}
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof FormData
        if (!fieldErrors[field]) {
          fieldErrors[field] = issue.message
        }
      }
      setErrors(fieldErrors)
      return false
    }
    setErrors({})
    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) return

    setIsSubmitting(true)
    try {
      const result = await submitCheckoutForm({
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        business_name: formData.businessName,
        selected_payment_method_id: formData.paymentMethodId,
        notes: formData.notes || undefined,
      })

      if (result.error) {
        toast.error(result.error)
        return
      }

      if (result.data) {
        router.push(`/checkout/confirmation/${result.data.reference_number}`)
      }
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Name */}
      <div className="space-y-2">
        <Label htmlFor="name" className="text-white/70">Full Name</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => handleChange('name', e.target.value)}
          placeholder="Juan dela Cruz"
          className="border-white/10 bg-white/5 text-white placeholder:text-white/30 focus-visible:border-white/25 focus-visible:ring-white/10"
        />
        {errors.name && <p className="text-sm text-red-500">{errors.name}</p>}
      </div>

      {/* Email */}
      <div className="space-y-2">
        <Label htmlFor="email" className="text-white/70">Email Address</Label>
        <Input
          id="email"
          type="email"
          value={formData.email}
          onChange={(e) => handleChange('email', e.target.value)}
          placeholder="juan@example.com"
          className="border-white/10 bg-white/5 text-white placeholder:text-white/30 focus-visible:border-white/25 focus-visible:ring-white/10"
        />
        {errors.email && <p className="text-sm text-red-500">{errors.email}</p>}
      </div>

      {/* Phone */}
      <div className="space-y-2">
        <Label htmlFor="phone" className="text-white/70">Phone Number</Label>
        <Input
          id="phone"
          value={formData.phone}
          onChange={(e) => handleChange('phone', e.target.value)}
          placeholder="09XXXXXXXXX"
          className="border-white/10 bg-white/5 text-white placeholder:text-white/30 focus-visible:border-white/25 focus-visible:ring-white/10"
        />
        {errors.phone && <p className="text-sm text-red-500">{errors.phone}</p>}
      </div>

      {/* Business Name */}
      <div className="space-y-2">
        <Label htmlFor="businessName" className="text-white/70">Business Name</Label>
        <Input
          id="businessName"
          value={formData.businessName}
          onChange={(e) => handleChange('businessName', e.target.value)}
          placeholder="Juan's Kitchen"
          className="border-white/10 bg-white/5 text-white placeholder:text-white/30 focus-visible:border-white/25 focus-visible:ring-white/10"
        />
        {errors.businessName && <p className="text-sm text-red-500">{errors.businessName}</p>}
      </div>

      {/* Payment Method - Radio Cards */}
      <div className="space-y-2">
        <Label className="text-white/70">Payment Method</Label>
        {isLoadingMethods ? (
          <div className="flex items-center gap-2 py-3 text-sm text-white/40">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading payment methods...
          </div>
        ) : paymentMethods.length === 0 ? (
          <p className="py-3 text-sm text-white/40">
            No payment methods available. Please contact us on Messenger.
          </p>
        ) : (
          <div className="grid gap-3">
            {paymentMethods.map((method) => {
              const Icon = PAYMENT_TYPE_ICONS[method.type] ?? CreditCard
              const isSelected = formData.paymentMethodId === method.id
              return (
                <button
                  key={method.id}
                  type="button"
                  onClick={() => handleChange('paymentMethodId', method.id)}
                  className={`flex items-center gap-3 rounded-lg border-2 p-4 text-left transition-all ${
                    isSelected
                      ? 'border-orange-500 bg-orange-500/10'
                      : 'border-white/10 hover:border-white/20'
                  }`}
                >
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                      isSelected ? 'bg-orange-500/20' : 'bg-white/5'
                    }`}
                  >
                    <Icon
                      className={`h-5 w-5 ${isSelected ? 'text-orange-500' : 'text-white/40'}`}
                    />
                  </div>
                  <div>
                    <p className="font-medium text-white">{method.name}</p>
                    {method.details && (
                      <p className="text-sm text-white/40">{method.details}</p>
                    )}
                  </div>
                  <div className="ml-auto">
                    <div
                      className={`h-5 w-5 rounded-full border-2 ${
                        isSelected
                          ? 'border-orange-500 bg-orange-500'
                          : 'border-white/20'
                      }`}
                    >
                      {isSelected && (
                        <svg viewBox="0 0 20 20" fill="white" className="h-full w-full p-0.5">
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
        {errors.paymentMethodId && (
          <p className="text-sm text-red-500">{errors.paymentMethodId}</p>
        )}
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label htmlFor="notes" className="text-white/70">Additional Notes (Optional)</Label>
        <Textarea
          id="notes"
          value={formData.notes}
          onChange={(e) => handleChange('notes', e.target.value)}
          placeholder="Any special requests or questions..."
          rows={3}
          className="border-white/10 bg-white/5 text-white placeholder:text-white/30 focus-visible:border-white/25 focus-visible:ring-white/10"
        />
      </div>

      {/* Submit */}
      <Button
        type="submit"
        disabled={isSubmitting || isLoadingMethods}
        className="w-full bg-orange-500 py-6 text-lg font-bold text-white hover:bg-orange-600"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Processing...
          </>
        ) : (
          'Complete Purchase — P3,899'
        )}
      </Button>
    </form>
  )
}
