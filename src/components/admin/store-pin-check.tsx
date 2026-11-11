'use client'

import { useCallback, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { checkStorePinAddressAction } from '@/app/actions/store-pin'

interface PinSnapshot {
  address: string
  lat: number
  lng: number
}

function sameSnapshot(a: PinSnapshot | null, b: PinSnapshot): boolean {
  return a !== null && a.address === b.address && a.lat === b.lat && a.lng === b.lng
}

/**
 * One question before a store or branch location is saved: when the pin is
 * far from the typed address, show how far and let the owner fix it or save
 * anyway. Asked once per pin + address; a failed check never blocks a save.
 */
export function useStorePinCheck(tenantId: string | null) {
  const [mismatchKm, setMismatchKm] = useState<number | null>(null)
  const [acknowledged, setAcknowledged] = useState<PinSnapshot | null>(null)
  const [warned, setWarned] = useState<PinSnapshot | null>(null)

  /** True when the save may go ahead now. */
  const ensurePinMatchesAddress = useCallback(
    async (address: string, lat: number | null, lng: number | null): Promise<boolean> => {
      if (lat === null || lng === null || address.trim() === '') return true
      const snapshot = { address: address.trim(), lat, lng }
      if (sameSnapshot(acknowledged, snapshot)) return true
      // A second Save on the same warning is the owner's "save anyway".
      if (sameSnapshot(warned, snapshot)) {
        setAcknowledged(snapshot)
        setMismatchKm(null)
        return true
      }
      try {
        const result = await checkStorePinAddressAction(tenantId, snapshot.address, lat, lng)
        if (result.mismatchKm === null) {
          setMismatchKm(null)
          return true
        }
        setWarned(snapshot)
        setMismatchKm(result.mismatchKm)
        return false
      } catch (error) {
        console.error('[store-pin] check failed:', error)
        return true
      }
    },
    [acknowledged, tenantId, warned],
  )

  return { mismatchKm, ensurePinMatchesAddress }
}

interface StorePinMismatchNoticeProps {
  mismatchKm: number | null
  onSaveAnyway: () => void
  isSaving?: boolean
}

export function StorePinMismatchNotice({ mismatchKm, onSaveAnyway, isSaving = false }: StorePinMismatchNoticeProps) {
  if (mismatchKm === null) return null
  const km = mismatchKm >= 10 ? Math.round(mismatchKm) : Math.round(mismatchKm * 10) / 10
  return (
    <div role="alert" className="flex flex-wrap items-start gap-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        Your pin is {km} km from the address you typed. Riders go to the pin, so move it to your entrance or fix the
        address. If both are right, save anyway.
      </p>
      <Button type="button" size="sm" variant="outline" onClick={onSaveAnyway} disabled={isSaving}>
        Save anyway
      </Button>
    </div>
  )
}
