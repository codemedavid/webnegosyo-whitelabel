'use client'

import { useState } from 'react'
import { ScanLine } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { updatePickupScanAction } from '@/actions/tenants'

interface PickupScanCardProps {
  tenantId: string
  initialEnabled: boolean
}

/**
 * The store's switch for scan-to-collect pickup.
 *
 * Saves on toggle rather than behind a button: there is one value, and a
 * merchant flipping this at the counter should not have to find a Save.
 * A failed save snaps the switch back, so what is on screen is always what
 * the store is actually doing.
 */
export function PickupScanCard({ tenantId, initialEnabled }: PickupScanCardProps) {
  const [isEnabled, setIsEnabled] = useState(initialEnabled)
  const [isSaving, setIsSaving] = useState(false)

  const handleToggle = async (next: boolean) => {
    const previous = isEnabled
    setIsEnabled(next)
    setIsSaving(true)

    try {
      const result = await updatePickupScanAction(tenantId, next)
      if (result.error) {
        setIsEnabled(previous)
        toast.error(result.error)
        return
      }
      toast.success(next ? 'Scan to collect is on' : 'Scan to collect is off')
    } catch {
      setIsEnabled(previous)
      toast.error('Failed to save. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScanLine className="h-5 w-5" /> Scan to Collect
        </CardTitle>
        <CardDescription>
          Pickup customers get a QR code on their order page. Staff scan it in the merchant
          app to confirm they are handing the order to the right person.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3">
          <div className="max-w-md">
            <div className="font-medium">Show a collection code on pickup orders</div>
            <p className="text-sm text-muted-foreground">
              {isEnabled
                ? 'Turning this off hides the code straight away, including on orders already being prepared, and the app will stop accepting codes handed out earlier.'
                : 'Customers see no collection code, and the app will not confirm pickups by scanning. Hand orders over as usual.'}
            </p>
          </div>
          <Switch
            checked={isEnabled}
            disabled={isSaving}
            onCheckedChange={handleToggle}
            aria-label="Show a collection code on pickup orders"
          />
        </div>
      </CardContent>
    </Card>
  )
}
