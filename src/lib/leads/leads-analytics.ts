import { createAdminClient } from '@/lib/supabase/admin'
import type { LeadStats, WeeklyLeadData } from '@/lib/leads/types'

/**
 * Returns high-level statistics for the leads pipeline.
 */
export async function getLeadStats(): Promise<LeadStats> {
  const supabase = createAdminClient()

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = today.toISOString().split('T')[0]

  const sevenDaysAgo = new Date(today)
  sevenDaysAgo.setDate(today.getDate() - 7)

  // First day of current month
  const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  // First day of previous month
  const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  // First day of next month (end boundary for current month)
  const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1)

  // ----- Run all independent queries in parallel -----
  const [
    totalResult,
    newThisWeekResult,
    currentMonthResult,
    prevMonthResult,
    pendingCallsResult,
    pendingTodayResult,
    historyResult,
  ] = await Promise.all([
    // 1. Total leads
    supabase.from('leads').select('id', { count: 'exact', head: true }),

    // 2. Leads created in last 7 days
    supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', sevenDaysAgo.toISOString()),

    // 3. Leads created this month (for conversion rate)
    supabase
      .from('leads')
      .select('id, status')
      .gte('created_at', currentMonthStart.toISOString())
      .lt('created_at', nextMonthStart.toISOString()),

    // 4. Leads created last month (for conversion delta)
    supabase
      .from('leads')
      .select('id, status')
      .gte('created_at', prevMonthStart.toISOString())
      .lt('created_at', currentMonthStart.toISOString()),

    // 5. Pending calls: booking_date >= today, status not 'lost' or 'converted'
    supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .gte('booking_date', todayStr)
      .not('status', 'in', '("lost","converted")'),

    // 6. Pending today: booking_date = today, status not 'lost' or 'converted'
    supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('booking_date', todayStr)
      .not('status', 'in', '("lost","converted")'),

    // 7. Status history entries where new_status != 'new' — for avg response time
    supabase
      .from('lead_status_history')
      .select('lead_id, created_at')
      .neq('new_status', 'new')
      .order('created_at', { ascending: true }),
  ])

  // ----- Process results -----

  // 1. Total leads
  const totalLeads = totalResult.count ?? 0

  // 2. New this week
  const newThisWeek = newThisWeekResult.count ?? 0

  // 3. Conversion rate — current month
  const currentMonthLeads = currentMonthResult.data ?? []
  const currentMonthTotal = currentMonthLeads.length
  const currentMonthConverted = currentMonthLeads.filter(
    (l: { status: string }) => l.status === 'converted'
  ).length
  const conversionRate =
    currentMonthTotal > 0
      ? round1dp((currentMonthConverted / currentMonthTotal) * 100)
      : 0

  // 4. Conversion rate — previous month (for delta)
  const prevMonthLeads = prevMonthResult.data ?? []
  const prevMonthTotal = prevMonthLeads.length
  const prevMonthConverted = prevMonthLeads.filter(
    (l: { status: string }) => l.status === 'converted'
  ).length
  const prevConversionRate =
    prevMonthTotal > 0
      ? round1dp((prevMonthConverted / prevMonthTotal) * 100)
      : 0
  const conversionDelta = round1dp(conversionRate - prevConversionRate)

  // 5 & 6. Pending calls
  const pendingCalls = pendingCallsResult.count ?? 0
  const pendingToday = pendingTodayResult.count ?? 0

  // 7. Average response time
  // Group history rows by lead_id; keep only the earliest entry per lead.
  type HistoryRow = { lead_id: string; created_at: string }
  const historyRows: HistoryRow[] = (historyResult.data as HistoryRow[] | null) ?? []

  // Build map: lead_id → earliest non-'new' history timestamp
  const firstResponseMap = new Map<string, string>()
  for (const row of historyRows) {
    if (!firstResponseMap.has(row.lead_id)) {
      firstResponseMap.set(row.lead_id, row.created_at)
    }
  }

  let avgResponseTimeHours = 0

  if (firstResponseMap.size > 0) {
    const leadIds = Array.from(firstResponseMap.keys())

    const leadsResult = await supabase
      .from('leads')
      .select('id, created_at')
      .in('id', leadIds)

    const leadsData: { id: string; created_at: string }[] = (leadsResult.data as { id: string; created_at: string }[] | null) ?? []

    if (leadsData.length > 0) {
      let totalHours = 0
      let validCount = 0

      for (const lead of leadsData) {
        const firstResponse = firstResponseMap.get(lead.id)
        if (!firstResponse) continue

        const created = new Date(lead.created_at).getTime()
        const responded = new Date(firstResponse).getTime()
        const diffHours = (responded - created) / (1000 * 60 * 60)

        if (diffHours >= 0) {
          totalHours += diffHours
          validCount++
        }
      }

      avgResponseTimeHours =
        validCount > 0 ? round1dp(totalHours / validCount) : 0
    }
  }

  return {
    totalLeads,
    newThisWeek,
    conversionRate,
    conversionDelta,
    pendingCalls,
    pendingToday,
    avgResponseTimeHours,
  }
}

/**
 * Returns weekly lead creation counts for the last N weeks.
 * Weeks start on Monday. Returns an ascending array of { week: 'YYYY-MM-DD', count: N }.
 */
export async function getLeadsByWeek(weeks = 8): Promise<WeeklyLeadData[]> {
  const supabase = createAdminClient()

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - weeks * 7)
  cutoff.setHours(0, 0, 0, 0)

  const result = await supabase
    .from('leads')
    .select('created_at')
    .gte('created_at', cutoff.toISOString())
    .order('created_at', { ascending: true })

  const rows: { created_at: string }[] = (result.data as { created_at: string }[] | null) ?? []

  if (rows.length === 0) return []

  // Group by Monday-start week
  const weekMap = new Map<string, number>()

  for (const row of rows) {
    const date = new Date(row.created_at)
    const monday = getMondayOfWeek(date)
    const key = monday.toISOString().split('T')[0]
    weekMap.set(key, (weekMap.get(key) ?? 0) + 1)
  }

  return Array.from(weekMap.entries())
    .map(([week, count]) => ({ week, count }))
    .sort((a, b) => (a.week < b.week ? -1 : a.week > b.week ? 1 : 0))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round1dp(n: number): number {
  return Math.round(n * 10) / 10
}

/**
 * Returns the Monday of the ISO week that contains `date`.
 */
function getMondayOfWeek(date: Date): Date {
  const d = new Date(date)
  // getDay(): 0=Sun, 1=Mon, ..., 6=Sat
  const day = d.getDay()
  // Distance to the most recent Monday
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}
