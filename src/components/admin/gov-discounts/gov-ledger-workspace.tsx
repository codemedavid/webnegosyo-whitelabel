'use client'

import { useMemo, useState } from 'react'
import type { GovDiscountKind } from '@/lib/gov-discount'
import type { GrantEntry, OutletName } from '@/lib/gov-discount-reports/types'
import { GovClaimDetailSheet } from './gov-claim-detail-sheet'
import { GovLedgerList } from './gov-ledger-list'
import { GovNeedsALook } from './gov-needs-a-look'

export interface GovLedgerWorkspaceProps {
  tenantId: string
  tenantSlug: string
  grants: readonly GrantEntry[]
  grantCount: number
  needsALook: readonly GrantEntry[]
  kinds: readonly GovDiscountKind[]
  /** Empty for a single-location store. */
  outlets: readonly OutletName[]
}

/**
 * "Needs a look" and the full list share one detail sheet. The selection is
 * an id, so after a review re-renders the page the sheet shows the fresh
 * history from the new props rather than a stale copy.
 */
export function GovLedgerWorkspace({
  tenantId,
  tenantSlug,
  grants,
  grantCount,
  needsALook,
  kinds,
  outlets,
}: GovLedgerWorkspaceProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const byId = useMemo(
    () => new Map([...grants, ...needsALook].map((grant) => [grant.id, grant])),
    [grants, needsALook],
  )
  const selected = selectedId === null ? null : byId.get(selectedId) ?? null
  const branchName =
    selected && outlets.length > 1
      ? outlets.find((outlet) => outlet.id === selected.outletId)?.name ?? 'No branch recorded'
      : null

  return (
    <>
      <GovNeedsALook grants={needsALook} onOpen={setSelectedId} />
      <GovLedgerList grants={grants} kinds={kinds} totalCount={grantCount} onOpen={setSelectedId} />
      <GovClaimDetailSheet
        grant={selected}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        branchName={branchName}
        onClose={() => setSelectedId(null)}
      />
    </>
  )
}
