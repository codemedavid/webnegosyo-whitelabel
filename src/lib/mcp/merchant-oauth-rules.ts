import { OAUTH_OFFLINE_SCOPE } from './oauth-config'
import { MERCHANT_OAUTH_PATHS, MERCHANT_OAUTH_SCOPE } from './merchant-config'

export function isSupportedMerchantScope(scope: string): boolean {
  const requested = scope.split(/\s+/).filter(Boolean)
  const allowed = new Set([MERCHANT_OAUTH_SCOPE, OAUTH_OFFLINE_SCOPE])
  return requested.includes(MERCHANT_OAUTH_SCOPE) && requested.every((item) => allowed.has(item))
}

export function resolveMerchantTokenAudience(
  origin: string,
  resource: string | undefined,
): string | null {
  const merchantAudience = `${origin}${MERCHANT_OAUTH_PATHS.mcp}`
  return !resource || resource === merchantAudience ? merchantAudience : null
}
