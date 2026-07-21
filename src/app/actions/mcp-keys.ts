'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  listMcpKeys,
  createMcpKey,
  revokeMcpKey,
  type McpKeySummary,
  type CreatedMcpKey,
} from '@/lib/mcp-keys-service'

/**
 * Superadmin server actions for managing SmartMenu MCP API keys from the
 * `/superadmin/mcp-keys` UI. Every action authenticates via the cookie session
 * (superadmin only) and then operates through the service-role client. The
 * plaintext key returned by {@link createMcpKeyAction} is shown once and never
 * re-derivable — the store keeps only its SHA-256 hash.
 */

const labelSchema = z.string().trim().min(1, 'Label is required').max(120, 'Label is too long')
const idSchema = z.string().uuid('Invalid key id')

/** Verifies the caller is an authenticated superadmin; returns their user id. */
async function verifySuperadmin(): Promise<string> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error('Unauthorized: Not authenticated')
  }

  const { data: userRole } = await supabase
    .from('app_users')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()

  const role = userRole as { role: string } | null
  if (!role || role.role !== 'superadmin') {
    throw new Error('Forbidden: Superadmin access required')
  }

  return user.id
}

export async function listMcpKeysAction(): Promise<McpKeySummary[]> {
  await verifySuperadmin()
  return listMcpKeys(createAdminClient())
}

export async function createMcpKeyAction(label: string): Promise<CreatedMcpKey> {
  const userId = await verifySuperadmin()
  const parsedLabel = labelSchema.parse(label)
  const created = await createMcpKey(createAdminClient(), parsedLabel, userId)
  revalidatePath('/superadmin/mcp-keys')
  return created
}

export async function revokeMcpKeyAction(id: string): Promise<McpKeySummary> {
  await verifySuperadmin()
  const parsedId = idSchema.parse(id)
  const summary = await revokeMcpKey(createAdminClient(), parsedId)
  revalidatePath('/superadmin/mcp-keys')
  return summary
}
