import 'server-only'
import { isIP } from 'node:net'

/**
 * Trust a provider header only when deployment configuration asserts that all
 * requests enter through that provider. Vercel supplies this header itself:
 * https://vercel.com/docs/headers/request-headers#x-vercel-forwarded-for
 * Self-hosted/proxied origins need their own reviewed adapter; never fall back
 * to arbitrary forwarded headers, a body IP, or a shared "unknown" identity.
 */
export function getLoyaltyTrustedIp(
  headers: Headers, env: Record<string, string | undefined> = process.env,
): string | null {
  if (env.VERCEL !== '1' || env.LOYALTY_PUBLIC_TRUSTED_INGRESS !== 'vercel') return null
  const ip = headers.get('x-vercel-forwarded-for')
  return ip && ip.length <= 45 && !ip.includes('%') && isIP(ip) ? ip : null
}
