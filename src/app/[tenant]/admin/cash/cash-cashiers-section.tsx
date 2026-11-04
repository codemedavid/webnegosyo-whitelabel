import type { SupabaseClient } from '@supabase/supabase-js'
import { previousBusinessDayKey } from '@/lib/inventory/business-day'
import { readCashByStaff, readCashSummary } from '@/lib/cash/cash-reports'
import { asCashRpcClient } from '@/lib/cash/cash-rpc'
import type { CashPageContext } from '@/lib/cash/cash-page'
import { createClient } from '@/lib/supabase/server'
import { buildCashierTrends } from '@/components/admin/cash/cashiers-model'
import { CashiersView } from '@/components/admin/cash/cashiers-view'
import { ReportSection } from '@/components/admin/reports/report-section'

/** "Cashiers": short & over per cashier over the last 30 or 90 business days (report_cash_*). */
export async function CashCashiersSection({ context }: { context: CashPageContext }) {
  const db = (await createClient()) as unknown as SupabaseClient
  const client = asCashRpcClient(db)
  let fromDay = context.today
  for (let index = 1; index < context.range; index += 1) fromDay = previousBusinessDayKey(fromDay)
  const range = { tenantId: context.tenantId, fromDay, toDay: context.today, outletId: context.outletId }

  const [shifts, byStaff] = await Promise.all([readCashSummary(client, range), readCashByStaff(client, range)])
  if (!shifts.ok || !byStaff.ok) {
    const message = !shifts.ok ? shifts.error.message : !byStaff.ok ? byStaff.error.message : undefined
    return <ReportSection title="Cashier short & over" isError errorMessage={message} />
  }
  return (
    <CashiersView
      trends={buildCashierTrends(shifts.data, byStaff.data)}
      range={context.range}
      tenantSlug={context.tenantSlug}
      branch={context.outletId}
    />
  )
}
