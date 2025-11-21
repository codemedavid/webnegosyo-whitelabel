'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
  plan: z.enum(['starter', 'pro'], {
    required_error: 'Please select a plan',
  }),
  paymentMethod: z.enum(['gcash', 'bpi'], {
    required_error: 'Please select a payment method',
  }),
  notes: z.string().optional(),
})

type FormData = z.infer<typeof checkoutFormSchema>
type FormErrors = Partial<Record<keyof FormData, string>>

const PLAN_DETAILS: Record<'starter' | 'pro', { name: string; price: number }> = {
  starter: {
    name: 'Starter Plan',
    price: 999,
  },
  pro: {
    name: 'Pro Plan',
    price: 1899,
  },
}

const FACEBOOK_PAGE_USERNAME = 'WebNegosyoOfficial'

interface CheckoutFormProps {
  planParam?: string
}

export function CheckoutForm({ planParam }: CheckoutFormProps) {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    phone: '',
    businessName: '',
    plan: (planParam === 'starter' || planParam === 'pro') ? planParam : 'starter',
    paymentMethod: 'gcash',
    notes: '',
  })
  const [errors, setErrors] = useState<FormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Get plan from URL params
  useEffect(() => {
    if (planParam === 'starter' || planParam === 'pro') {
      setFormData(prev => ({ ...prev, plan: planParam }))
    }
  }, [planParam])

  // Update order summary display
  useEffect(() => {
    const planDisplay = document.getElementById('plan-display')
    const priceDisplay = document.getElementById('price-display')
    const totalDisplay = document.getElementById('total-display')

    if (planDisplay && priceDisplay && totalDisplay) {
      // Ensure plan is valid, default to 'starter' if not
      const plan = (formData.plan === 'starter' || formData.plan === 'pro') 
        ? formData.plan 
        : 'starter'
      
      const planDetails = PLAN_DETAILS[plan]
      planDisplay.textContent = planDetails.name
      priceDisplay.textContent = `₱${planDetails.price.toLocaleString()}`
      totalDisplay.textContent = `₱${planDetails.price.toLocaleString()}`
    }
  }, [formData.plan])

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
        
        // Show first error in toast
        const firstError = error.issues[0]
        if (firstError) {
          toast.error(`${firstError.path.join('.')}: ${firstError.message}`)
        }
      }
      return false
    }
  }

  const formatMessage = (data: FormData): string => {
    // Ensure plan is valid, default to 'starter' if not
    const plan = (data.plan === 'starter' || data.plan === 'pro') 
      ? data.plan 
      : 'starter'
    const planDetails = PLAN_DETAILS[plan]
    const paymentMethodName = data.paymentMethod === 'gcash' ? 'GCash' : 'BPI'
    
    return `Hello! I'm interested in purchasing the ${planDetails.name} (₱${planDetails.price.toLocaleString()}).

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

      // Open Messenger in new tab
      window.open(messengerUrl, '_blank')

      // Show success message
      toast.success('Opening Messenger... Please send the pre-filled message to complete your order.')

      // Reset form after a delay
      setTimeout(() => {
        setFormData({
          name: '',
          email: '',
          phone: '',
          businessName: '',
          plan: 'starter',
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
    <Card>
      <CardHeader>
        <CardTitle>Order Information</CardTitle>
        <CardDescription>
          Fill out your details and we&apos;ll contact you via Messenger to complete the payment
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Plan Selection */}
          <div className="space-y-2">
            <Label htmlFor="plan">
              Select Plan <span className="text-destructive">*</span>
            </Label>
            <Select
              value={formData.plan}
              onValueChange={(value) => setFormData(prev => ({ ...prev, plan: value as 'starter' | 'pro' }))}
            >
              <SelectTrigger id="plan" className="w-full" aria-invalid={!!errors.plan}>
                <SelectValue placeholder="Select a plan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="starter">
                  Starter Plan - ₱999
                </SelectItem>
                <SelectItem value="pro">
                  Pro Plan - ₱1,899
                </SelectItem>
              </SelectContent>
            </Select>
            {errors.plan && (
              <p className="text-sm text-destructive">{errors.plan}</p>
            )}
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">
              Full Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              type="text"
              placeholder="Juan dela Cruz"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              aria-invalid={!!errors.name}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name}</p>
            )}
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email">
              Email Address <span className="text-destructive">*</span>
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="juan@example.com"
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              aria-invalid={!!errors.email}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email}</p>
            )}
          </div>

          {/* Phone */}
          <div className="space-y-2">
            <Label htmlFor="phone">
              Phone Number <span className="text-destructive">*</span>
            </Label>
            <Input
              id="phone"
              type="tel"
              placeholder="09123456789"
              value={formData.phone}
              onChange={(e) => {
                // Only allow digits
                const value = e.target.value.replace(/\D/g, '')
                setFormData(prev => ({ ...prev, phone: value }))
              }}
              maxLength={11}
              aria-invalid={!!errors.phone}
            />
            {errors.phone && (
              <p className="text-sm text-destructive">{errors.phone}</p>
            )}
          </div>

          {/* Business Name */}
          <div className="space-y-2">
            <Label htmlFor="businessName">
              Business Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="businessName"
              type="text"
              placeholder="My Restaurant"
              value={formData.businessName}
              onChange={(e) => setFormData(prev => ({ ...prev, businessName: e.target.value }))}
              aria-invalid={!!errors.businessName}
            />
            {errors.businessName && (
              <p className="text-sm text-destructive">{errors.businessName}</p>
            )}
          </div>

          {/* Payment Method */}
          <div className="space-y-2">
            <Label htmlFor="paymentMethod">
              Payment Method <span className="text-destructive">*</span>
            </Label>
            <Select
              value={formData.paymentMethod}
              onValueChange={(value) => setFormData(prev => ({ ...prev, paymentMethod: value as 'gcash' | 'bpi' }))}
            >
              <SelectTrigger id="paymentMethod" className="w-full" aria-invalid={!!errors.paymentMethod}>
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
            {errors.paymentMethod && (
              <p className="text-sm text-destructive">{errors.paymentMethod}</p>
            )}
          </div>

          {/* Additional Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">
              Additional Notes (Optional)
            </Label>
            <Textarea
              id="notes"
              placeholder="Any special requests or questions..."
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              rows={4}
            />
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            size="lg"
            className="w-full"
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

          <p className="text-xs text-center text-muted-foreground">
            By clicking &quot;Continue to Messenger&quot;, you&apos;ll be redirected to our Facebook Messenger 
            where you can send your order details. We&apos;ll process your request and contact you shortly.
          </p>
        </form>
      </CardContent>
    </Card>
  )
}

