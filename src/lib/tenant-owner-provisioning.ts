/**
 * Creating the FIRST login for a store — the owner — from a provisioning
 * context (the MCP), where no cookie session exists.
 *
 * Mirrors `createTenantUser` in src/actions/users.ts (auth user, then the
 * app_users row, auth user deleted again if the row fails) but takes the
 * client as a parameter so the flow is testable with a stub and needs no
 * superadmin session. The one-owner rule is enforced BEFORE the auth user is
 * created, so a refused second owner never leaves an orphan login behind.
 */

import { randomBytes } from 'crypto'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { assertCanAddOwner, OWNER_PATCH, type OwnershipUser } from '@/lib/tenant-ownership'

export const tenantOwnerInputSchema = z.object({
  tenantId: z.string().uuid(),
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
  displayName: z.string().min(1).max(100).optional(),
})

export type TenantOwnerInput = z.infer<typeof tenantOwnerInputSchema>

export interface CreatedTenantOwner {
  userId: string
  email: string
  isOwner: true
  displayName: string | null
  /** Shown ONCE. The platform never stores or re-reads it. */
  password: string
  passwordGenerated: boolean
  loginUrl: string
  tenantSlug: string
}

// No 0/O/1/l/I so a password read aloud or copied from a chat survives intact.
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
const PASSWORD_LENGTH = 16

export function generateOwnerPassword(bytes: (n: number) => Buffer = randomBytes): string {
  const buf = bytes(PASSWORD_LENGTH)
  let out = ''
  for (let i = 0; i < PASSWORD_LENGTH; i += 1) {
    out += PASSWORD_ALPHABET[buf[i] % PASSWORD_ALPHABET.length]
  }
  return out
}

/** Where the new owner signs in. Env-derived so the URL matches the deployed host. */
export function resolveTenantLoginUrl(slug: string, env: NodeJS.ProcessEnv = process.env): string {
  const base = env.NEXT_PUBLIC_APP_URL ?? env.NEXT_PUBLIC_SITE_URL ?? (env.PLATFORM_ROOT_DOMAIN ? `https://${env.PLATFORM_ROOT_DOMAIN}` : '')
  const origin = base.replace(/\/+$/, '')
  return `${origin}/${slug}/login`
}

type Client = SupabaseClient<Database>

async function readTenantSlug(client: Client, tenantId: string): Promise<string> {
  const { data, error } = await client.from('tenants').select('id, slug').eq('id', tenantId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Tenant not found')
  return (data as { slug: string }).slug
}

async function listTenantUsers(client: Client, tenantId: string): Promise<OwnershipUser[]> {
  const { data, error } = await client
    .from('app_users')
    .select('user_id, role, is_owner, outlet_id')
    .eq('tenant_id', tenantId)
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as OwnershipUser[]
}

export async function createTenantOwnerWithClient(client: Client, rawInput: TenantOwnerInput): Promise<CreatedTenantOwner> {
  const input = tenantOwnerInputSchema.parse(rawInput)
  const slug = await readTenantSlug(client, input.tenantId)

  assertCanAddOwner(await listTenantUsers(client, input.tenantId))

  const passwordGenerated = !input.password
  const password = input.password ?? generateOwnerPassword()

  const { data: authData, error: authError } = await client.auth.admin.createUser({
    email: input.email,
    password,
    email_confirm: true,
  })
  if (authError) throw new Error(authError.message)
  if (!authData?.user) throw new Error('Failed to create the owner login')

  const { error: rowError } = await client
    .from('app_users')
    .insert({
      user_id: authData.user.id,
      role: 'admin',
      tenant_id: input.tenantId,
      email: input.email,
      display_name: input.displayName ?? null,
      ...OWNER_PATCH,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

  if (rowError) {
    const { error: cleanupError } = await client.auth.admin.deleteUser(authData.user.id)
    const suffix = cleanupError ? ` (cleanup of the auth user also failed: ${cleanupError.message})` : ''
    throw new Error(`${rowError.message}${suffix}`)
  }

  return {
    userId: authData.user.id,
    email: input.email,
    isOwner: true,
    displayName: input.displayName ?? null,
    password,
    passwordGenerated,
    loginUrl: resolveTenantLoginUrl(slug),
    tenantSlug: slug,
  }
}

export interface TenantUserSummary {
  user_id: string
  email: string | null
  display_name: string | null
  is_owner: boolean
  outlet_id: string | null
  permissions: string[] | null
}

export async function listTenantUsersWithClient(client: Client, tenantId: string): Promise<TenantUserSummary[]> {
  const { data, error } = await client
    .from('app_users')
    .select('user_id, email, display_name, is_owner, outlet_id, permissions')
    .eq('tenant_id', tenantId)
    .order('is_owner', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as TenantUserSummary[]
}
