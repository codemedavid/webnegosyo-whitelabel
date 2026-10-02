import { z } from 'zod'
import { validatePermissionKeys } from '@/lib/staff-permissions'
import {
  hasPlatformPermission,
  normalizePlatformPermissions,
} from '@/lib/platform-staff/permissions'

/**
 * The superadmin Team page: creating, re-scoping and removing platform staff.
 *
 * Only `platform_staff` rows are ever touched here. A superadmin row or a
 * store's admin row is refused outright, so the page cannot demote the owner,
 * delete a merchant's login, or mint another superadmin. Callers must already
 * be full superadmins (`requireFullSuperadmin`); nothing here re-checks that.
 *
 * Storage is injected (`TeamStore`) so the rules are testable without Supabase.
 */

export interface TeamMemberRow {
  user_id: string
  role: 'platform_staff'
  tenant_id: null
  is_owner: false
  email: string
  display_name: string
  platform_permissions: string[]
  /** Store-dashboard feature list (tenant staff keys); null = every feature. */
  permissions: string[] | null
}

export interface TeamMemberSummary {
  user_id: string
  role: 'superadmin' | 'platform_staff'
  email: string | null
  display_name: string | null
  platform_permissions: string[] | null
  permissions: string[] | null
  created_at: string
}

export interface TeamStore {
  listMembers: () => Promise<TeamMemberSummary[]>
  findRole: (userId: string) => Promise<string | null>
  createAuthUser: (email: string, password: string) => Promise<{ id: string }>
  deleteAuthUser: (userId: string) => Promise<void>
  insertMember: (row: TeamMemberRow) => Promise<void>
  updateMember: (
    userId: string,
    patch: Pick<TeamMemberRow, 'display_name' | 'platform_permissions' | 'permissions'>
  ) => Promise<void>
  setPassword: (userId: string, password: string) => Promise<void>
}

const MIN_PASSWORD_LENGTH = 8
const MAX_NAME_LENGTH = 80

const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  .max(72, 'Password must be at most 72 characters')

const grantsSchema = z.object({
  display_name: z.string().trim().min(1, 'Enter a name').max(MAX_NAME_LENGTH, 'Name is too long'),
  platform_permissions: z.array(z.string()),
  store_features: z.array(z.string()).nullable(),
})

const createSchema = grantsSchema.extend({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address')),
  password: passwordSchema,
})

const updateSchema = grantsSchema.extend({ user_id: z.uuid('Invalid team member') })

const passwordResetSchema = z.object({ user_id: z.uuid('Invalid team member'), password: passwordSchema })

function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? 'Invalid input')
  }
  return result.data
}

/** Grants in their stored shape; the feature list only means something with store access. */
function resolveGrants(input: z.infer<typeof grantsSchema>) {
  const platform_permissions = normalizePlatformPermissions(input.platform_permissions)
  const hasStoreAccess = hasPlatformPermission({ role: 'platform_staff', platform_permissions }, 'stores.view')
  const permissions =
    hasStoreAccess && input.store_features !== null ? validatePermissionKeys(input.store_features) : null

  return { display_name: input.display_name, platform_permissions, permissions }
}

async function assertTeamMember(store: TeamStore, userId: string): Promise<void> {
  const role = await store.findRole(userId)
  if (role !== 'platform_staff') {
    throw new Error('That account is not a team member and cannot be changed here')
  }
}

export async function createTeamMember(store: TeamStore, input: unknown): Promise<TeamMemberRow> {
  const parsed = parseOrThrow(createSchema, input)
  const grants = resolveGrants(parsed)

  const { id } = await store.createAuthUser(parsed.email, parsed.password)
  const row: TeamMemberRow = {
    user_id: id,
    role: 'platform_staff',
    tenant_id: null,
    is_owner: false,
    email: parsed.email,
    ...grants,
  }

  try {
    await store.insertMember(row)
  } catch (error) {
    // A login without an app_users row can sign in but reaches nothing; still,
    // it would squat the email address. Roll it back.
    await store.deleteAuthUser(id).catch((cleanupError: unknown) => {
      console.error('[team-service] could not roll back auth user', id, cleanupError)
    })
    throw error
  }

  return row
}

export async function updateTeamMember(store: TeamStore, input: unknown): Promise<void> {
  const parsed = parseOrThrow(updateSchema, input)
  const grants = resolveGrants(parsed)
  await assertTeamMember(store, parsed.user_id)
  await store.updateMember(parsed.user_id, grants)
}

/** Deletes the login itself; the app_users row cascades with it. */
export async function removeTeamMember(store: TeamStore, userId: unknown): Promise<void> {
  const id = parseOrThrow(z.uuid('Invalid team member'), userId)
  await assertTeamMember(store, id)
  await store.deleteAuthUser(id)
}

export async function resetTeamMemberPassword(store: TeamStore, input: unknown): Promise<void> {
  const parsed = parseOrThrow(passwordResetSchema, input)
  await assertTeamMember(store, parsed.user_id)
  await store.setPassword(parsed.user_id, parsed.password)
}
