import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

/**
 * DELETE /api/tenants/[id]
 * Deletes a tenant and all associated data (cascade via RLS/FK).
 * Requires superadmin role.
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

    // Verify user is superadmin
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: appUser } = await supabase
      .from('app_users')
      .select('role')
      .eq('user_id', user.id)
      .single() as { data: { role: string } | null }

    if (!appUser || appUser.role !== 'superadmin') {
      return NextResponse.json(
        { error: 'Superadmin access required' },
        { status: 403 }
      )
    }

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

    // Delete related data in order (respecting FK constraints)
    // Order items depend on orders, menu items depend on categories
    await adminClient.from('order_items').delete().eq('tenant_id', tenantId)
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
