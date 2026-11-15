import 'server-only'

import { getRequestCaller } from '@/lib/auth/request-caller'
import { getCachedTenantById } from '@/lib/cache'
import type { OrderBackend } from '@/lib/order-backend'
import { loadReportRequest, reportClient } from '@/lib/reports/read/load-report-context'
import type { ReportRefusal } from '@/lib/reports/read/report-scope'
import { hasPermission } from '@/lib/staff-permissions'
import { createClient } from '@/lib/supabase/server'
import type { ExportRequest } from '../request-schema'
import { toExportSearchRecord } from '../request-schema'
import type { ExportInput } from '../run-export'

export type LoadedExport =
  | { kind: 'ready'; input: ExportInput; userId: string }
  | { kind: 'signed_out' }
  | { kind: 'not_found' }
  | { kind: 'refused'; reason: ReportRefusal }
  | { kind: 'unsupported'; backend: OrderBackend }

/**
 * Everything an export needs, decided for THIS caller: the report context
 * (access, period, branch — fails closed; a branch-locked account always gets
 * its own branch), the caller's staff keys, and the caller's own session
 * clients. No service-role client: RLS reads every row.
 */
export async function loadExportInput(request: ExportRequest, now: number = Date.now()): Promise<LoadedExport> {
  const { user, appUser, roleError } = await getRequestCaller()
  if (!user) return { kind: 'signed_out' }
  const [{ page }, tenant] = await Promise.all([
    loadReportRequest(request.tenantId, toExportSearchRecord(request)),
    getCachedTenantById(request.tenantId),
  ])
  if (page.kind === 'not_found' || !tenant) return { kind: 'not_found' }
  if (page.kind === 'refused') return { kind: 'refused', reason: page.reason }
  if (page.kind === 'unsupported') return { kind: 'unsupported', backend: page.backend }

  // Fail closed: an errored account read holds no key.
  const caller = roleError ? null : appUser
  const sessionClient = await createClient()
  return {
    kind: 'ready',
    userId: user.id,
    input: {
      context: page.context,
      storeName: tenant.name?.trim() || tenant.slug,
      access: { has: (key) => (caller ? hasPermission(caller, key) : false) },
      reportClient: await reportClient(),
      detailClient: sessionClient,
      bookClient: sessionClient,
      sheets: request.sheets,
      now,
    },
  }
}
