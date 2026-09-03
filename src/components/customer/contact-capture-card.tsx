'use client'

import { useState } from 'react'
import { Phone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

interface ContactCaptureCardProps {
  orderId: string
  tenantId: string
  trackingToken: string
  /** Whether the order already shows a customer name (hides the name field). */
  hasName: boolean
}

type SubmitState = 'idle' | 'saving' | 'saved' | 'already_set' | 'error'

/**
 * Shown on the tracking page when the order carries no contact — the walk-in /
 * POS case where the cashier rang the sale without a number. One submit,
 * because the server accepts exactly one: the QR is printed on paper.
 */
export function ContactCaptureCard({
  orderId,
  tenantId,
  trackingToken,
  hasName,
}: ContactCaptureCardProps) {
  const [contact, setContact] = useState('')
  const [name, setName] = useState('')
  const [state, setState] = useState<SubmitState>('idle')

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (contact.trim().length < 3 || state === 'saving') return

    setState('saving')
    try {
      const res = await fetch('/api/orders/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          tenantId,
          token: trackingToken,
          contact: contact.trim(),
          ...(name.trim() ? { name: name.trim() } : {}),
        }),
      })
      if (res.ok) {
        setState('saved')
      } else if (res.status === 409) {
        setState('already_set')
      } else {
        setState('error')
      }
    } catch {
      setState('error')
    }
  }

  if (state === 'saved') {
    return (
      <Card className="border-green-200 bg-green-50/50">
        <CardContent className="p-4 text-center">
          <p className="text-sm font-semibold text-green-700">
            Thanks! Your number is now on this order.
          </p>
          <p className="text-xs text-green-600 mt-1">
            The store can reach you if anything comes up.
          </p>
        </CardContent>
      </Card>
    )
  }

  if (state === 'already_set') {
    return (
      <Card className="border-blue-200 bg-blue-50/50">
        <CardContent className="p-4 text-center">
          <p className="text-sm text-blue-700">This order already has a contact on file.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-amber-200 bg-amber-50/40">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Phone className="h-4 w-4 text-amber-600" />
          <h2 className="text-sm font-bold text-gray-900">Add your number to this order</h2>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          So the store can text you about your order.
        </p>
        <form onSubmit={handleSubmit} className="space-y-2">
          <Input
            type="tel"
            inputMode="tel"
            placeholder="Mobile number (e.g. 09XX XXX XXXX)"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            maxLength={64}
            required
          />
          {!hasName && (
            <Input
              type="text"
              placeholder="Your name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={64}
            />
          )}
          {state === 'error' && (
            <p className="text-xs text-red-600">
              Could not save right now — please try again.
            </p>
          )}
          <Button
            type="submit"
            size="sm"
            className="w-full"
            disabled={state === 'saving' || contact.trim().length < 3}
          >
            {state === 'saving' ? 'Saving…' : 'Attach to order'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
