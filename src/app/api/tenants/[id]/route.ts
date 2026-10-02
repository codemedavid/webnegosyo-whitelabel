import { NextRequest, NextResponse } from 'next/server'
import { getConsoleCaller } from '@/lib/platform-staff/guard'
import { hasPlatformPermission } from '@/lib/platform-staff/permissions'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

/**
 * DELETE /api/tenants/[id]
 * Deletes a tenant and all associated data (cascade via RLS/FK).
 * Requires the `tenants.delete` console grant.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: tenantId } = await params

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant ID is required' }, { status: 400 })
    }

    // Verify the console caller may delete restaurants
    const caller = await getConsoleCaller()

    if (!caller) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!hasPlatformPermission(caller.appUser, 'tenants.delete')) {
      return NextResponse.json(
        { error: 'You do not have access to delete restaurants' },
        { status: 403 }
      )
    }
    const { user } = caller

    // Use admin client for deletion to bypass RLS
    const adminClient = createAdminClient()

    // Verify tenant exists
    const { data: tenant, error: fetchError } = await adminClient
      .from('tenants')
      .select('id, name')
      .eq('id', tenantId)
      .single()

    if (fetchError || !tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    // Delete associated admin users from app_users (and their auth accounts)
    const { data: tenantUsers } = await adminClient
      .from('app_users')
      .select('user_id')
      .eq('tenant_id', tenantId)

    if (tenantUsers && tenantUsers.length > 0) {
      for (const appUserRow of tenantUsers) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const userId = (appUserRow as any).user_id
        // Don't delete the current superadmin's auth account
        if (userId !== user.id) {
          await adminClient.auth.admin.deleteUser(userId)
        }
      }
      // Delete app_users entries
      await adminClient
        .from('app_users')
        .delete()
        .eq('tenant_id', tenantId)
    }

    // Delete related data in order (respecting FK constraints).
    // `order_items` has no tenant_id column — it cascades from `orders`
    // (order_items_order_id_fkey ON DELETE CASCADE), so deleting orders is
    // enough. Menu items depend on categories.
    await adminClient.from('orders').delete().eq('tenant_id', tenantId)
    await adminClient.from('menu_items').delete().eq('tenant_id', tenantId)
    await adminClient.from('categories').delete().eq('tenant_id', tenantId)

    // Delete the tenant itself
    const { error: deleteError } = await adminClient
      .from('tenants')
      .delete()
      .eq('id', tenantId)

    if (deleteError) {
      return NextResponse.json(
        { error: `Failed to delete tenant: ${deleteError.message}` },
        { status: 500 }
      )
    }

    // Revalidate cached data
    revalidatePath('/superadmin')
    revalidatePath('/superadmin/tenants')

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Delete Tenant] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete tenant' },
      { status: 500 }
    )
  }
}
