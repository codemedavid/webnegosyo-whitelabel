const MCP_WELL_KNOWN_PREFIXES = [
  '/.well-known/oauth-protected-resource',
  '/.well-known/oauth-authorization-server',
  '/.well-known/openid-configuration',
] as const

/** Protocol endpoints own their authentication and must bypass app sessions. */
export function isMcpProtocolRoute(pathname: string): boolean {
  return pathname.startsWith('/api/mcp/') || MCP_WELL_KNOWN_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}
