import type { SupabaseClient } from '@supabase/supabase-js'
import type { CashPageContext } from '@/lib/cash/cash-page'
import { listRemittances, type Remittance } from '@/lib/cash/remittances'
import { createClient } from '@/lib/supabase/server'
import { CashLoadFailed } from '@/components/admin/cash/cash-states'
import { RemittancesInbox } from '@/components/admin/cash/remittances-inbox'

interface CashAcceptSectionProps {
  context: CashPageContext
  viewerUserId: string
}

/**
 * "To accept": every waiting or disputed remittance the caller reaches (any
 * day: an inbox), then what was answered on the business day shown. Read
 * through the caller's session; RLS decides what comes back.
 */
export async function CashAcceptSection({ context, viewerUserId }: CashAcceptSectionProps) {
  const db = (await createClient()) as unknown as SupabaseClient
  let open: Remittance[]
  let answered: Remittance[]
  try {
    ;[open, answered] = await Promise.all([
      listRemittances(db, { tenantId: context.tenantId, statuses: ['pending', 'disputed'], businessDay: null, outletId: context.outletId }),
      listRemittances(db, { tenantId: context.tenantId, statuses: ['accepted', 'resolved'], businessDay: context.day, outletId: context.outletId }),
    ])
  } catch (error) {
    console.error('[cash] remittances unavailable', { tenantId: context.tenantId, error: error instanceof Error ? error.message : String(error) })
    return <CashLoadFailed what="the remittances" />
  }

  // Oldest waiting first: it has waited longest.
  const byOldest = (a: Remittance, b: Remittance) => a.createdAt.localeCompare(b.createdAt)
  return (
    <div className="flex flex-col gap-5">
      <RemittancesInbox
        toAccept={open.filter((remittance) => remittance.status === 'pending').sort(byOldest)}
        disputed={open.filter((remittance) => remittance.status === 'disputed').sort(byOldest)}
        answered={answered}
        day={context.day}
        tenantSlug={context.tenantSlug}
        viewerUserId={viewerUserId}
        canResolve={context.canResolve}
        outletNames={context.outletNames}
      />
    </div>
  )
}
