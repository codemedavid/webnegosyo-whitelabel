'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { MessageCircle, CreditCard } from 'lucide-react'
import { z } from 'zod'

const checkoutFormSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  phone: z.string().min(10, 'Phone number must be at least 10 digits').regex(/^[0-9]+$/, 'Phone number must contain only digits'),
  businessName: z.string().min(2, 'Business name must be at least 2 characters'),
  paymentMethod: z.enum(['gcash', 'bpi'], {
    message: 'Please select a payment method',
  }),
  notes: z.string().optional(),
})

type FormData = z.infer<typeof checkoutFormSchema>
type FormErrors = Partial<Record<keyof FormData, string>>

const FACEBOOK_PAGE_USERNAME = 'WebNegosyoOfficial'
const PRODUCT_NAME = 'Smart Menu System'
const PRODUCT_PRICE = 3899

export function CheckoutForm() {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    phone: '',
    businessName: '',
    paymentMethod: 'gcash',
    notes: '',
  })
  const [errors, setErrors] = useState<FormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const validateForm = (): boolean => {
    try {
      checkoutFormSchema.parse(formData)
      setErrors({})
      return true
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: FormErrors = {}
        error.issues.forEach((err) => {
          const path = err.path[0] as keyof FormData
          if (path) {
            newErrors[path] = err.message
          }
        })
        setErrors(newErrors)

        const firstError = error.issues[0]
        if (firstError) {
          toast.error(`${firstError.path.join('.')}: ${firstError.message}`)
        }
      }
      return false
    }
  }

  const formatMessage = (data: FormData): string => {
    const paymentMethodName = data.paymentMethod === 'gcash' ? 'GCash' : 'BPI'

    return `Hello! I'd like to purchase the ${PRODUCT_NAME} (₱${PRODUCT_PRICE.toLocaleString()}).

Here are my details:
📋 Name: ${data.name}
📧 Email: ${data.email}
📱 Phone: ${data.phone}
🏢 Business Name: ${data.businessName}
💳 Payment Method: ${paymentMethodName}
${data.notes ? `📝 Additional Notes: ${data.notes}` : ''}

Please let me know the next steps to complete my purchase. Thank you!`
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    setIsSubmitting(true)

    try {
      const message = formatMessage(formData)
      const encodedMessage = encodeURIComponent(message)
      const messengerUrl = `https://m.me/${FACEBOOK_PAGE_USERNAME}?text=${encodedMessage}`

      window.open(messengerUrl, '_blank')
      toast.success('Opening Messenger... Please send the pre-filled message to complete your order.')

      setTimeout(() => {
        setFormData({
          name: '',
          email: '',
          phone: '',
          businessName: '',
          paymentMethod: 'gcash',
          notes: '',
        })
        setErrors({})
      }, 2000)
    } catch (error) {
      console.error('Error submitting form:', error)
      toast.error('Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Name */}
      <div className="space-y-1.5">
        <Label htmlFor="name" className="text-sm text-white/70">
          Full Name <span className="text-purple-400">*</span>
        </Label>
        <Input
          id="name"
          type="text"
          placeholder="Juan dela Cruz"
          value={formData.name}
          onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
          aria-invalid={!!errors.name}
          className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus-visible:ring-purple-500"
        />
        {errors.name && <p className="text-sm text-red-400">{errors.name}</p>}
      </div>

      {/* Email */}
      <div className="space-y-1.5">
        <Label htmlFor="email" className="text-sm text-white/70">
          Email Address <span className="text-purple-400">*</span>
        </Label>
        <Input
          id="email"
          type="email"
          placeholder="juan@example.com"
          value={formData.email}
          onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
          aria-invalid={!!errors.email}
          className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus-visible:ring-purple-500"
        />
        {errors.email && <p className="text-sm text-red-400">{errors.email}</p>}
      </div>

      {/* Phone */}
      <div className="space-y-1.5">
        <Label htmlFor="phone" className="text-sm text-white/70">
          Phone Number <span className="text-purple-400">*</span>
        </Label>
        <Input
          id="phone"
          type="tel"
          placeholder="09123456789"
          value={formData.phone}
          onChange={(e) => {
            const value = e.target.value.replace(/\D/g, '')
            setFormData(prev => ({ ...prev, phone: value }))
          }}
          maxLength={11}
          aria-invalid={!!errors.phone}
          className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus-visible:ring-purple-500"
        />
        {errors.phone && <p className="text-sm text-red-400">{errors.phone}</p>}
      </div>

      {/* Business Name */}
      <div className="space-y-1.5">
        <Label htmlFor="businessName" className="text-sm text-white/70">
          Business Name <span className="text-purple-400">*</span>
        </Label>
        <Input
          id="businessName"
          type="text"
          placeholder="My Restaurant"
          value={formData.businessName}
          onChange={(e) => setFormData(prev => ({ ...prev, businessName: e.target.value }))}
          aria-invalid={!!errors.businessName}
          className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus-visible:ring-purple-500"
        />
        {errors.businessName && <p className="text-sm text-red-400">{errors.businessName}</p>}
      </div>

      {/* Payment Method */}
      <div className="space-y-1.5">
        <Label htmlFor="paymentMethod" className="text-sm text-white/70">
          Payment Method <span className="text-purple-400">*</span>
        </Label>
        <Select
          value={formData.paymentMethod}
          onValueChange={(value) => setFormData(prev => ({ ...prev, paymentMethod: value as 'gcash' | 'bpi' }))}
        >
          <SelectTrigger id="paymentMethod" className="w-full bg-white/5 border-white/10 text-white" aria-invalid={!!errors.paymentMethod}>
            <SelectValue placeholder="Select payment method" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="gcash">
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                <span>GCash</span>
              </div>
            </SelectItem>
            <SelectItem value="bpi">
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                <span>BPI</span>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
        {errors.paymentMethod && <p className="text-sm text-red-400">{errors.paymentMethod}</p>}
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <Label htmlFor="notes" className="text-sm text-white/70">
          Additional Notes (Optional)
        </Label>
        <Textarea
          id="notes"
          placeholder="Any special requests or questions..."
          value={formData.notes}
          onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
          rows={3}
          className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus-visible:ring-purple-500"
        />
      </div>

      {/* Submit */}
      <Button
        type="submit"
        size="lg"
        className="w-full bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white font-bold text-base"
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          'Processing...'
        ) : (
          <>
            <MessageCircle className="mr-2 h-4 w-4" />
            Continue to Messenger
          </>
        )}
      </Button>

      <p className="text-xs text-center text-white/30">
        You&apos;ll be redirected to Messenger to complete your order. We&apos;ll process your request within 48 hours.
      </p>
    </form>
  )
}
