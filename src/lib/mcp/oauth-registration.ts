import { z } from 'zod'

/**
 * Validation for RFC 7591 Dynamic Client Registration. The endpoint is open by
 * design (MCP clients register themselves), so every field is capped and every
 * redirect URI must be one a real client could use:
 *
 * - `https:` anywhere;
 * - `http:` only on a loopback host (RFC 8252 §7.3 native apps);
 * - a private-use scheme for native apps (RFC 8252 §7.1) — Cursor registers
 *   `cursor://anysphere.cursor-mcp/...` — except schemes a browser would run or
 *   read locally (`javascript:`, `data:`, `file:` …).
 *
 * No fragments (RFC 6749 §3.1.2) and no embedded credentials.
 */

export const MAX_CLIENT_NAME_LENGTH = 100
export const MAX_REDIRECT_URIS = 10
export const MAX_REDIRECT_URI_LENGTH = 2048
const DEFAULT_CLIENT_NAME = 'MCP Client'

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['127.0.0.1', 'localhost', '[::1]'])

/** Schemes that execute, read local data or leave the browser for something other than an app callback. */
const FORBIDDEN_SCHEMES: ReadonlySet<string> = new Set([
  'javascript:', 'vbscript:', 'data:', 'blob:', 'file:', 'filesystem:', 'about:', 'view-source:',
  'ftp:', 'ws:', 'wss:', 'mailto:', 'tel:', 'sms:', 'intent:',
])

export function isAcceptableRedirectUri(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.hash || value.includes('#')) return false
  if (url.username || url.password) return false
  if (url.protocol === 'https:') return url.hostname !== ''
  if (url.protocol === 'http:') return LOOPBACK_HOSTS.has(url.hostname)
  return !FORBIDDEN_SCHEMES.has(url.protocol)
}

const registrationSchema = z.object({
  client_name: z.string().trim().max(MAX_CLIENT_NAME_LENGTH).optional(),
  redirect_uris: z
    .array(z.string().max(MAX_REDIRECT_URI_LENGTH))
    .min(1)
    .max(MAX_REDIRECT_URIS),
})

export interface ClientRegistration {
  client_name: string
  redirect_uris: string[]
}

export type RegistrationParseResult =
  | { ok: true; value: ClientRegistration }
  | { ok: false; error: 'invalid_client_metadata' | 'invalid_redirect_uri'; description: string }

export function parseClientRegistration(body: unknown): RegistrationParseResult {
  const parsed = registrationSchema.safeParse(body)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'invalid_client_metadata',
      description: `client_name must be at most ${MAX_CLIENT_NAME_LENGTH} characters and redirect_uris must hold `
        + `1-${MAX_REDIRECT_URIS} strings of at most ${MAX_REDIRECT_URI_LENGTH} characters`,
    }
  }

  const badUri = parsed.data.redirect_uris.find((uri) => !isAcceptableRedirectUri(uri))
  if (badUri !== undefined) {
    return {
      ok: false,
      error: 'invalid_redirect_uri',
      description: 'redirect_uris must be https, http on a loopback host, or a native app scheme',
    }
  }

  return {
    ok: true,
    value: {
      client_name: parsed.data.client_name || DEFAULT_CLIENT_NAME,
      redirect_uris: parsed.data.redirect_uris,
    },
  }
}
