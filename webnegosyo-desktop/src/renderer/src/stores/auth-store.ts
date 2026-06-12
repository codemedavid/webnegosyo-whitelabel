import { create } from 'zustand'
import { supabase } from '../lib/supabase'

interface AuthState {
  isLoading: boolean
  isAuthenticated: boolean
  userId: string | null
  tenantId: string | null
  tenantSlug: string | null
  tenantName: string | null
  convexUrl: string | null
  error: string | null
  login: (email: string, password: string) => Promise<void>
  restore: () => Promise<void>
  logout: () => Promise<void>
}

async function resolveTenant(userId: string): Promise<{
  tenantId: string
  tenantSlug: string
  tenantName: string
  convexUrl: string | null
}> {
  const { data: appUser, error: appUserError } = await supabase
    .from('app_users')
    .select('tenant_id, role')
    .eq('user_id', userId)
    .in('role', ['admin', 'superadmin'])
    .single()

  if (appUserError || !appUser) {
    throw new Error('This account is not a merchant admin.')
  }

  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('id, slug, name, convex_deployment_url')
    .eq('id', appUser.tenant_id)
    .single()

  if (tenantError || !tenant) {
    throw new Error('Could not load your store. Please try again.')
  }

  return {
    tenantId: tenant.id as string,
    tenantSlug: tenant.slug as string,
    tenantName: tenant.name as string,
    convexUrl: (tenant.convex_deployment_url as string | null) ?? null,
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  isLoading: true,
  isAuthenticated: false,
  userId: null,
  tenantId: null,
  tenantSlug: null,
  tenantName: null,
  convexUrl: null,
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null })
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (error || !data.user) {
        throw new Error(error?.message ?? 'Invalid email or password.')
      }
      const tenant = await resolveTenant(data.user.id)
      set({
        isLoading: false,
        isAuthenticated: true,
        userId: data.user.id,
        ...tenant,
        error: null,
      })
    } catch (err) {
      await supabase.auth.signOut().catch(() => undefined)
      set({
        isLoading: false,
        isAuthenticated: false,
        error: err instanceof Error ? err.message : 'Login failed.',
      })
    }
  },

  restore: async () => {
    try {
      const { data } = await supabase.auth.getSession()
      const user = data.session?.user
      if (!user) {
        set({ isLoading: false })
        return
      }
      const tenant = await resolveTenant(user.id)
      set({ isLoading: false, isAuthenticated: true, userId: user.id, ...tenant })
    } catch {
      set({ isLoading: false, isAuthenticated: false })
    }
  },

  logout: async () => {
    await supabase.auth.signOut().catch(() => undefined)
    set({
      isLoading: false,
      isAuthenticated: false,
      userId: null,
      tenantId: null,
      tenantSlug: null,
      tenantName: null,
      convexUrl: null,
      error: null,
    })
  },
}))
