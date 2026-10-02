import { StaffManagementCard } from '@/components/admin/staff-management-card'
import { SettingsSection } from '@/components/admin/settings/settings-section'
import { listStaffAction } from '@/app/actions/staff'
import { requireSettingsSection } from '@/lib/settings/load-settings-context'
import { createClient } from '@/lib/supabase/server'
import type { StaffRecord } from '@/lib/staff-service'

async function loadOutlets(tenantId: string): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('outlets')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .order('sort_order', { ascending: true })
  if (error) {
    // Without branches the roster still works; it just shows no branch column.
    console.error('[settings] could not read outlets:', error.message)
    return []
  }
  return (data as { id: string; name: string }[] | null) ?? []
}

export default async function TeamSettingsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: tenantSlug } = await params
  const { tenant } = await requireSettingsSection(tenantSlug, 'team')

  const [staffResult, outlets] = await Promise.all([listStaffAction(tenant.id), loadOutlets(tenant.id)])
  const staff: StaffRecord[] = staffResult.success ? staffResult.data : []

  return (
    <SettingsSection tenantSlug={tenantSlug} section="team">
      {/* The owner, or a branch admin for its own branch. Outlets are empty for
          every single-location store, which renders the card without branches. */}
      <StaffManagementCard tenantId={tenant.id} tenantSlug={tenantSlug} staff={staff} outlets={outlets} />
    </SettingsSection>
  )
}
