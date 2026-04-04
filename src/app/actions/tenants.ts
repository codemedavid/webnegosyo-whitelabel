'use server'

import { getTenants } from '@/lib/queries/tenants-server'

export async function fetchTenants(options: {
  search?: string
  page?: number
}) {
  return getTenants(options)
}
