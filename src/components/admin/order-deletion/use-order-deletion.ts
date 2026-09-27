'use client'

/**
 * The deletion wizard's state. The order is fixed — choose, export, confirm —
 * and changing the choice after exporting throws the export away, so the file
 * the owner holds always lists exactly what the confirm step would delete.
 */
import { useCallback, useMemo, useState } from 'react'
import { downloadFile, CSV_TYPE } from '@/components/admin/inventory-import/download-file'
import { MANILA_OFFSET_HOURS } from '@/lib/order-deletion/constants'
import type { DeletionRequest, DeletionScope, ExecuteResult } from '@/lib/order-deletion/types'
import type { DeletionPreview } from '@/lib/order-deletion/service'
import {
  confirmDeletionRequest,
  fetchExport,
  fetchPreview,
  type DownloadedExport,
  type ListedOrder,
} from './api'

export type DeletionMode = 'range' | 'selected' | 'all'
export type WizardStep = 'choose' | 'export' | 'confirm' | 'done'

const DEFAULT_RANGE_DAYS = 30

function manilaDay(offsetDays = 0): string {
  const shifted = Date.now() + MANILA_OFFSET_HOURS * 3_600_000 + offsetDays * 86_400_000
  return new Date(shifted).toISOString().slice(0, 10)
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Try again.'
}

export function useOrderDeletion(tenantId: string) {
  const [step, setStep] = useState<WizardStep>('choose')
  const [mode, setModeState] = useState<DeletionMode>('range')
  const [from, setFrom] = useState(() => manilaDay(-DEFAULT_RANGE_DAYS))
  const [to, setTo] = useState(() => manilaDay())
  const [includeActive, setIncludeActive] = useState(false)
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set())
  const [listedOrders, setListedOrders] = useState<ListedOrder[] | null>(null)
  const [preview, setPreview] = useState<DeletionPreview | null>(null)
  const [exported, setExported] = useState<DownloadedExport | null>(null)
  const [result, setResult] = useState<ExecuteResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const scope = useMemo<DeletionScope>(() => {
    if (mode === 'all') return { kind: 'all' }
    if (mode === 'selected') return { kind: 'selected', orderIds: [...selectedIds] }
    return { kind: 'range', from, to }
  }, [mode, from, to, selectedIds])

  const request: DeletionRequest = useMemo(() => ({ scope, includeActive }), [scope, includeActive])

  /** Any change to what would be deleted invalidates the preview and the export. */
  const invalidate = useCallback(() => {
    setPreview(null)
    setExported(null)
    setError(null)
    setStep('choose')
  }, [])

  const run = useCallback(async (task: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await task()
    } catch (caught) {
      setError(messageOf(caught))
    } finally {
      setBusy(false)
    }
  }, [])

  const edit = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value)
    invalidate()
  }

  /** New dates make the picked list stale: drop it so the owner never ticks from old context. */
  const editDates = (setter: (value: string) => void) => (value: string) => {
    setter(value)
    setListedOrders(null)
    setSelectedIds(new Set())
    invalidate()
  }

  const loadOrdersToPick = useCallback(
    () =>
      run(async () => {
        const response = await fetchPreview(tenantId, { scope: { kind: 'range', from, to }, includeActive }, true)
        setListedOrders(response.orders ?? [])
        setSelectedIds(new Set())
        invalidate()
      }),
    [run, tenantId, from, to, includeActive, invalidate]
  )

  const toggleSelected = useCallback(
    (orderId: string) => {
      setSelectedIds((current) => {
        const next = new Set(current)
        if (next.has(orderId)) next.delete(orderId)
        else next.add(orderId)
        return next
      })
      invalidate()
    },
    [invalidate]
  )

  const reviewScope = useCallback(
    () =>
      run(async () => {
        const response = await fetchPreview(tenantId, request)
        setPreview(response.preview)
        if (response.preview.orderCount > 0) setStep('export')
      }),
    [run, tenantId, request]
  )

  const downloadExport = useCallback(
    () =>
      run(async () => {
        const file = await fetchExport(tenantId, request)
        downloadFile(file.csv, file.fileName, CSV_TYPE)
        setExported(file)
        setStep('confirm')
      }),
    [run, tenantId, request]
  )

  const confirm = useCallback(
    (password: string, confirmation: string) =>
      run(async () => {
        if (!exported) throw new Error('Download the export first.')
        const outcome = await confirmDeletionRequest(tenantId, {
          deletionId: exported.deletionId,
          password,
          confirmation,
        })
        setResult(outcome)
        setStep('done')
      }),
    [run, tenantId, exported]
  )

  const startOver = useCallback(() => {
    setResult(null)
    setListedOrders(null)
    setSelectedIds(new Set())
    invalidate()
  }, [invalidate])

  return {
    step,
    mode,
    from,
    to,
    includeActive,
    selectedIds,
    listedOrders,
    preview,
    exported,
    result,
    busy,
    error,
    setMode: edit(setModeState),
    setFrom: editDates(setFrom),
    setTo: editDates(setTo),
    setIncludeActive: edit(setIncludeActive),
    loadOrdersToPick,
    toggleSelected,
    reviewScope,
    downloadExport,
    confirm,
    startOver,
  }
}

export type OrderDeletionState = ReturnType<typeof useOrderDeletion>
