import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { 
  listTenantsSupabase, 
  getTenantByIdSupabase, 
  getTenantBySlugSupabase,
  createTenantSupabase,
  updateTenantSupabase,
  type TenantInput 
} from '@/lib/tenants-service'
import type { Tenant } from '@/types/database'

// Query keys for cache management
export const tenantKeys = {
  all: ['tenants'] as const,
  lists: () => [...tenantKeys.all, 'list'] as const,
  list: (filters?: string) => [...tenantKeys.lists(), { filters }] as const,
  details: () => [...tenantKeys.all, 'detail'] as const,
  detail: (id: string) => [...tenantKeys.details(), id] as const,
  bySlug: (slug: string) => [...tenantKeys.all, 'slug', slug] as const,
}

// Hook to fetch all tenants with caching
export function useTenants() {
  return useQuery({
    queryKey: tenantKeys.lists(),
    queryFn: async () => {
      const { data, error } = await listTenantsSupabase()
      if (error) throw error
      return data
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

// Hook to fetch tenant by ID with caching
export function useTenant(id: string) {
  return useQuery({
    queryKey: tenantKeys.detail(id),
    queryFn: async () => {
      const { data, error } = await getTenantByIdSupabase(id)
      if (error) throw error
      return data
    },
    enabled: !!id, // Only run if id exists
    staleTime: 5 * 60 * 1000,
  })
}

// Hook to fetch tenant by slug with caching
export function useTenantBySlug(slug: string) {
  return useQuery({
    queryKey: tenantKeys.bySlug(slug),
    queryFn: async () => {
      const { data, error } = await getTenantBySlugSupabase(slug)
      if (error) throw error
      return data
    },
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
  })
}

// Hook to create tenant with optimistic updates
export function useCreateTenant() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: TenantInput) => {
      return await createTenantSupabase(input)
    },
    onSuccess: (newTenant) => {
      // Invalidate and refetch tenant list
      queryClient.invalidateQueries({ queryKey: tenantKeys.lists() })
      
      // Set the new tenant in cache
      queryClient.setQueryData(tenantKeys.detail(newTenant.id), newTenant)
    },
  })
}

// Hook to update tenant with optimistic updates
export function useUpdateTenant() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: TenantInput }) => {
      return await updateTenantSupabase(id, input)
    },
    onMutate: async ({ id, input }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: tenantKeys.detail(id) })

      // Snapshot previous value
      const previousTenant = queryClient.getQueryData<Tenant>(tenantKeys.detail(id))

      // Optimistically update
      if (previousTenant) {
        queryClient.setQueryData(tenantKeys.detail(id), {
          ...previousTenant,
          ...input,
        })
      }

      return { previousTenant }
    },
    onError: (err, { id }, context) => {
      // Rollback on error
      if (context?.previousTenant) {
        queryClient.setQueryData(tenantKeys.detail(id), context.previousTenant)
      }
    },
    onSuccess: (updatedTenant, { id }) => {
      // Update cache with server response
      queryClient.setQueryData(tenantKeys.detail(id), updatedTenant)
      
      // Invalidate list to reflect changes
      queryClient.invalidateQueries({ queryKey: tenantKeys.lists() })
    },
  })
}

// Prefetch tenant for faster navigation
export function usePrefetchTenant() {
  const queryClient = useQueryClient()

  return (id: string) => {
    queryClient.prefetchQuery({
      queryKey: tenantKeys.detail(id),
      queryFn: async () => {
        const { data, error } = await getTenantByIdSupabase(id)
        if (error) throw error
        return data
      },
      staleTime: 5 * 60 * 1000,
    })
  }
}

