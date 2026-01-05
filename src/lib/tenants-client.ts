/**
 * Client-side tenant service functions
 * Use these functions in client components instead of the server-side tenants-service.ts
 */
import { createClient } from '@/lib/supabase/client'
import type { Tenant } from '@/types/database'

/**
 * Fetch tenant by slug (client-side)
 */
export async function getTenantBySlugClient(slug: string): Promise<{ data: Tenant | null; error: Error | null }> {
    try {
        const supabase = createClient()
        const { data, error } = await supabase
            .from('tenants')
            .select('*')
            .eq('slug', slug)
            .maybeSingle()

        if (error) {
            return { data: null, error: new Error(error.message) }
        }

        return { data: data as Tenant | null, error: null }
    } catch (err) {
        return { data: null, error: err instanceof Error ? err : new Error('Unknown error') }
    }
}

/**
 * Fetch tenant by ID (client-side)
 */
export async function getTenantByIdClient(id: string): Promise<{ data: Tenant | null; error: Error | null }> {
    try {
        const supabase = createClient()
        const { data, error } = await supabase
            .from('tenants')
            .select('*')
            .eq('id', id)
            .maybeSingle()

        if (error) {
            return { data: null, error: new Error(error.message) }
        }

        return { data: data as Tenant | null, error: null }
    } catch (err) {
        return { data: null, error: err instanceof Error ? err : new Error('Unknown error') }
    }
}

/**
 * List all tenants (client-side)
 */
export async function listTenantsClient(): Promise<{ data: Tenant[]; error: Error | null }> {
    try {
        const supabase = createClient()
        const { data, error } = await supabase
            .from('tenants')
            .select('*')
            .order('created_at', { ascending: false })

        if (error) {
            return { data: [], error: new Error(error.message) }
        }

        return { data: (data as Tenant[]) || [], error: null }
    } catch (err) {
        return { data: [], error: err instanceof Error ? err : new Error('Unknown error') }
    }
}
