import type { SupabaseClient } from '@supabase/supabase-js'
import type { CutoffSchedule } from '@/lib/business-day/trading-day'
import type { CashPageContext } from '@/lib/cash/cash-page'
import { listServicePeriods, type ServicePeriod } from '@/lib/cash/service-periods'
import { asCashSettingsDb, readCashSettings } from '@/lib/cash/settings'
import { nextBusinessDayKey } from '@/lib/inventory/business-day'
import { createClient } from '@/lib/supabase/server'
import { BusinessDayCard } from '@/components/admin/cash/business-day-card'
import { CashRulesCard } from '@/components/admin/cash/cash-rules-card'
import { CashLoadFailed } from '@/components/admin/cash/cash-states'
import { ServicePeriodsCard } from '@/components/admin/cash/service-periods-card'

interface CashSettingsSectionProps {
  context: CashPageContext
  schedule: CutoffSchedule
  isScheduleFallback: boolean
  isPlatformBackend: boolean
  /** Branches for tying a shift to one; null = one location. */
  branches: Array<{ value: string; label: string }> | null
}

/** A change saved for a business day that has not started yet. */
function pendingChange(schedule: CutoffSchedule, today: string): { effectiveFrom: string; cutoffMinutes: number } | null {
  return schedule.find((change) => change.effectiveFrom > today) ?? null
}

async function readPeriods(db: SupabaseClient, tenantId: string): Promise<{ periods: ServicePeriod[]; error: string | null }> {
  try {
    return { periods: await listServicePeriods(db, tenantId), error: null }
  } catch (error) {
    console.error('[cash] service periods unavailable', error instanceof Error ? error.message : error)
    return { periods: [], error: 'Your shifts couldn’t load. Reload the page to try again.' }
  }
}

/** The Settings tab: business day, named shifts, cash rules (UX §4.6/§4.7, same rules as the app). */
export async function CashSettingsSection({ context, schedule, isScheduleFallback, isPlatformBackend, branches }: CashSettingsSectionProps) {
  const db = (await createClient()) as unknown as SupabaseClient
  const [settings, periods] = await Promise.all([readCashSettings(asCashSettingsDb(db), context.tenantId), readPeriods(db, context.tenantId)])
  const lockedOutletId = context.scope.kind === 'branch' ? context.scope.outletId : null

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="flex flex-col gap-5">
        <BusinessDayCard
          tenantSlug={context.tenantSlug}
          currentMinutes={context.cutoffMinutes}
          pending={pendingChange(schedule, context.today)}
          likelyStartDay={nextBusinessDayKey(context.today)}
          canChange={context.canChangeCutoff && !isScheduleFallback}
          isFallback={isScheduleFallback}
        />
        <ServicePeriodsCard
          tenantSlug={context.tenantSlug}
          periods={periods.periods}
          branches={branches}
          lockedOutletId={lockedOutletId}
          outletNames={context.outletNames}
          loadError={periods.error}
        />
      </div>
      {settings.ok ? (
        <CashRulesCard tenantSlug={context.tenantSlug} settings={settings.data} isPlatformBackend={isPlatformBackend} />
      ) : (
        <CashLoadFailed what="your cash rules" />
      )}
    </div>
  )
}
