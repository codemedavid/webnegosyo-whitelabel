'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  EMPTY_OUTLET_DRAFT,
  buildOutletWriteInput,
  outletToDraft,
  previewOutletSlug,
  type OutletDraft,
} from '@/lib/outlets/outlet-form'
import type { OutletWriteInput } from '@/lib/outlets/outlet-repository'
import type { Outlet } from '@/types/database'

interface OutletFormProps {
  outlet: Outlet | null
  isSaving: boolean
  onCancel: () => void
  onSubmit: (input: OutletWriteInput) => void
}

export function OutletForm({ outlet, isSaving, onCancel, onSubmit }: OutletFormProps) {
  const [draft, setDraft] = useState<OutletDraft>(
    outlet ? outletToDraft(outlet) : EMPTY_OUTLET_DRAFT
  )
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof OutletDraft>(key: K, value: OutletDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  const slugPreview = previewOutletSlug(draft)

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
            <Input
              id="outlet-address"
              value={draft.address}
              onChange={(event) => set('address', event.target.value)}
              placeholder="9th Ave cor 30th St, Taguig"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="outlet-latitude">Latitude</Label>
              <Input
                id="outlet-latitude"
                value={draft.latitude}
                onChange={(event) => set('latitude', event.target.value)}
                placeholder="14.5507"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="outlet-longitude">Longitude</Label>
              <Input
                id="outlet-longitude"
                value={draft.longitude}
                onChange={(event) => set('longitude', event.target.value)}
                placeholder="121.0470"
              />
            </div>
          </div>
          <p className="-mt-3 text-xs text-muted-foreground">
            Optional, but without both values this branch cannot be matched to a customer&apos;s
            location — it will only ever appear in the manual list.
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

          <div className="space-y-3">
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
