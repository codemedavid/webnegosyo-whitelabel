'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, MapPin, Pencil, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  createOutletAction,
  reorderOutletsAction,
  setOutletActiveAction,
  updateOutletAction,
} from '@/app/actions/outlets'
import { OutletForm } from '@/components/admin/outlet-form'
import { moveOutletOrder } from '@/lib/outlets/outlet-form'
import type { Outlet } from '@/types/database'

interface OutletsManagerProps {
  tenantId: string
  tenantSlug: string
  initialOutlets: Outlet[]
}

export function OutletsManager({ tenantId, tenantSlug, initialOutlets }: OutletsManagerProps) {
  const router = useRouter()
  const [outlets, setOutlets] = useState<Outlet[]>(initialOutlets)
  const [editing, setEditing] = useState<Outlet | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [isBusy, setIsBusy] = useState(false)

  const closeForm = () => {
    setEditing(null)
    setIsCreating(false)
  }

  const handleCreate = async (input: Parameters<typeof createOutletAction>[2]) => {
    setIsBusy(true)
    const result = await createOutletAction(tenantId, tenantSlug, {
      ...input,
      sort_order: outlets.length,
    })
    setIsBusy(false)

    if (!result.success) {
      toast.error(result.error)
      return
    }
    setOutlets([...outlets, result.data])
    closeForm()
    toast.success(`${result.data.name} added`)
    router.refresh()
  }

  const handleUpdate = async (
    outletId: string,
    patch: Parameters<typeof updateOutletAction>[3]
  ) => {
    setIsBusy(true)
    const result = await updateOutletAction(tenantId, tenantSlug, outletId, patch)
    setIsBusy(false)

    if (!result.success) {
      toast.error(result.error)
      return
    }
    setOutlets(outlets.map((outlet) => (outlet.id === outletId ? result.data : outlet)))
    closeForm()
    toast.success(`${result.data.name} saved`)
    router.refresh()
  }

  const handleToggleActive = async (outlet: Outlet) => {
    const nextActive = !outlet.is_active
    const result = await setOutletActiveAction(tenantId, tenantSlug, outlet.id, nextActive)

    if (!result.success) {
      toast.error(result.error)
      return
    }
    setOutlets(outlets.map((row) => (row.id === outlet.id ? result.data : row)))
    toast.success(nextActive ? `${outlet.name} is open to customers` : `${outlet.name} hidden`)
    router.refresh()
  }

  const handleMove = async (outletId: string, direction: 'up' | 'down') => {
    const orderedIds = moveOutletOrder(
      outlets.map((outlet) => outlet.id),
      outletId,
      direction
    )
    // Reorder is a no-op at the ends; skip the round trip rather than writing
    // the same order back.
    if (orderedIds.every((id, index) => id === outlets[index]?.id)) return

    const reordered = orderedIds.map(
      (id, index) => ({ ...outlets.find((outlet) => outlet.id === id)!, sort_order: index })
    )
    setOutlets(reordered)

    const result = await reorderOutletsAction(tenantId, tenantSlug, orderedIds)
    if (!result.success) {
      setOutlets(outlets) // put the old order back; the save did not happen
      toast.error(result.error)
      return
    }
    router.refresh()
  }

  if (isCreating || editing) {
    return (
      <OutletForm
        outlet={editing}
        isSaving={isBusy}
        onCancel={closeForm}
        onSubmit={(input) =>
          editing ? handleUpdate(editing.id, input) : handleCreate(input)
        }
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setIsCreating(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add branch
        </Button>
      </div>

      {outlets.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <MapPin className="mx-auto mb-3 h-8 w-8 opacity-50" />
            <p className="font-medium text-foreground">No branches yet</p>
            <p className="text-sm">
              Until you add two or more active branches, customers see your menu exactly as they do
              today — no branch picker.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {outlets.map((outlet, index) => (
            <Card key={outlet.id} className={outlet.is_active ? undefined : 'opacity-60'}>
              <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{outlet.name}</span>
                    <Badge variant="outline">/{outlet.slug}</Badge>
                    {!outlet.is_active && <Badge variant="secondary">Hidden</Badge>}
                    {outlet.supports_pickup && <Badge variant="secondary">Pickup</Badge>}
                    {outlet.supports_delivery && <Badge variant="secondary">Delivery</Badge>}
                  </div>
                  {outlet.address && (
                    <p className="truncate text-sm text-muted-foreground">{outlet.address}</p>
                  )}
                  {outlet.latitude === null && (
                    <p className="text-sm text-amber-600">
                      No coordinates — this branch cannot be matched to a customer&apos;s location.
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Move ${outlet.name} up`}
                    disabled={index === 0}
                    onClick={() => handleMove(outlet.id, 'up')}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Move ${outlet.name} down`}
                    disabled={index === outlets.length - 1}
                    onClick={() => handleMove(outlet.id, 'down')}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setEditing(outlet)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleToggleActive(outlet)}>
                    {outlet.is_active ? 'Hide' : 'Show'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
