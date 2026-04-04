import { createAdminClient } from '@/lib/supabase/admin'
import type { CheckoutLeadStatus } from '@/types/database'

export interface CheckoutLeadStats {
  totalLeads: number
  newThisWeek: number
  paidCount: number
  liveCount: number
  conversionRate: number
  statusBreakdown: Record<CheckoutLeadStatus, number>
}

function round1dp(n: number): number {
  return Math.round(n * 10) / 10
}

export async function getCheckoutLeadStats(): Promise<CheckoutLeadStats> {
  const supabase = createAdminClient()

  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const [totalResult, newThisWeekResult, allLeadsResult] = await Promise.all([
    supabase.from('checkout_leads').select('id', { count: 'exact', head: true }),
    supabase
      .from('checkout_leads')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', sevenDaysAgo.toISOString()),
    supabase.from('checkout_leads').select('status'),
  ])

  const totalLeads = totalResult.count ?? 0
  const newThisWeek = newThisWeekResult.count ?? 0

  // Build status breakdown from all leads
  const statusBreakdown: Record<CheckoutLeadStatus, number> = {
    initiated: 0,
    paid: 0,
    setup_in_progress: 0,
    live: 0,
    cancelled: 0,
  }

  for (const row of allLeadsResult.data ?? []) {
    const s = row.status as CheckoutLeadStatus
    if (s in statusBreakdown) {
      statusBreakdown[s]++
    }
  }

  const paidCount = statusBreakdown.paid
  const liveCount = statusBreakdown.live

  // Conversion rate: leads that reached "live" out of total (excluding cancelled)
  const nonCancelled = totalLeads - statusBreakdown.cancelled
  const conversionRate = nonCancelled > 0 ? round1dp((liveCount / nonCancelled) * 100) : 0

  return {
    totalLeads,
    newThisWeek,
    paidCount,
    liveCount,
    conversionRate,
    statusBreakdown,
  }
}
