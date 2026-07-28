'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { MapPin } from 'lucide-react'
import { MapboxAddressAutocomplete } from '@/components/shared/mapbox-address-autocomplete'
import {
  EMPTY_OUTLET_DRAFT,
  applyOutletAddressSelection,
  buildOutletWriteInput,
  clearOutletCoordinates,
  outletToDraft,
  previewOutletSlug,
  type OutletDraft,
  type PickedCoordinates,
} from '@/lib/outlets/outlet-form'
import type { OutletWriteInput } from '@/lib/outlets/outlet-repository'
import type { Outlet } from '@/types/database'

interface OutletFormProps {
  outlet: Outlet | null
  /** Mirrors the delivery settings form: falls back to manual entry when off. */
  mapboxEnabled?: boolean
  isSaving: boolean
  onCancel: () => void
  onSubmit: (input: OutletWriteInput) => void
}

export function OutletForm({ outlet, mapboxEnabled = true, isSaving, onCancel, onSubmit }: OutletFormProps) {
  const [draft, setDraft] = useState<OutletDraft>(
    outlet ? outletToDraft(outlet) : EMPTY_OUTLET_DRAFT
  )
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof OutletDraft>(key: K, value: OutletDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  const slugPreview = previewOutletSlug(draft)
  const hasPin = draft.latitude !== '' && draft.longitude !== ''

  // Coordinates arrive only on a picked result; typing keeps any existing pin.
  const handleAddressChange = (address: string, coordinates?: PickedCoordinates) =>
    setDraft((current) => applyOutletAddressSelection(current, address, coordinates))

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    try {
      // Same validation the repository runs, so the form can never report a
      // problem the server would accept, or accept one the server rejects.
      onSubmit(buildOutletWriteInput(draft, { sortOrder: outlet?.sort_order }))
      setError(null)
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : 'Check the form')
    }
  }

  return (
    <Card>
      <CardContent className="py-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="outlet-name">Branch name</Label>
              <Input
                id="outlet-name"
                value={draft.name}
                onChange={(event) => set('name', event.target.value)}
                placeholder="BGC High Street"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="outlet-slug">Branch link</Label>
              <Input
                id="outlet-slug"
                value={draft.slug}
                onChange={(event) => set('slug', event.target.value)}
                placeholder="bgc-high-street"
              />
              <p className="text-xs text-muted-foreground">
                {slugPreview
                  ? `Customers reach this branch at ?outlet=${slugPreview}`
                  : 'Leave blank to build one from the branch name.'}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="outlet-address">Address</Label>
            {/*
              Search-and-pin rather than two number boxes. The database rejects
              half a coordinate pair outright, so hand-typed lat/lng made a
              branch unsaveable with an error naming a constraint. Picking a
              result sets the address and both coordinates together.
            */}
            <MapboxAddressAutocomplete
              value={draft.address}
              onChange={handleAddressChange}
              placeholder="Search or pin this branch's location"
              mapboxEnabled={mapboxEnabled}
            />
            {hasPin ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span>Pinned at {draft.latitude}, {draft.longitude}</span>
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-foreground"
                  onClick={() => setDraft(clearOutletCoordinates)}
                >
                  Clear pin
                </button>
              </div>
            ) : null}
          </div>
          <p className="-mt-3 text-xs text-muted-foreground">
            Optional, but an unpinned branch cannot be matched to a customer&apos;s location — it
            will only ever appear in the manual list.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="outlet-phone">Phone</Label>
              <Input
                id="outlet-phone"
                value={draft.phone}
                onChange={(event) => set('phone', event.target.value)}
                placeholder="+63 917 123 4567"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="outlet-radius">Delivery radius (km)</Label>
              <Input
                id="outlet-radius"
                value={draft.delivery_radius_km}
                onChange={(event) => set('delivery_radius_km', event.target.value)}
                placeholder="Leave blank for no limit"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="outlet-image">Branch photo URL</Label>
            <Input
              id="outlet-image"
              value={draft.image_url}
              onChange={(event) => set('image_url', event.target.value)}
              placeholder="https://… (shown on the branch chooser)"
            />
            <p className="text-xs text-muted-foreground">
              Optional. Branches without a photo show a placeholder tile.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="outlet-dine-in">Supports dine-in</Label>
              <Switch
                id="outlet-dine-in"
                checked={draft.supports_dine_in}
                onCheckedChange={(checked) => set('supports_dine_in', checked)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="outlet-pickup">Supports pickup</Label>
              <Switch
                id="outlet-pickup"
                checked={draft.supports_pickup}
                onCheckedChange={(checked) => set('supports_pickup', checked)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="outlet-delivery">Supports delivery</Label>
              <Switch
                id="outlet-delivery"
                checked={draft.supports_delivery}
                onCheckedChange={(checked) => set('supports_delivery', checked)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="outlet-active">Visible to customers</Label>
              <Switch
                id="outlet-active"
                checked={draft.is_active}
                onCheckedChange={(checked) => set('is_active', checked)}
              />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {outlet ? 'Save branch' : 'Add branch'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
