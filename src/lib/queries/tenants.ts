import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listTenantsClient,
  getTenantByIdClient,
  getTenantBySlugClient,
} from '@/lib/tenants-client'
import {
  createTenantAction,
  updateTenantAction,
} from '@/actions/tenants'
import type { TenantInput } from '@/lib/tenants-service'
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
      const { data, error } = await listTenantsClient()
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
      const { data, error } = await getTenantByIdClient(id)
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
      const { data, error } = await getTenantBySlugClient(slug)
      if (error) throw error
      return data
    },
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
  })
}

// Hook to create tenant with optimistic updates
// Note: createTenantAction redirects on success, so this mutation won't return data
export function useCreateTenant() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: TenantInput) => {
      const result = await createTenantAction(input)
      // The action returns { error: string } on failure, or redirects on success
      if (result?.error) {
        throw new Error(result.error)
      }
      // If no error and no redirect, invalidate cache
    },
    onSuccess: () => {
      // Invalidate and refetch tenant list
      queryClient.invalidateQueries({ queryKey: tenantKeys.lists() })
    },
  })
}

// Hook to update tenant with optimistic updates
export function useUpdateTenant() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: TenantInput }) => {
      const result = await updateTenantAction(id, input)
      // Handle error case
      if ('error' in result && result.error) {
        throw new Error(result.error)
      }
      // Handle success case
      if ('data' in result && result.data) {
        return result.data as Tenant
      }
      throw new Error('Unexpected response from server')
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

// Hook to delete tenant
// Note: This calls the API directly since there's no server action for delete
export function useDeleteTenant() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      // For now, we need to call the delete endpoint directly via fetch
      // since there's no deleteTenantAction server action
      const response = await fetch(`/api/tenants/${id}`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        const error = await response.text()
        throw new Error(error || 'Failed to delete tenant')
      }
    },
    onSuccess: (_, id) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: tenantKeys.detail(id) })

      // Invalidate list to reflect deletion
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
        const { data, error } = await getTenantByIdClient(id)
        if (error) throw error
        return data
      },
      staleTime: 5 * 60 * 1000,
    })
  }
}

