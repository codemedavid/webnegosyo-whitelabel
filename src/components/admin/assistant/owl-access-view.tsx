'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { listStaffAction, updateStaffPermissionsAction } from '@/app/actions/staff'
import { owlAccessRows, withOwlAccess, type OwlAccessRow } from '@/lib/assistant/access-list'

interface OwlAccessViewProps {
  tenantId: string
  tenantSlug: string
  onBack: () => void
}

/**
 * Owner-only: one switch per staff account for "Use the Owl assistant". Writes
 * through the ordinary staff writer, so the owner check, seat rules and
 * permission validation are the Staff screen's own.
 */
export function OwlAccessView({ tenantId, tenantSlug, onBack }: OwlAccessViewProps) {
  const [rows, setRows] = useState<OwlAccessRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)

  useEffect(() => {
    let isCurrent = true
    void listStaffAction(tenantId).then((result) => {
      if (!isCurrent) return
      if (result.success) setRows(owlAccessRows(result.data))
      else setError(result.error)
    })
    return () => {
      isCurrent = false
    }
  }, [tenantId])

  const flip = async (row: OwlAccessRow, allowed: boolean) => {
    setSavingId(row.userId)
    setError(null)
    // The switch saves the person's WHOLE list, so build it from a fresh read:
    // a Staff edit made since this sheet opened must not be overwritten.
    const fresh = await listStaffAction(tenantId)
    const current = fresh.success ? owlAccessRows(fresh.data).find((item) => item.userId === row.userId) : undefined
    if (!current) {
      setSavingId(null)
      setError(fresh.success ? 'That account is no longer on your team.' : fresh.error)
      return
    }
    const next = withOwlAccess(current.permissions, allowed)
    const result = await updateStaffPermissionsAction(tenantId, tenantSlug, row.userId, next)
    setSavingId(null)
    if (!result.success) {
      setError(result.error)
      return
    }
    setRows((list) => list?.map((item) => (item.userId === row.userId ? { ...item, hasOwl: allowed, permissions: next } : item)) ?? null)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-bold">Who can use Owl</p>
        <button type="button" onClick={onBack} className="text-xs font-semibold text-muted-foreground hover:underline">
          Back
        </button>
      </div>
      <p className="text-[12px] text-muted-foreground">
        You always can. Staff only see what their other permissions allow, and every change still waits for a Confirm tap.
      </p>
      {error ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-[13px] text-rose-800">{error}</p> : null}
      {rows === null && !error ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Loading" /> : null}
      {rows?.length === 0 ? <p className="text-[13px] text-muted-foreground">No staff accounts yet. Add them in Staff.</p> : null}
      {rows?.map((row) => (
        <div key={row.userId} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2 ring-1 ring-border">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold">{row.name}</p>
            {row.isBranchLocked ? <p className="text-[11px] text-muted-foreground">Branch accounts can’t use Owl yet</p> : null}
          </div>
          {savingId === row.userId ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden /> : null}
          <Switch
            checked={row.hasOwl}
            disabled={savingId !== null || row.isBranchLocked}
            onCheckedChange={(checked) => void flip(row, checked)}
            aria-label={`${row.name} can use Owl`}
          />
        </div>
      ))}
    </div>
  )
}
