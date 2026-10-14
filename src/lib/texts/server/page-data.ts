/**
 * Everything /admin/texts renders on first paint, in one parallel read.
 * Server-only; call after `requireTextsAccess(tenantId, 'view')`.
 *
 * A failure here throws to the page's error boundary ("Couldn't load your
 * texts"), except the live part, which degrades on its own (`readTextsLive`).
 */

import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { listAutomationsView } from '@/lib/sms-automations/api/reads'
import { listCampaignsView, readThirtyDayLine } from './campaign-reads'
import { readTextsLive } from './live'
import type { TextsCaller } from '../gate'
import type { TextsPageData } from '../types'

const PAGE_QUERY_TIMEOUT_MS = 8_000

export interface TextsTenant {
  id: string
  slug: string
  name: string
}

/** The web admin has no demo stores (the app's Demo Mode never reaches it). */
const IS_DEMO = false

export async function loadTextsPage(tenant: TextsTenant, caller: TextsCaller, now: Date): Promise<TextsPageData> {
  const db = createAdminClient({ timeoutMs: PAGE_QUERY_TIMEOUT_MS })
  // The live part swallows its own failures; the page's lists do not.
  const [campaigns, thirtyDays, automations, live] = await Promise.all([
    listCampaignsView(db, tenant.id, now),
    readThirtyDayLine(db, tenant.id, now),
    listAutomationsView(db, tenant.id, now),
    readTextsLive(db, tenant.id, now),
  ])
  return {
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    storeName: tenant.name,
    isOwner: caller.isOwner,
    isDemo: IS_DEMO,
    live,
    thirtyDays,
    campaigns,
    automations,
    optOutLine: automations.settings.optOutLine,
  }
}
