'use client'

/**
 * A store owner's own Lalamove connection.
 *
 * Three things have to be true before a rider can be booked: the account keys
 * are stored, the store has a pickup phone, and the store location is pinned.
 * Miss any one and the failure only shows up at checkout — as a missing
 * delivery fee, or a booking Lalamove refuses — so the card opens with a
 * status list naming exactly which one is missing.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Check, X, Truck } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateLalamoveSettingsAction } from '@/app/actions/staff'

interface LalamoveSettingsCardProps {
  tenantId: string
  tenantSlug: string
  hasExistingKeys: boolean
  /** The stored pickup number, already normalized, or '' when unset. */
  senderPhone: string
  /** Footer number used when no pickup number is set; '' when there is none. */
  fallbackPhone: string
  pickupAddress: string
  hasPickupCoordinates: boolean
}

function StatusRow({ isDone, label, detail }: { isDone: boolean; label: string; detail: string }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {isDone ? (
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" aria-hidden />
      ) : (
        <X className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden />
      )}
      <span>
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground"> — {detail}</span>
      </span>
    </li>
  )
}

export function LalamoveSettingsCard({
  tenantId,
  tenantSlug,
  hasExistingKeys,
  senderPhone,
  fallbackPhone,
  pickupAddress,
  hasPickupCoordinates,
}: LalamoveSettingsCardProps) {
  const router = useRouter()
  const [apiKey, setApiKey] = useState('')
  const [secretKey, setSecretKey] = useState('')
  const [phone, setPhone] = useState(senderPhone)
  const [isSaving, setIsSaving] = useState(false)

  // The rider calls the pickup number, and a blank one falls through to the
  // footer number rather than to nothing at all.
  const effectivePhone = senderPhone || fallbackPhone

  const handleSave = async () => {
    setIsSaving(true)
    const result = await updateLalamoveSettingsAction(tenantId, tenantSlug, {
      apiKey,
      secretKey,
      senderPhone: phone,
    })
    setIsSaving(false)

    if (!result.success) {
      toast.error(result.error)
      return
    }

    setApiKey('')
    setSecretKey('')
    router.refresh()

    if (result.warning) {
      toast.warning(result.warning)
      return
    }
    toast.success('Lalamove settings saved')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Truck className="h-5 w-5" /> Lalamove Delivery
        </CardTitle>
        <CardDescription>
          Connect your own Lalamove account and set the pickup details riders use.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ul className="space-y-2 rounded-lg border p-4">
          <StatusRow
            isDone={hasExistingKeys}
            label="Account keys"
            detail={hasExistingKeys ? 'Connected' : 'Add your API key and secret key below'}
          />
          <StatusRow
            isDone={Boolean(effectivePhone)}
            label="Pickup contact"
            detail={
              senderPhone
                ? effectivePhone
                : fallbackPhone
                  ? `Using your footer phone ${fallbackPhone}`
                  : 'No number for the rider to call — set one below'
            }
          />
          <StatusRow
            isDone={hasPickupCoordinates}
            label="Pickup address"
            detail={
              hasPickupCoordinates
                ? pickupAddress || 'Pinned'
                : 'Not pinned — set your store location in Distance-Based Delivery below'
            }
          />
        </ul>

        <div className="grid max-w-md gap-4">
          <div className="space-y-2">
            <Label htmlFor="lalamove-sender-phone">Pickup contact phone</Label>
            <Input
              id="lalamove-sender-phone"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 09171234567"
            />
            <p className="text-xs text-muted-foreground">
              The store number the rider calls at pickup — never a customer&apos;s. Leave it
              blank to use your storefront footer phone.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="lalamove-api-key">API Key</Label>
            <Input
              id="lalamove-api-key"
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={hasExistingKeys ? '••••••••••••' : 'pk_...'}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="lalamove-secret-key">Secret Key</Label>
            <Input
              id="lalamove-secret-key"
              type="password"
              autoComplete="off"
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
              placeholder={hasExistingKeys ? '••••••••••••' : 'sk_...'}
            />
            <p className="text-xs text-muted-foreground">
              {hasExistingKeys
                ? 'Your keys are stored and never shown again. Leave both blank to keep them.'
                : 'Find these in your Lalamove Partner portal.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save Lalamove Settings'}
          </Button>
          {!hasPickupCoordinates && (
            <Button asChild variant="outline">
              <Link href={`/${tenantSlug}/admin/settings#store-location`}>Set store location</Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
