import Link from 'next/link'
import { ArrowRight, Flag } from 'lucide-react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRequestCaller } from '@/lib/auth/request-caller'
import { hasStartHere } from '@/lib/onboarding/start-here-eligibility'
import { loadStartHere, type StartHereTenant } from '@/lib/onboarding/start-path-data'
import { resolvePlatformOrigin } from '@/lib/onboarding/first-week'

/**
 * "Start here · 3 of 10 — next: Get the app" on top of the dashboard while a
 * new store still has path steps left (an unfinished path pulls the owner
 * back; Zeigarnik). Renders nothing for anyone else, and never fails the page.
 */
export async function StartHereNudge({ tenant }: { tenant: StartHereTenant }) {
  if (!(await hasStartHere(tenant.id))) return null
  try {
    const { user } = await getRequestCaller()
    const data = await loadStartHere(createAdminClient() as unknown as SupabaseClient, tenant, {
      userId: user?.id ?? null,
      shareUrl: null,
      platformOrigin: resolvePlatformOrigin(),
    })
    if (!data || data.path.isComplete) return null
    const next = data.path.units.flatMap((unit) => unit.steps).find((step) => step.state === 'current')
    return (
      <Link
        href={`/${tenant.slug}/admin/start`}
        className="flex items-center gap-3.5 rounded-2xl border-2 border-wn-coral bg-wn-coral-wash px-4 py-3.5 transition-[transform,box-shadow] [box-shadow:0_4px_0_var(--color-wn-coral)] active:translate-y-[2px] active:[box-shadow:0_2px_0_var(--color-wn-coral)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wn-coral focus-visible:ring-offset-2"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-wn-coral text-white" aria-hidden>
          <Flag className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] font-extrabold text-wn-ink">Start here · {data.path.done} of {data.path.total} done</span>
          {next && <span className="block truncate text-[13px] text-wn-stone">Next: {next.title}</span>}
        </span>
        <span className="hidden shrink-0 items-center gap-1 text-[13.5px] font-bold text-wn-coral-deep sm:inline-flex">
          Continue <ArrowRight className="h-4 w-4" aria-hidden />
        </span>
      </Link>
    )
  } catch (error) {
    console.error('[start-here] nudge failed', error instanceof Error ? error.message : error)
    return null
  }
}
