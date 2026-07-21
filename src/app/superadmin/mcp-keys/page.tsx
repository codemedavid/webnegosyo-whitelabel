import { PageHeader } from '@/components/superadmin/ui/primitives'
import { McpKeysManager } from '@/components/superadmin/mcp-keys-manager'
import { listMcpKeysAction } from '@/app/actions/mcp-keys'

export const dynamic = 'force-dynamic'

/** Resolves the public MCP connect URL from configured env, with a safe fallback. */
function resolveConnectUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.PLATFORM_ROOT_DOMAIN ? `https://${process.env.PLATFORM_ROOT_DOMAIN}` : '')
  return `${base.replace(/\/$/, '')}/api/mcp/mcp`
}

export default async function McpKeysPage() {
  const keys = await listMcpKeysAction()

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Smart Menu"
        title="MCP Keys"
        subtitle="Generate and revoke Bearer keys that let Claude or ChatGPT drive tenant provisioning."
      />
      <McpKeysManager initialKeys={keys} connectUrl={resolveConnectUrl()} />
    </div>
  )
}
