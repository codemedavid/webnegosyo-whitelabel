import { KeyRound } from 'lucide-react'
import { getCachedTenantBySlug } from '@/lib/cache'
import { resolveMerchantMcpConnectUrl } from '@/lib/mcp/connect-url'
import { listMerchantMcpKeysAction } from '@/app/actions/merchant-mcp-keys'
import { MerchantMcpKeysManager } from '@/components/admin/merchant-mcp-keys-manager'
import { Card, CardContent } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

/**
 * Tenant admin "Connect AI" page: mint/revoke the Bearer keys that let Claude
 * or ChatGPT manage this store through the merchant MCP endpoint. Auth is
 * enforced by the admin layout and re-verified inside every server action;
 * visibility is gated by the tenant's `mcp_enabled` flag.
 */
export default async function MerchantMcpPage({
  params,
}: {
  params: Promise<{ tenant: string }>
}) {
  const { tenant: tenantSlug } = await params
  const tenant = await getCachedTenantBySlug(tenantSlug)
  const isMcpEnabled =
    (tenant as unknown as { mcp_enabled?: boolean | null } | null)?.mcp_enabled === true

  if (!isMcpEnabled) {
    return (
      <div className="space-y-6">
        <PageTitle />
        <Card>
          <CardContent className="flex flex-col items-center gap-2 px-6 py-16 text-center">
            <KeyRound className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm font-medium">AI connections are not enabled for this store yet.</p>
            <p className="text-sm text-muted-foreground">
              Contact WebNegosyo support to enable Claude / ChatGPT access for your store.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const keys = await listMerchantMcpKeysAction()
  const connectUrl = resolveMerchantMcpConnectUrl({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    PLATFORM_ROOT_DOMAIN: process.env.PLATFORM_ROOT_DOMAIN,
  })

  return (
    <div className="space-y-6">
      <PageTitle />
      <MerchantMcpKeysManager initialKeys={keys} connectUrl={connectUrl} />
    </div>
  )
}

function PageTitle() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Connect AI</h1>
      <p className="text-muted-foreground">
        Let Claude or ChatGPT manage your menu, promos and analytics — keys only ever work on this store.
      </p>
    </div>
  )
}
