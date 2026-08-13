import { PageHeader } from '@/components/superadmin/ui/primitives'
import { McpKeysManager } from '@/components/superadmin/mcp-keys-manager'
import { listMcpKeysAction } from '@/app/actions/mcp-keys'
import { resolveMcpConnectUrl } from '@/lib/mcp/connect-url'

export const dynamic = 'force-dynamic'

export default async function McpKeysPage() {
  const keys = await listMcpKeysAction()
  const connectUrl = resolveMcpConnectUrl({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    PLATFORM_ROOT_DOMAIN: process.env.PLATFORM_ROOT_DOMAIN,
  })

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Smart Menu"
        title="MCP Keys"
        subtitle="Generate and revoke Bearer keys that let Claude or ChatGPT drive tenant provisioning."
      />
      <McpKeysManager initialKeys={keys} connectUrl={connectUrl} />
    </div>
  )
}
