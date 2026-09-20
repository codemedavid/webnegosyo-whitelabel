'use client'

import { Suspense, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { readTableParam, writeLinkedTable } from '@/lib/table-qr-param'

interface TableLinkCaptureProps {
  tenantSlug: string
}

/**
 * Remembers the table a scanned code named, so checkout can fill it in.
 *
 * Renders nothing. Lives on the menu page because that is the only page the
 * QR ever lands on; every later route reads what this wrote.
 */
export function TableLinkCapture({ tenantSlug }: TableLinkCaptureProps) {
  return (
    // useSearchParams needs a Suspense boundary above it, as in OutletGate.
    <Suspense fallback={null}>
      <TableLinkCaptureInner tenantSlug={tenantSlug} />
    </Suspense>
  )
}

function TableLinkCaptureInner({ tenantSlug }: TableLinkCaptureProps) {
  const searchParams = useSearchParams()
  const label = readTableParam((key) => searchParams?.get(key) ?? null)

  useEffect(() => {
    if (!label || typeof window === 'undefined') return
    writeLinkedTable(window.localStorage, tenantSlug, label, Date.now())
  }, [label, tenantSlug])

  return null
}
