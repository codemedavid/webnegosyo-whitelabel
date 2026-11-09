'use client'

import { useMemo, useState, type FormEvent } from 'react'
import dynamic from 'next/dynamic'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { buildDeliveryPinCheck } from '@/components/customer/checkout-templates/checkout-address-field'
import type { LatLng } from '@/lib/maps/apple/mapkit-address'

const AddressAutocomplete = dynamic(
  () => import('@/components/shared/address-autocomplete').then((mod) => ({ default: mod.AddressAutocomplete })),
  {
    loading: () => <input className="w-full rounded-md border border-gray-300 px-3 py-2" placeholder="Loading the map..." disabled />,
    ssr: false,
  },
)

const DETAIL_MAX_LENGTH = 200
const INPUT_CLASS = 'w-full rounded-md border border-gray-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-orange-500'

export interface PinLinkFormProps {
  tenantId: string
  orderId: string
  token: string
  storeName: string
  orderNumber: number | null
  mapsEnabled: boolean
  biasCenter: LatLng | null
  radiusKm: number | null
  market: string | null
  lalamoveEnabled: boolean | null
  /** The order already has an address: send the pin and details, never replace the words. */
  keepsAddress: boolean
}

export function PinLinkForm({
  tenantId,
  orderId,
  token,
  storeName,
  orderNumber,
  mapsEnabled,
  biasCenter,
  radiusKm,
  market,
  lalamoveEnabled,
  keepsAddress,
}: PinLinkFormProps) {
  const [address, setAddress] = useState('')
  const [pin, setPin] = useState<LatLng | null>(null)
  const [unit, setUnit] = useState('')
  const [landmark, setLandmark] = useState('')
  const [riderNote, setRiderNote] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isDone, setIsDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const check = useMemo(
    () => buildDeliveryPinCheck({ origin: biasCenter, radiusKm, market, lalamoveEnabled, placeName: storeName }),
    [biasCenter, radiusKm, market, lalamoveEnabled, storeName],
  )

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!pin) {
      setError('Please set your exact spot on the map first.')
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/orders/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          orderId,
          token,
          patch: {
            pin,
            ...(!keepsAddress && address.trim() ? { address: address.trim() } : {}),
            ...(unit.trim() ? { unit: unit.trim() } : {}),
            ...(landmark.trim() ? { landmark: landmark.trim() } : {}),
            ...(riderNote.trim() ? { riderNote: riderNote.trim() } : {}),
          },
        }),
      })
      const body = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) {
        setError(body?.error ?? 'We could not save your spot. Please try again.')
        return
      }
      setIsDone(true)
    } catch (caught) {
      console.error('[pin-link] save failed:', caught)
      setError('We could not save your spot. Check your connection and try again.')
    } finally {
      setIsSaving(false)
    }
  }

  if (isDone) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
        <CheckCircle2 aria-hidden="true" className="h-10 w-10 text-green-600" />
        <h1 className="text-xl font-semibold text-gray-900">Thank you!</h1>
        <p className="text-gray-700">{storeName} now has your exact spot.</p>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-md space-y-4 p-4">
      <header className="space-y-1">
        <p className="text-sm text-gray-600">{storeName}{orderNumber ? ` · Order #${orderNumber}` : ''}</p>
        <h1 className="text-xl font-semibold text-gray-900">Where should the rider go?</h1>
      </header>

      <form onSubmit={handleSubmit} className="space-y-4">
        <AddressAutocomplete
          value={address}
          coordinates={pin}
          onChange={(text, coordinates) => {
            setAddress(text)
            setPin(coordinates ?? null)
          }}
          placeholder="Search your street, building or landmark"
          mapsEnabled={mapsEnabled}
          mapDisplay="map"
          biasCenter={biasCenter}
          purpose="delivery"
          check={check}
        />

        <div>
          <label htmlFor="pin-unit" className="mb-1 block text-sm font-medium text-gray-800">House / Blk / Lot / Unit <span className="font-normal text-gray-500">(optional)</span></label>
          <input id="pin-unit" value={unit} onChange={(event) => setUnit(event.target.value)} maxLength={DETAIL_MAX_LENGTH} placeholder="e.g. Blk 4 Lot 12, or Unit 5B" className={INPUT_CLASS} />
        </div>
        <div>
          <label htmlFor="pin-landmark" className="mb-1 block text-sm font-medium text-gray-800">Landmark <span className="font-normal text-gray-500">(optional)</span></label>
          <input id="pin-landmark" value={landmark} onChange={(event) => setLandmark(event.target.value)} maxLength={DETAIL_MAX_LENGTH} placeholder="e.g. Blue gate beside 7-Eleven" className={INPUT_CLASS} />
        </div>
        <div>
          <label htmlFor="pin-note" className="mb-1 block text-sm font-medium text-gray-800">Note to rider <span className="font-normal text-gray-500">(optional)</span></label>
          <input id="pin-note" value={riderNote} onChange={(event) => setRiderNote(event.target.value)} maxLength={DETAIL_MAX_LENGTH} placeholder="e.g. Call me when you arrive" className={INPUT_CLASS} />
        </div>

        {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
        <Button type="submit" disabled={isSaving || !pin} className="min-h-11 w-full">
          {isSaving ? 'Saving…' : 'Send my spot to the store'}
        </Button>
      </form>
    </main>
  )
}
