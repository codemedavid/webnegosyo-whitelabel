import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export interface TenantOrderStats {
    tenant_id: string
    tenant_name: string
    tenant_slug: string
    is_active: boolean
    order_count: number
}

/**
 * Fetch top active tenants by order count for a given time range.
 * 
 * @param range - '3d' for last 3 days, '7d' for last 7 days
 * @returns Array of tenants sorted by order count (descending)
 */
export const getTopActiveTenants = cache(async (range: '3d' | '7d'): Promise<TenantOrderStats[]> => {
    const supabase = await createClient()

    // Calculate the start date based on range
    const now = new Date()
    const daysAgo = range === '3d' ? 3 : 7
    const startDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000)
    const startDateISO = startDate.toISOString()

    // First, get all orders within the date range grouped by tenant_id
    const { data: orderCounts, error: ordersError } = await supabase
        .from('orders')
        .select('tenant_id')
        .gte('created_at', startDateISO)

    if (ordersError) {
        console.error('Error fetching order counts:', ordersError)
        return []
    }

    // Count orders per tenant
    const countMap: Record<string, number> = {}
    const orders = orderCounts as { tenant_id: string }[] | null
    for (const order of orders || []) {
        countMap[order.tenant_id] = (countMap[order.tenant_id] || 0) + 1
    }

    // Get tenant details for tenants with orders
    const tenantIds = Object.keys(countMap)

    if (tenantIds.length === 0) {
        return []
    }

    const { data: tenants, error: tenantsError } = await supabase
        .from('tenants')
        .select('id, name, slug, is_active')
        .in('id', tenantIds)

    if (tenantsError) {
        console.error('Error fetching tenant details:', tenantsError)
        return []
    }

    // Combine tenant info with order counts
    const tenantList = tenants as { id: string; name: string; slug: string; is_active: boolean }[] | null
    const results: TenantOrderStats[] = (tenantList || []).map(tenant => ({
        tenant_id: tenant.id,
        tenant_name: tenant.name,
        tenant_slug: tenant.slug,
        is_active: tenant.is_active,
        order_count: countMap[tenant.id] || 0
    }))

    // Sort by order count descending
    results.sort((a, b) => b.order_count - a.order_count)

    return results
})

/**
 * Get total order count for the entire platform within a time range.
 */
export const getTotalOrders = cache(async (range: '3d' | '7d'): Promise<number> => {
    const supabase = await createClient()

    const now = new Date()
    const daysAgo = range === '3d' ? 3 : 7
    const startDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000)
    const startDateISO = startDate.toISOString()

    const { count, error } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startDateISO)

    if (error) {
        console.error('Error fetching total orders:', error)
        return 0
    }

    return count || 0
})
