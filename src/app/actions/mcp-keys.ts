'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireFullSuperadmin, requirePlatformPermission } from '@/lib/platform-staff/guard'
import type { PlatformPermission } from '@/lib/platform-staff/permissions'
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
 * (console grant `mcp_keys.*`; creating a key needs a full superadmin because the
 * key itself acts as one) and then operates through the service-role client. The
 * plaintext key returned by {@link createMcpKeyAction} is shown once and never
 * re-derivable — the store keeps only its SHA-256 hash.
 */

const labelSchema = z.string().trim().min(1, 'Label is required').max(120, 'Label is too long')
const idSchema = z.string().uuid('Invalid key id')

/** Verifies the console caller holds `permission`; returns their user id. */
async function verifyConsolePermission(permission: PlatformPermission): Promise<string> {
  const { user } = await requirePlatformPermission(permission)
  return user.id
}

export async function listMcpKeysAction(): Promise<McpKeySummary[]> {
  await verifyConsolePermission('mcp_keys.view')
  return listMcpKeys(createAdminClient())
}

export async function createMcpKeyAction(label: string): Promise<CreatedMcpKey> {
  const { user } = await requireFullSuperadmin()
  const userId = user.id
  const parsedLabel = labelSchema.parse(label)
  const created = await createMcpKey(createAdminClient(), parsedLabel, userId)
  revalidatePath('/superadmin/mcp-keys')
  return created
}

export async function revokeMcpKeyAction(id: string): Promise<McpKeySummary> {
  await verifyConsolePermission('mcp_keys.delete')
  const parsedId = idSchema.parse(id)
  const summary = await revokeMcpKey(createAdminClient(), parsedId)
  revalidatePath('/superadmin/mcp-keys')
  return summary
}
