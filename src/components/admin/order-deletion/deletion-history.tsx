'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { describeScope } from '@/lib/order-deletion/scope'
import type { DeletionRecord } from '@/lib/order-deletion/types'
import { formatPeso } from '@/lib/outlets/branch-format'
import { fetchHistory, restoreDeletionRequest } from './api'

const STATUS_LABEL: Record<DeletionRecord['status'], string> = {
  exported: 'Exported, not deleted',
  deleted: 'Deleted — restorable',
  restored: 'Restored',
  purged: 'Erased',
  expired: 'Export expired',
}

function when(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })
}

function isRestorable(deletion: DeletionRecord): boolean {
  return deletion.status === 'deleted' && !!deletion.purge_after && new Date(deletion.purge_after) > new Date()
}

/** `refreshKey` changes whenever a deletion completes, so the list reloads. */
export function DeletionHistory({ tenantId, refreshKey }: { tenantId: string; refreshKey: unknown }) {
  const [deletions, setDeletions] = useState<DeletionRecord[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [restoringId, setRestoringId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setDeletions(await fetchHistory(tenantId))
      setError(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load the history.')
    }
  }, [tenantId])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  const restore = async (deletionId: string) => {
    setRestoringId(deletionId)
    try {
      await restoreDeletionRequest(tenantId, deletionId)
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not restore those orders.')
    } finally {
      setRestoringId(null)
    }
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!deletions) return <p className="text-sm text-muted-foreground">Loading history…</p>
  if (deletions.length === 0) return <p className="text-sm text-muted-foreground">No orders have been deleted.</p>

  return (
    <ul className="divide-y rounded-md border">
      {deletions.map((deletion) => (
        <li key={deletion.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
          <div className="min-w-0 flex-1">
            <p className="font-medium">{describeScope(deletion.scope)}</p>
            <p className="text-muted-foreground">
              {deletion.deleted_order_count ?? deletion.order_count} orders · {formatPeso(deletion.order_total)} ·{' '}
              {when(deletion.deleted_at ?? deletion.exported_at)}
            </p>
            {isRestorable(deletion) && (
              <p className="text-xs text-muted-foreground">Restorable until {when(deletion.purge_after)}</p>
            )}
          </div>
          <Badge variant={deletion.status === 'deleted' ? 'destructive' : 'secondary'}>
            {STATUS_LABEL[deletion.status]}
          </Badge>
          {isRestorable(deletion) && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" size="sm" variant="outline" disabled={restoringId !== null}>
                  {restoringId === deletion.id ? 'Restoring…' : 'Restore'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Restore these orders?</AlertDialogTitle>
                  <AlertDialogDescription>
                    The {deletion.deleted_order_count} orders come back exactly as they were, with their
                    original order numbers. They will count in your dashboard again.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void restore(deletion.id)}>Restore</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </li>
      ))}
    </ul>
  )
}
