'use server'

import {
  getTenants,
  type TenantSort,
  type TenantStatusFilter,
  type TenantFeatureFilter,
} from '@/lib/queries/tenants-server'
import {
  getTenantMetrics,
  type TenantMetrics,
} from '@/lib/queries/tenant-metrics-server'
import { getCurrentUserRole } from '@/lib/admin-service'

/**
 * Server Actions are reachable as public POST endpoints regardless of the
 * middleware page gate, so each one must enforce authorization itself.
 * Both actions below expose the full tenant list and metrics, which is
 * superadmin-only data.
 */
async function assertSuperadmin(): Promise<void> {
  const role = (await getCurrentUserRole()) as { role?: string } | null
  if (!role || role.role !== 'superadmin') {
    throw new Error('Forbidden: Superadmin access required')
  }
}

export async function fetchTenants(options: {
  search?: string
  page?: number
  status?: TenantStatusFilter
  feature?: TenantFeatureFilter
  sort?: TenantSort
}) {
  await assertSuperadmin()
  return getTenants(options)
}

export async function fetchTenantMetrics(
  tenantIds: string[]
): Promise<Record<string, TenantMetrics>> {
  await assertSuperadmin()
  return getTenantMetrics(tenantIds)
}
