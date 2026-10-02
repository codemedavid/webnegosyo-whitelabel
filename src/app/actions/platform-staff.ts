'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireFullSuperadmin } from '@/lib/platform-staff/guard'
import {
  createTeamMember,
  removeTeamMember,
  resetTeamMemberPassword,
  updateTeamMember,
  type TeamMemberSummary,
  type TeamStore,
} from '@/lib/platform-staff/team-service'

// Team management is superadmin-only by design: no platform staff grant can
// reach these actions, so no account can widen its own access.

interface ActionResult<T> {
  success: boolean
  data: T | null
  error: string | null
}

const TEAM_PATH = '/superadmin/team'

function makeTeamStore(): TeamStore {
  const admin = createAdminClient()

  return {
    listMembers: async () => {
      const { data, error } = await admin
        .from('app_users')
        .select('user_id, role, email, display_name, platform_permissions, permissions, created_at')
        .in('role', ['superadmin', 'platform_staff'])
        .order('created_at', { ascending: true })
      if (error) throw new Error(error.message)
      return (data ?? []) as unknown as TeamMemberSummary[]
    },
    findRole: async (userId) => {
      const { data, error } = await admin.from('app_users').select('role').eq('user_id', userId).maybeSingle()
      if (error) throw new Error(error.message)
      return (data as { role: string } | null)?.role ?? null
    },
    createAuthUser: async (email, password) => {
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
      if (error || !data.user) throw new Error(error?.message ?? 'Could not create the login')
      return { id: data.user.id }
    },
    deleteAuthUser: async (userId) => {
      const { error } = await admin.auth.admin.deleteUser(userId)
      if (error) throw new Error(error.message)
    },
    insertMember: async (row) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated types predate platform_permissions
      const { error } = await admin.from('app_users').insert(row as any)
      if (error) throw new Error(error.message)
    },
    updateMember: async (userId, patch) => {
      const { error } = await admin
        .from('app_users')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated types predate platform_permissions
        .update(patch as any)
        .eq('user_id', userId)
        .eq('role', 'platform_staff')
      if (error) throw new Error(error.message)
    },
    setPassword: async (userId, password) => {
      const { error } = await admin.auth.admin.updateUserById(userId, { password })
      if (error) throw new Error(error.message)
    },
  }
}

async function run<T>(label: string, work: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    await requireFullSuperadmin()
    const data = await work()
    return { success: true, data, error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Something went wrong'
    console.error(`[platform-staff] ${label} failed:`, message)
    return { success: false, data: null, error: message }
  }
}

export async function listTeamMembersAction(): Promise<ActionResult<TeamMemberSummary[]>> {
  return run('list', () => makeTeamStore().listMembers())
}

export async function createTeamMemberAction(input: unknown): Promise<ActionResult<{ user_id: string }>> {
  return run('create', async () => {
    const row = await createTeamMember(makeTeamStore(), input)
    revalidatePath(TEAM_PATH)
    return { user_id: row.user_id }
  })
}

export async function updateTeamMemberAction(input: unknown): Promise<ActionResult<null>> {
  return run('update', async () => {
    await updateTeamMember(makeTeamStore(), input)
    revalidatePath(TEAM_PATH)
    return null
  })
}

export async function removeTeamMemberAction(userId: unknown): Promise<ActionResult<null>> {
  return run('remove', async () => {
    await removeTeamMember(makeTeamStore(), userId)
    revalidatePath(TEAM_PATH)
    return null
  })
}

export async function resetTeamMemberPasswordAction(input: unknown): Promise<ActionResult<null>> {
  return run('reset-password', async () => {
    await resetTeamMemberPassword(makeTeamStore(), input)
    return null
  })
}
