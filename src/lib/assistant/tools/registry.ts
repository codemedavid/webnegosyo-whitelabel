/**
 * The assistant's tool contract and the pure checks around it.
 *
 * The tenant is NEVER a tool input: every tool reads `ctx.tenantId`, which the
 * route resolved from the caller's session (the merchant-MCP rule, injection
 * not validation — src/lib/mcp/merchant-ops.ts). A tool is offered to the
 * model only when the caller holds its permission and the store has the
 * feature, so a cashier's assistant cannot even name the staff-activity tool.
 */

import type { z } from 'zod'
import { canManageStaff, hasPermission, type PermissionHolder, type StaffPermissionKey } from '@/lib/staff-permissions'
import { MAX_FACTS_CHARS } from '@/lib/assistant/config'
import { isUuidLike, type RefBook } from '@/lib/assistant/refs'
import type { ToolResult } from '@/lib/assistant/types'

export interface AssistantCaller extends PermissionHolder {
  userId: string
}

/** Store switches a tool may depend on. */
export interface AssistantTenantFlags {
  inventoryEnabled: boolean
  customerHubOn: boolean
  menuEngineeringEnabled: boolean
}

export interface AssistantToolContext {
  tenantId: string
  tenantSlug: string
  /** Proposals are filed under it so later turns learn their outcome. */
  conversationId: string
  caller: AssistantCaller
  flags: AssistantTenantFlags
  refs: RefBook
  /** Menu photos attached to THIS message (data URLs); empty on every other turn. */
  photos: readonly string[]
  /** One read per key per turn: several tools in one answer share the menu read. */
  memo<T>(key: string, load: () => Promise<T>): Promise<T>
}

/** A per-turn memo for `AssistantToolContext.memo`. */
export function createTurnMemo(): AssistantToolContext['memo'] {
  const cache = new Map<string, Promise<unknown>>()
  return <T>(key: string, load: () => Promise<T>): Promise<T> => {
    const hit = cache.get(key)
    if (hit) return hit as Promise<T>
    const pending = load().catch((error: unknown) => {
      cache.delete(key)
      throw error
    })
    cache.set(key, pending)
    return pending
  }
}

export type ToolAccess = { permission: StaffPermissionKey } | { ownerOnly: true }

export interface AssistantToolDef<I = unknown> {
  name: string
  /** Terse: every word is paid for on every turn (it sits in the cached prefix). */
  description: string
  access: ToolAccess
  /** Store features the tool needs; absent means always available. */
  isAvailable?: (flags: AssistantTenantFlags) => boolean
  input: z.ZodType<I>
  /** Overrides TOOL_TIMEOUT_MS for a tool that waits on a slow model (reading photos). */
  timeoutMs?: number
  run(ctx: AssistantToolContext, input: I): Promise<ToolResult>
}

export function canUseTool(def: AssistantToolDef, caller: PermissionHolder, flags: AssistantTenantFlags): boolean {
  const permitted = 'ownerOnly' in def.access ? canManageStaff(caller) : hasPermission(caller, def.access.permission)
  return permitted && (def.isAvailable?.(flags) ?? true)
}

/** The tools this caller may use, in registry order (stable order keeps the prompt prefix cacheable). */
export function availableTools(
  defs: readonly AssistantToolDef[],
  caller: PermissionHolder,
  flags: AssistantTenantFlags,
): AssistantToolDef[] {
  return defs.filter((def) => canUseTool(def, caller, flags))
}

const MAX_LIST_ITEMS_WHEN_TRIMMED = 8
const UUID_GLOBAL = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

function scrubIds(value: unknown): unknown {
  if (typeof value === 'string') return isUuidLike(value) ? value.replace(UUID_GLOBAL, '[id]') : value
  if (Array.isArray(value)) return value.map(scrubIds)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, scrubIds(inner)]))
  }
  return value
}

function trimLists(value: unknown): unknown {
  if (Array.isArray(value)) return value.slice(0, MAX_LIST_ITEMS_WHEN_TRIMMED).map(trimLists)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, trimLists(inner)]))
  }
  return value
}

/**
 * The facts exactly as the model will read them: raw ids scrubbed (a tool that
 * forgot to map one to a ref leaks nothing) and oversized payloads trimmed, so
 * one chatty tool cannot blow the turn's token budget.
 */
export function factsForModel(result: ToolResult): Record<string, unknown> {
  const scrubbed = scrubIds(result.facts) as Record<string, unknown>
  if (JSON.stringify(scrubbed).length <= MAX_FACTS_CHARS) return scrubbed
  return { ...(trimLists(scrubbed) as Record<string, unknown>), truncated: true }
}

interface StoredPartLike {
  type: string
  output?: unknown
  [key: string]: unknown
}

function isStoredToolPart(part: StoredPartLike): boolean {
  return part.type.startsWith('tool-') || part.type === 'dynamic-tool'
}

function toModelSafeOutput(output: unknown): unknown {
  if (!output || typeof output !== 'object') return output
  const facts = (output as { facts?: unknown }).facts
  // Anything that is not a tool result is withheld rather than forwarded raw.
  if (!facts || typeof facts !== 'object') return { facts: {} }
  return { facts: factsForModel({ facts: facts as Record<string, unknown> }) }
}

/**
 * Stored tool outputs cut down to the facts the model may read, BEFORE the
 * history is converted for the model. `toModelOutput` only runs for tools in
 * THIS turn's tool set; a tool the caller has since lost (a revoked
 * permission, a store feature switched off, a retired tool) would otherwise
 * hand the model its whole stored output — the card with real names, ids and
 * amounts. The browser keeps the full parts; only the model's copy is cut.
 */
export function withModelSafeToolOutputs<M extends { parts: readonly StoredPartLike[] }>(messages: readonly M[]): M[] {
  return messages.map((message) => ({
    ...message,
    parts: message.parts.map((part) => (isStoredToolPart(part) && 'output' in part ? { ...part, output: toModelSafeOutput(part.output) } : part)),
  }))
}
