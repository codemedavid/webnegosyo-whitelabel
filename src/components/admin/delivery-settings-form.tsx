'use client'

import { useState, useTransition } from 'react'
import { Truck, Save } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { MapboxAddressAutocomplete } from '@/components/shared/mapbox-address-autocomplete'
import { updateTenantDeliveryForAdminAction } from '@/actions/tenants'

interface DeliverySettingsInitial {
  distance_delivery_enabled: boolean
  delivery_price_per_km: number | null
  delivery_min_fee: number | null
  delivery_radius_km: number | null
  restaurant_address: string
  restaurant_latitude: number | null
  restaurant_longitude: number | null
}

interface DeliverySettingsFormProps {
  tenantId: string
  tenantSlug: string
  mapboxEnabled: boolean
  initial: DeliverySettingsInitial
}

// Convert a nullable number to the string the inputs hold (empty string when null/undefined).
function numberToInput(value: number | null): string {
  return value === null || value === undefined ? '' : String(value)
}

// Parse an input string back to a nullable number (empty/whitespace/invalid → null).
function inputToNumber(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const parsed = parseFloat(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

export function DeliverySettingsForm({
  tenantId,
  tenantSlug,
  mapboxEnabled,
  initial,
}: DeliverySettingsFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [enabled, setEnabled] = useState<boolean>(initial.distance_delivery_enabled)
  const [address, setAddress] = useState<string>(initial.restaurant_address)
  const [latitude, setLatitude] = useState<number | null>(initial.restaurant_latitude)
  const [longitude, setLongitude] = useState<number | null>(initial.restaurant_longitude)
  const [perKm, setPerKm] = useState<string>(numberToInput(initial.delivery_price_per_km))
  const [minFee, setMinFee] = useState<string>(numberToInput(initial.delivery_min_fee))
  const [radiusKm, setRadiusKm] = useState<string>(numberToInput(initial.delivery_radius_km))

  const handleAddressChange = (nextAddress: string, coordinates?: { lat: number; lng: number }) => {
    setAddress(nextAddress)
    if (coordinates) {
      setLatitude(coordinates.lat)
      setLongitude(coordinates.lng)
    }
  }

  const handleSave = () => {
    startTransition(async () => {
      try {
        const result = await updateTenantDeliveryForAdminAction(tenantId, {
          distance_delivery_enabled: enabled,
          delivery_price_per_km: inputToNumber(perKm),
          delivery_min_fee: inputToNumber(minFee),
          delivery_radius_km: inputToNumber(radiusKm),
          restaurant_address: address,
          restaurant_latitude: latitude,
          restaurant_longitude: longitude,
        })

        if ('error' in result && result.error) {
          toast.error(result.error)
          return
        }

        toast.success('Delivery settings saved')
        router.refresh()
      } catch {
        toast.error('Failed to save delivery settings')
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Truck className="h-5 w-5" /> Distance-Based Delivery
        </CardTitle>
        <CardDescription>
          Charge a delivery fee based on how far the customer is from your store. The fee is
          calculated as <span className="font-medium">max(minimum fee, distance × per-km rate)</span>,
          and orders beyond the delivery radius are blocked at checkout.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="distance-delivery-enabled" className="font-medium">
              Enable distance-based delivery fee
            </Label>
            <p className="text-sm text-muted-foreground">
              Turn this on to set your store location and per-kilometer pricing.
            </p>
          </div>
          <Switch
            id="distance-delivery-enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
            disabled={isPending}
            aria-label="Enable distance-based delivery fee"
          />
        </div>

        {enabled && (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label className="font-medium">Store location</Label>
              <p className="text-sm text-muted-foreground">
                Set your store address — delivery distance is measured from this point.
              </p>
              <MapboxAddressAutocomplete
                value={address}
                onChange={handleAddressChange}
                placeholder="Search or pin your store location"
                mapboxEnabled={mapboxEnabled}
              />
              {latitude !== null && longitude !== null && (
                <p className="text-xs text-muted-foreground">
                  Pinned at {latitude.toFixed(6)}, {longitude.toFixed(6)}
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="delivery-radius-km" className="font-medium">
                  Radius (km)
                </Label>
                <Input
                  id="delivery-radius-km"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.1"
                  value={radiusKm}
                  onChange={(e) => setRadiusKm(e.target.value)}
                  placeholder="e.g. 10"
                  disabled={isPending}
                />
                <p className="text-xs text-muted-foreground">
                  Orders farther than this are blocked.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="delivery-price-per-km" className="font-medium">
                  Price per km
                </Label>
                <Input
                  id="delivery-price-per-km"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={perKm}
                  onChange={(e) => setPerKm(e.target.value)}
                  placeholder="e.g. 15"
                  disabled={isPending}
                />
                <p className="text-xs text-muted-foreground">
                  Charged for each kilometer of distance.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="delivery-min-fee" className="font-medium">
                  Minimum fee
                </Label>
                <Input
                  id="delivery-min-fee"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={minFee}
                  onChange={(e) => setMinFee(e.target.value)}
                  placeholder="e.g. 50"
                  disabled={isPending}
                />
                <p className="text-xs text-muted-foreground">
                  The lowest fee charged for any delivery.
                </p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Note: If Lalamove delivery is enabled, its live quote takes precedence over this
              distance-based fee. Changes apply to <span className="font-medium">{tenantSlug}</span>
              &apos;s storefront after saving.
            </p>
          </div>
        )}

        <div className="pt-2">
          <Button onClick={handleSave} disabled={isPending}>
            <Save className="mr-2 h-4 w-4" /> {isPending ? 'Saving…' : 'Save Delivery Settings'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
