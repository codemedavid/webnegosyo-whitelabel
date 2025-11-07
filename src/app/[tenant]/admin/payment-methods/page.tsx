import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PaymentMethodsManagement } from './payment-methods-management'
import type { Tenant } from '@/types/database'

interface PaymentMethodsPageProps {
  params: Promise<{ tenant: string }>
}

export default async function PaymentMethodsPage({ params }: PaymentMethodsPageProps) {
  const resolvedParams = await params
  const supabase = await createClient()

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/${resolvedParams.tenant}/login`)
  }

  // Verify admin access
  const { data: appUser } = await supabase
    .from('app_users')
    .select('role, tenant_id')
    .eq('user_id', user.id)
    .single<{ role: string; tenant_id: string }>()

  if (!appUser || (appUser.role !== 'superadmin' && appUser.role !== 'admin')) {
    redirect(`/${resolvedParams.tenant}/menu`)
  }

  // Get tenant
  const { data: tenant } = await supabase
    .from('tenants')
    .select('*')
    .eq('slug', resolvedParams.tenant)
    .single<Tenant>()

  if (!tenant) {
    redirect('/')
  }

  // Verify admin belongs to this tenant (unless superadmin)
  if (appUser.role === 'admin' && appUser.tenant_id !== tenant.id) {
    redirect(`/${resolvedParams.tenant}/menu`)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Payment Methods</h1>
        <p className="text-gray-600 mt-2">
          Manage payment methods and their availability for different order types
        </p>
      </div>

      <Suspense
        fallback={
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          </div>
        }
      >
        <PaymentMethodsManagement tenantId={tenant.id} tenantSlug={resolvedParams.tenant} />
      </Suspense>
    </div>
  )
}

